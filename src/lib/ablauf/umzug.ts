import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { getDb, schema } from "../db";
import { einreihen } from "../jobs/warteschlange";
import { protokolliere } from "../protokoll";
import { datenOrdner } from "../pfade";
import { melde } from "../adapters/push";
import { bestandsaufnahme as dnsBestand, istSimuliert, normDomain, zeigtAufUns, type DnsStand } from "../adapters/dns";
import { verschluessele } from "../geheim";
import { portalLink } from "../kundenportal";
import { datumDe } from "../docs/basis";
import { inPostausgang } from "./postausgang";
import { hakeAb } from "./checkliste";
import { anschrift, betrieb, neuesDokument, SYSTEM } from "./gemeinsam";

// Umzug einer bestehenden Website zu Stelax. Grundsatz: Der Kunde bleibt Inhaber seiner Domain,
// seine E-Mail läuft unverändert weiter. Standard ist Weg A: Der Kunde (oder seine IT) ändert nur die
// Einträge für die Website. Weg B: Providerwechsel der Domain zu uns (AuthInfo), dann pflegen wir die ganze Zone.

export type Weg = "selbst" | "uebernehmen";
export type UmzugStatus = "geprueft" | "providerwechsel" | "wartet_dns" | "umgestellt";
export type AlteSeite = { pfad: string; ziel: string };
export type Umzug = {
  domain: string;
  weg: Weg;
  anbieterAngabe?: string;
  mailUeberDomain?: "ja" | "nein" | "unklar";
  vollmachtAm?: string;
  vollmachtVon?: string;
  rechteBestaetigt?: boolean;
  authInfo?: string; // verschlüsselt, wird nach dem Wechsel gelöscht
  status?: UmzugStatus;
  stand?: DnsStand;
  warnungen?: string[];
  alteSeiten?: AlteSeite[];
  gesichert?: number;
  geprueftAm?: string;
  wartetSeit?: string;
  erinnertAm?: string;
  letztePruefung?: { am: string; detail: string };
  umgestelltAm?: string;
};

async function projekt(id: number) {
  const db = await getDb();
  const [p] = await db.select().from(schema.projekte).where(eq(schema.projekte.id, id));
  if (!p) throw new Error("Projekt nicht gefunden");
  return p;
}

async function speichern(projektId: number, u: Umzug) {
  const db = await getDb();
  await db.update(schema.projekte).set({ umzug: u as Record<string, unknown> }).where(eq(schema.projekte.id, projektId));
}

export const umzugVon = (p: { umzug: Record<string, unknown> }): Umzug | null => (p.umzug && (p.umzug as Umzug).domain ? (p.umzug as Umzug) : null);

/** Angaben aus dem Kundenportal übernehmen. Ohne Auftrag (Vollmacht) kein Umzug. */
export async function umzugAnlegen(projektId: number, a: { domain: string; weg: Weg; anbieter: string; mail: string; vollmacht: boolean; rechte: boolean; authInfo: string; name: string }): Promise<void> {
  const domain = normDomain(a.domain);
  if (!domain) return;
  if (!/^[a-z0-9äöüß-]+(\.[a-z0-9äöüß-]+)+$/.test(domain)) throw new Error("Bitte die Domain im Format ihr-betrieb.de angeben.");
  if (!a.vollmacht) throw new Error("Für den Umzug Ihrer Domain brauchen wir Ihren Auftrag. Bitte das Häkchen beim Domain-Umzug setzen.");
  const u: Umzug = {
    domain,
    weg: a.weg === "uebernehmen" ? "uebernehmen" : "selbst",
    anbieterAngabe: a.anbieter || undefined,
    mailUeberDomain: (["ja", "nein"].includes(a.mail) ? a.mail : "unklar") as Umzug["mailUeberDomain"],
    vollmachtAm: new Date().toISOString(),
    vollmachtVon: a.name || "Kunde (Portal)",
    rechteBestaetigt: a.rechte,
    authInfo: a.weg === "uebernehmen" && a.authInfo.trim() ? verschluessele(a.authInfo.trim()) : undefined,
  };
  await speichern(projektId, u);
  await einreihen("umzug_bestand", { projektId });
}

/** Agent: DNS-Bestandsaufnahme, alte Seite sichern, Weiterleitungen planen, Risiken benennen. */
export async function bestandsaufnahme(projektId: number): Promise<string> {
  const p = await projekt(projektId);
  const u = umzugVon(p);
  if (!u) return "Kein Umzug";
  const stand = await dnsBestand(u.domain);
  const alt = await alteSeiteSichern(projektId, u.domain);
  const warnungen = risiken(u, stand);
  const neu: Umzug = { ...u, stand, warnungen, alteSeiten: alt.seiten, gesichert: alt.gesichert, geprueftAm: new Date().toISOString(), status: u.status ?? "geprueft" };
  await speichern(projektId, neu);
  await protokolliere(SYSTEM, `Domain ${u.domain} geprüft: ${stand.eintraege.length} DNS-Einträge, ${alt.gesichert} alte Seiten gesichert`, p.betriebId, warnungen.join(" · "));
  return `${u.domain}: ${warnungen.length} Hinweise`;
}

