import { Resolver } from "node:dns/promises";

// DNS-Bestandsaufnahme einer Kunden-Domain. Liest nur öffentliche Einträge, braucht keine Zugangsdaten.
// Simulator für Test-Domains (.example, .test, .invalid) oder mit DNS_SIMULATOR=ja.

export type DnsEintrag = { typ: string; name: string; wert: string };
export type DnsStand = {
  domain: string;
  simuliert: boolean;
  nameserver: string[];
  eintraege: DnsEintrag[];
  dnsAnbieter: string | null;
  mailAnbieter: string | null;
  dnssec: boolean | null;
};

const ANBIETER: [RegExp, string][] = [
  [/ui-dns\.|ionos|1and1/i, "IONOS"],
  [/strato/i, "STRATO"],
  [/hetzner|your-server\.de/i, "Hetzner"],
  [/kasserver|all-inkl/i, "ALL-INKL"],
  [/cloudflare/i, "Cloudflare"],
  [/domainfactory|ispgateway/i, "domainfactory"],
  [/hosteurope/i, "Host Europe"],
  [/netcup/i, "netcup"],
  [/checkdomain/i, "checkdomain"],
  [/united-domains|udag/i, "united-domains"],
  [/godaddy|domaincontrol/i, "GoDaddy"],
  [/wix/i, "Wix"],
  [/jimdo/i, "Jimdo"],
  [/squarespace/i, "Squarespace"],
  [/goneo/i, "goneo"],
  [/webgo/i, "webgo"],
];
const MAIL: [RegExp, string][] = [
  [/outlook\.com|protection\.outlook/i, "Microsoft 365"],
  [/google\.com|googlemail/i, "Google Workspace"],
  [/ionos|kundenserver|1and1/i, "IONOS"],
  [/strato/i, "STRATO"],
  [/your-server\.de|hetzner/i, "Hetzner"],
  [/kasserver|all-inkl/i, "ALL-INKL"],
  [/mailbox\.org/i, "mailbox.org"],
  [/posteo/i, "Posteo"],
];

const erkenne = (liste: [RegExp, string][], werte: string[]) => liste.find(([r]) => werte.some((w) => r.test(w)))?.[1] ?? null;

export const istSimuliert = (domain: string) => process.env.DNS_SIMULATOR === "ja" || /\.(example|test|invalid|localhost)$/i.test(domain);

export function normDomain(eingabe: string): string {
  return eingabe.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#]/)[0].replace(/\.$/, "");
}

function simulator(domain: string): DnsStand {
  const eintraege: DnsEintrag[] = [
    { typ: "A", name: domain, wert: "217.160.0.10" },
    { typ: "CNAME", name: `www.${domain}`, wert: domain },
    { typ: "MX", name: domain, wert: `10 ${domain.replace(/\./g, "-")}.mail.protection.outlook.com` },
    { typ: "TXT", name: domain, wert: "v=spf1 include:spf.protection.outlook.com -all" },
    { typ: "TXT", name: domain, wert: "google-site-verification=simuliert123" },
    { typ: "TXT", name: `_dmarc.${domain}`, wert: "v=DMARC1; p=none" },
    { typ: "CNAME", name: `selector1._domainkey.${domain}`, wert: "selector1-simuliert._domainkey.onmicrosoft.com" },
  ];
  return { domain, simuliert: true, nameserver: ["ns1045.ui-dns.de", "ns1045.ui-dns.com"], eintraege, dnsAnbieter: "IONOS", mailAnbieter: "Microsoft 365", dnssec: false };
}

function resolver(): Resolver {
  const r = new Resolver({ timeout: 5000, tries: 2 });
  if (process.env.DNS_SERVER) r.setServers([process.env.DNS_SERVER]);
  return r;
}

async function sicher<T>(fn: () => Promise<T>, leer: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return leer;
  }
}

// Übliche DKIM-Selektoren der großen Mail-Anbieter (eine vollständige Liste gibt es im DNS nicht).
const DKIM = ["selector1", "selector2", "google", "default", "s1", "s2", "k1", "dkim", "mail"];