function risiken(u: Umzug, s: DnsStand): string[] {
  const w: string[] = [];
  const mx = s.eintraege.filter((e) => e.typ === "MX");
  if (mx.length) w.push(`E-Mail läuft über ${s.mailAnbieter ?? "einen Mail-Dienst"} (MX). Diese Einträge bleiben unverändert. Altes Paket erst kündigen, wenn klar ist, dass die Postfächer nicht dort liegen.`);
  if (u.mailUeberDomain === "ja" && !mx.length) w.push("Kunde sagt, E-Mail läuft über die Domain, aber es gibt keinen MX-Eintrag. Vor der Umstellung anrufen.");
  if (u.weg === "uebernehmen") w.push(`Providerwechsel: Vorher alle ${s.eintraege.length} Einträge (siehe Liste) in unserer DNS-Zone anlegen, sonst fallen E-Mail und Nachweise aus. AuthInfo gilt höchstens 30 Tage.`);
  if (u.weg === "uebernehmen" && !u.authInfo) w.push("AuthInfo fehlt noch. Kunde bekommt sie beim bisherigen Anbieter (Domain-Verwaltung → Umzug/Transfer).");
  if (s.eintraege.some((e) => e.typ === "CAA" && /issue/.test(e.wert)) && !s.eintraege.some((e) => e.typ === "CAA" && /letsencrypt/.test(e.wert)))
    w.push("CAA-Eintrag erlaubt Let's Encrypt nicht. Ohne Anpassung bekommt die Seite kein Zertifikat.");
  if (["Wix", "Jimdo", "Squarespace"].includes(s.dnsAnbieter ?? "")) w.push(`Domain liegt bei ${s.dnsAnbieter} (Baukasten). Erst die Domain umstellen oder übertragen, das Baukasten-Abo erst danach kündigen.`);
  if (s.dnsAnbieter === "Cloudflare") w.push("Cloudflare: Beim A-Eintrag den Proxy (orange Wolke) ausschalten, sonst klappt das Zertifikat nicht.");
  if (s.eintraege.some((e) => e.typ === "TXT" && /verification|verify|ms=/i.test(e.wert))) w.push("Bestätigungs-Einträge (z. B. Google, Microsoft) vorhanden. Nicht löschen.");
  if (s.eintraege.some((e) => /shop\.|blog\.|termin\./.test(e.name))) w.push("Es gibt weitere Subdomains (Shop, Blog oder Termine). Diese bleiben beim bisherigen Anbieter.");
  if (!s.nameserver.length && !s.simuliert) w.push("Domain nicht auflösbar. Schreibweise prüfen oder Kunde fragen.");
  return w;
}

/** Sichert die alte Startseite und die Seiten aus der Sitemap und plant 301-Weiterleitungen auf die neuen Seiten. */
async function alteSeiteSichern(projektId: number, domain: string): Promise<{ seiten: AlteSeite[]; gesichert: number }> {
  const ordner = datenOrdner("umzug", `projekt-${projektId}`);
  let pfade: string[] = [];
  if (istSimuliert(domain)) {
    pfade = ["/", "/kontakt.html", "/leistungen/heizung.html", "/ueber-uns", "/impressum.php", "/karriere/ausbildung"];
    fs.writeFileSync(path.join(ordner, "startseite.html"), `<!-- Simulator: Sicherung der alten Seite ${domain} -->`);
  } else {
    const holen = async (url: string) => {
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(10000), redirect: "follow", headers: { "User-Agent": "StelaxOS-Umzug/1.0" } });
        return r.ok ? await r.text() : null;
      } catch {
        return null;
      }
    };
    const start = (await holen(`https://${domain}/`)) ?? (await holen(`http://${domain}/`));
    const sitemap = await holen(`https://${domain}/sitemap.xml`);
    const gefunden = new Set<string>(["/"]);
    for (const m of sitemap?.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g) ?? []) gefunden.add(pfadAus(m[1], domain));
    for (const m of start?.matchAll(/href="([^"#]+)"/g) ?? []) gefunden.add(pfadAus(m[1], domain));
    pfade = [...gefunden].filter((x) => x && x.startsWith("/") && !/\.(jpg|jpeg|png|gif|webp|svg|css|js|pdf|ico|xml)$/i.test(x)).slice(0, 60);
    let n = 0;
    for (const x of pfade.slice(0, 30)) {
      const html = x === "/" ? start : await holen(`https://${domain}${x}`);
      if (!html) continue;
      fs.writeFileSync(path.join(ordner, `${n++}-${x.replace(/[^a-z0-9]+/gi, "_").slice(0, 60) || "start"}.html`), html);
    }
  }
  const seiten = pfade.filter((x) => x !== "/").map((x) => ({ pfad: x, ziel: zielFuer(x) }));
  return { seiten, gesichert: fs.readdirSync(ordner).length };
}

function pfadAus(href: string, domain: string): string {
  try {
    const u = new URL(href, `https://${domain}/`);
    return u.hostname.replace(/^www\./, "") === domain ? u.pathname.replace(/\/+$/, "") || "/" : "";
  } catch {
    return "";
  }
}

/** Alte Adresse → passende neue Seite (für 301-Weiterleitung, damit Google-Treffer und Lesezeichen weiter funktionieren). */
export function zielFuer(alt: string): string {
  const x = alt.toLowerCase();
  if (/kontakt|anfrage|anfahrt|contact/.test(x)) return "kontakt";
  if (/leistung|service|angebot|heizung|sanitaer|bad|elektro|maler|schrein|reparatur|wartung/.test(x)) return "leistungen";
  if (/karriere|job|stelle|ausbildung|bewerb/.test(x)) return "karriere";
  if (/impressum|imprint/.test(x)) return "impressum";
  if (/datenschutz|privacy/.test(x)) return "datenschutz";
  return "";
}

/** Beim Livegang: Weg A → Anleitung an den Kunden; Weg B → Aufgabe für Max (Providerwechsel). */
export async function umstellungStarten(projektId: number): Promise<void> {
  const p = await projekt(projektId);
  const u = umzugVon(p);
  if (!u) return;
  const b = await betrieb(p.betriebId);
  if (u.weg === "uebernehmen") {
    await speichern(projektId, { ...u, status: "providerwechsel" });
    await melde("job", false, `Providerwechsel: ${u.domain}`, `${b.name}: Zone bei Hetzner mit allen Einträgen aus der Bestandsaufnahme anlegen, dann Providerwechsel mit der AuthInfo beauftragen. Danach im Projekt „Providerwechsel erledigt“ klicken.`);
    await protokolliere(SYSTEM, `Providerwechsel für ${u.domain} vorbereitet`, b.id);
    return;
  }
  await speichern(projektId, { ...u, status: "wartet_dns", wartetSeit: new Date().toISOString() });
  const ip = process.env.SERVER_IP ?? "(SERVER_IP fehlt)";
  const mail = u.stand?.eintraege.filter((e) => e.typ === "MX").length;
  const dokId = await neuesDokument({
    betriebId: b.id,
    projektId,
    art: "umzugsanleitung",
    titel: `Anleitung Domain-Umstellung ${u.domain}`,
    daten: { an: anschrift(b), datum: datumDe(), domain: u.domain, ip, anbieter: u.stand?.dnsAnbieter ?? u.anbieterAngabe ?? null, mailAnbieter: u.stand?.mailAnbieter ?? null, mitMail: !!mail, cloudflare: u.stand?.dnsAnbieter === "Cloudflare" },
  });
  await inPostausgang({
    betriebId: b.id,
    projektId,
    kanal: "mail",
    zweck: "umzug_anleitung",
    empfaenger: b.email ?? "(E-Mail-Adresse fehlt)",
    betreff: `Ihre neue Website: ein letzter Schritt für ${u.domain}`,
    text: `Guten Tag,\n\nIhre neue Website ist fertig. Damit sie unter ${u.domain} erscheint, muss bei ${u.stand?.dnsAnbieter ?? u.anbieterAngabe ?? "Ihrem Domain-Anbieter"} ein Eintrag geändert werden. Das dauert etwa 5 Minuten. Die Anleitung im Anhang zeigt genau, was zu tun ist. Gern machen wir das auch gemeinsam am Telefon.\n\n${mail ? "Ihre E-Mail bleibt davon unberührt. Bitte ändern Sie nur die beiden genannten Einträge.\n\n" : ""}Sobald die Umstellung greift, merken wir das automatisch und melden uns. Bitte kündigen Sie Ihr altes Paket erst nach unserer Nachricht.\n\nMit freundlichen Grüßen\nMax Steiner\nStelax Consulting`,
    anhaenge: [dokId],
    hinweise: [...(u.warnungen ?? []), ...(process.env.SERVER_IP ? [] : ["SERVER_IP ist nicht gesetzt: Die Anleitung enthält keine echte Adresse."])],
    meta: { projektId },
  });
}