export async function bestandsaufnahme(eingabe: string): Promise<DnsStand> {
  const domain = normDomain(eingabe);
  if (istSimuliert(domain)) return simulator(domain);
  const r = resolver();
  const eintraege: DnsEintrag[] = [];
  const add = (typ: string, name: string, werte: string[]) => werte.forEach((wert) => eintraege.push({ typ, name, wert }));
  const nameserver = await sicher(() => r.resolveNs(domain), [] as string[]);
  add("A", domain, await sicher(() => r.resolve4(domain), []));
  add("AAAA", domain, await sicher(() => r.resolve6(domain), []));
  const wwwCname = await sicher(() => r.resolveCname(`www.${domain}`), [] as string[]);
  if (wwwCname.length) add("CNAME", `www.${domain}`, wwwCname);
  else add("A", `www.${domain}`, await sicher(() => r.resolve4(`www.${domain}`), []));
  const mx = await sicher(() => r.resolveMx(domain), [] as { priority: number; exchange: string }[]);
  add("MX", domain, mx.sort((a, b) => a.priority - b.priority).map((m) => `${m.priority} ${m.exchange}`));
  add("TXT", domain, (await sicher(() => r.resolveTxt(domain), [] as string[][])).map((t) => t.join("")));
  add("TXT", `_dmarc.${domain}`, (await sicher(() => r.resolveTxt(`_dmarc.${domain}`), [] as string[][])).map((t) => t.join("")));
  for (const s of DKIM) {
    const n = `${s}._domainkey.${domain}`;
    const c = await sicher(() => r.resolveCname(n), [] as string[]);
    if (c.length) add("CNAME", n, c);
    else add("TXT", n, (await sicher(() => r.resolveTxt(n), [] as string[][])).map((t) => t.join("")));
  }
  for (const sub of ["autodiscover", "mail", "webmail", "shop", "blog", "termin", "_sip._tls", "_autodiscover._tcp"]) {
    const n = `${sub}.${domain}`;
    const c = await sicher(() => r.resolveCname(n), [] as string[]);
    if (c.length) add("CNAME", n, c);
    if (sub.startsWith("_")) add("SRV", n, (await sicher(() => r.resolveSrv(n), [])).map((x) => `${x.priority} ${x.weight} ${x.port} ${x.name}`));
  }
  add("CAA", domain, (await sicher(() => r.resolveCaa(domain), [])).map((c) => `${c.critical} ${c.issue ? `issue "${c.issue}"` : c.issuewild ? `issuewild "${c.issuewild}"` : JSON.stringify(c)}`));
  return {
    domain,
    simuliert: false,
    nameserver,
    eintraege,
    dnsAnbieter: erkenne(ANBIETER, nameserver),
    mailAnbieter: erkenne(MAIL, mx.map((m) => m.exchange)),
    dnssec: null, // Node prüft DNSSEC nicht; vor einem Providerwechsel beim alten Anbieter nachsehen
  };
}

/** Zeigt die Domain (und www) schon auf unseren Server? Grundlage: SERVER_IP bzw. SERVER_HOST. */
export async function zeigtAufUns(eingabe: string): Promise<{ ok: boolean; detail: string }> {
  const domain = normDomain(eingabe);
  const ziel = process.env.SERVER_IP;
  if (istSimuliert(domain)) {
    const ok = process.env.DNS_SIMULATOR_UMGESTELLT === "ja";
    return { ok, detail: ok ? "Simulator: Domain zeigt auf Nexova" : "Simulator: Domain zeigt noch auf den alten Anbieter" };
  }
  if (!ziel) return { ok: false, detail: "SERVER_IP ist nicht gesetzt" };
  const r = resolver();
  const haupt = await sicher(() => r.resolve4(domain), [] as string[]);
  const www = await sicher(() => r.resolve4(`www.${domain}`), [] as string[]);
  const ok = haupt.includes(ziel) && (www.includes(ziel) || www.length === 0);
  return { ok, detail: `${domain} → ${haupt.join(", ") || "kein A-Eintrag"} · www → ${www.join(", ") || "kein Eintrag"} · Ziel ${ziel}` };
}