/** Nach Weg B: Max hat die Domain zu uns geholt. AuthInfo löschen, dann wie Weg A auf die Umstellung warten. */
export async function providerwechselErledigt(projektId: number, wer: string): Promise<void> {
  const p = await projekt(projektId);
  const u = umzugVon(p);
  if (!u || u.status !== "providerwechsel") throw new Error("Kein Providerwechsel offen.");
  await speichern(projektId, { ...u, authInfo: undefined, status: "wartet_dns", wartetSeit: new Date().toISOString() });
  await protokolliere(wer, `Providerwechsel ${u.domain} erledigt, AuthInfo gelöscht`, p.betriebId);
}

/** Agent (alle 15 Minuten): Zeigt die Domain auf uns? Dann Abnahme anfordern und Kündigungshinweis vorbereiten. */
export async function umstellungPruefen(jetzt = new Date()): Promise<string> {
  const db = await getDb();
  const live = await db.select().from(schema.projekte).where(eq(schema.projekte.status, "live"));
  let fertig = 0;
  for (const p of live) {
    const u = umzugVon(p);
    if (!u || u.status !== "wartet_dns") continue;
    const r = await zeigtAufUns(u.domain);
    if (!r.ok) {
      const tage = (jetzt.getTime() - new Date(u.wartetSeit ?? jetzt).getTime()) / 864e5;
      const erinnern = tage >= 7 && !u.erinnertAm;
      await speichern(p.id, { ...u, letztePruefung: { am: jetzt.toISOString(), detail: r.detail }, ...(erinnern ? { erinnertAm: jetzt.toISOString() } : {}) });
      if (erinnern) await melde("job", false, `Domain noch nicht umgestellt: ${u.domain}`, `Seit ${Math.floor(tage)} Tagen. Kunde anrufen und gemeinsam umstellen. ${r.detail}`);
      continue;
    }
    await speichern(p.id, { ...u, status: "umgestellt", umgestelltAm: jetzt.toISOString(), letztePruefung: { am: jetzt.toISOString(), detail: r.detail } });
    const b = await betrieb(p.betriebId);
    await protokolliere(SYSTEM, `Domain ${u.domain} zeigt auf Stelax`, b.id, r.detail);
    await hakeAb(p.id, "domain");
    await inPostausgang({
      betriebId: b.id,
      projektId: p.id,
      kanal: "mail",
      zweck: "umzug_fertig",
      empfaenger: b.email ?? "(E-Mail-Adresse fehlt)",
      betreff: `${u.domain} zeigt jetzt Ihre neue Website`,
      text: `Guten Tag,\n\ndie Umstellung hat geklappt: Unter ${u.domain} erscheint jetzt Ihre neue Website. Alte Adressen leiten wir automatisch auf die passenden neuen Seiten weiter, damit Google-Treffer und Lesezeichen weiter funktionieren.\n\nIhr altes Webhosting können Sie jetzt kündigen. Wichtig: Kündigen Sie nur das Webhosting, nicht die Domain${u.stand?.mailAnbieter && !/Microsoft|Google/.test(u.stand.mailAnbieter) ? ` und nicht Ihre E-Mail-Postfächer bei ${u.stand.mailAnbieter}` : ""}. Einen Mustertext finden Sie unten. Wenn Sie unsicher sind, rufen Sie uns vor der Kündigung an.\n\nMustertext:\n„Hiermit kündige ich das Webhosting zur Domain ${u.domain} zum nächstmöglichen Zeitpunkt. Die Domain${u.weg === "selbst" ? " und alle E-Mail-Postfächer" : ""} sind ausdrücklich nicht von der Kündigung erfasst. Bitte bestätigen Sie mir das Vertragsende.“\n\nMit freundlichen Grüßen\nMax Steiner\nStelax Consulting\n\nIhr Kundenportal: ${await portalLink(b.id)}`,
      meta: { projektId: p.id },
    });
    if (!p.abnahmeStatus) {
      const { abnahmeAnfordern } = await import("./vertrag");
      await abnahmeAnfordern(p.id, SYSTEM);
    }
    fertig++;
  }
  return `${fertig} Domains umgestellt`;
}

/** Sitzt diese Domain bei uns? Für die automatische Zertifikatsausstellung (Caddy on-demand TLS) und das Ausliefern. */
export async function projektFuerHost(host: string) {
  const domain = normDomain(host);
  if (!domain) return null;
  const db = await getDb();
  const alle = await db.select().from(schema.projekte).where(eq(schema.projekte.status, "live"));
  return alle.find((p) => (p.domain && normDomain(p.domain) === domain) || umzugVon(p)?.domain === domain) ?? null;
}
