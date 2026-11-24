import dns from "node:dns/promises";
import net from "node:net";
import tls from "node:tls";
import { eq } from "drizzle-orm";
import { getDb, schema } from "./db";
import { protokolliere } from "./protokoll";
import { entschluessele, verschluessele } from "./geheim";
import { istInterneAdresse } from "./sicherheit";

// Eigenes Postfach je Person: Mails, die Daniel unterschreibt, gehen von Daniels Postfach raus, die von Maximilian
// von seinem. Gesendet wird per SMTP; danach legen wir die Mail per IMAP in den Ordner „Gesendet“, damit sie dort
// wie in Outlook oder Apple Mail auftaucht. Ohne eigenes Postfach gilt der allgemeine Absender (info@, Coolify).
// Das Passwort liegt nur verschlüsselt in der Datenbank (Schlüssel aus SESSION_SECRET) und wird nie angezeigt.

export type Postfach = NonNullable<typeof schema.benutzer.$inferSelect.postfach>;
export type SmtpKonto = { host: string; port: number; benutzer: string; passwort: string; absender: string; name: string; imapHost: string; imapPort: number };

const SMTP_PORTS = [465, 587];
const IMAP_PORTS = [993];
const HOST = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;
const MAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Nur echte Mailserver im Internet: keine internen Adressen (Schutz davor, über das Formular ins Servernetz zu greifen). */
export async function hostPruefen(host: string): Promise<void> {
  if (!HOST.test(host)) throw new Error(`„${host}“ ist kein gültiger Servername (z. B. mx2f3a.netcup.net).`);
  const adressen = await dns.lookup(host, { all: true }).catch(() => []);
  if (!adressen.length) throw new Error(`Server „${host}“ nicht gefunden. Schreibweise prüfen.`);
  if (adressen.some((a) => istInterneAdresse(a.address))) throw new Error(`„${host}“ zeigt auf eine interne Adresse und ist nicht erlaubt.`);
}

export type PostfachEingabe = { host: string; port: number; benutzer: string; passwort: string; absender: string; name: string; imapHost?: string; imapPort?: number };

/** Eingaben prüfen, Verbindung testen, verschlüsselt speichern. Leeres Passwort = bisheriges behalten. */
export async function postfachSpeichern(benutzerId: number, e: PostfachEingabe, wer: string, o: { verbindungTesten?: boolean; hostPruefen?: boolean } = {}): Promise<void> {
  const db = await getDb();
  const [b] = await db.select().from(schema.benutzer).where(eq(schema.benutzer.id, benutzerId));
  if (!b) throw new Error("Benutzer nicht gefunden");
  const host = e.host.trim().toLowerCase();
  const imapHost = (e.imapHost?.trim() || host).toLowerCase();
  const port = Number(e.port) || 587;
  const imapPort = Number(e.imapPort) || 993;
  if (!SMTP_PORTS.includes(port)) throw new Error("SMTP-Port bitte 587 (STARTTLS) oder 465 (SSL).");
  if (!IMAP_PORTS.includes(imapPort)) throw new Error("IMAP-Port bitte 993 (SSL).");
  const absender = e.absender.trim().toLowerCase();
  if (!MAIL.test(absender)) throw new Error("Bitte die Absender-Adresse eintragen, z. B. m.steiner@levarex-consulting.de.");
  const benutzer = e.benutzer.trim() || absender;
  const name = e.name.trim() || b.name;
  const passwort = e.passwort || (b.postfach?.passwort ? entschluessele(b.postfach.passwort) : "");
  if (!passwort) throw new Error("Bitte das Passwort des Postfachs eintragen.");
  if (o.hostPruefen !== false) {
    await hostPruefen(host);
    if (imapHost !== host) await hostPruefen(imapHost);
  }
  const konto: SmtpKonto = { host, port, benutzer, passwort, absender, name, imapHost, imapPort };
  if (o.verbindungTesten !== false) await verbindungTesten(konto);
  await db
    .update(schema.benutzer)
    .set({ postfach: { host, port, benutzer, passwort: verschluessele(passwort), absender, name, imapHost, imapPort, geprueftAm: new Date().toISOString() } })
    .where(eq(schema.benutzer.id, benutzerId));
  await protokolliere(wer, `Eigenes Postfach eingerichtet: ${absender}`, null);
}

export async function postfachEntfernen(benutzerId: number, wer: string): Promise<void> {
  const db = await getDb();
  await db.update(schema.benutzer).set({ postfach: null }).where(eq(schema.benutzer.id, benutzerId));
  await protokolliere(wer, "Eigenes Postfach entfernt (Mails gehen wieder über den allgemeinen Absender)", null);
}

/** SMTP-Anmeldung prüfen (ohne etwas zu senden) und IMAP-Anmeldung prüfen. */
export async function verbindungTesten(k: SmtpKonto): Promise<void> {
  const nodemailer = await import("nodemailer");
  const t = nodemailer.createTransport({ host: k.host, port: k.port, secure: k.port === 465, requireTLS: k.port !== 465, auth: { user: k.benutzer, pass: k.passwort }, connectionTimeout: 15_000, greetingTimeout: 15_000 });
  await t.verify().catch((err: Error) => {
    throw new Error(`SMTP-Anmeldung fehlgeschlagen: ${err.message}`);
  });
  await imapSitzung(k, async () => undefined).catch((err: Error) => {
    throw new Error(`IMAP-Anmeldung fehlgeschlagen (für den Ordner „Gesendet“): ${err.message}`);
  });
}

/** Postfach eines Benutzers zum Senden (Passwort entschlüsselt) oder null. */
export function kontoAus(p: Postfach | null | undefined): SmtpKonto | null {
  if (!p) return null;
  try {
    return { host: p.host, port: p.port, benutzer: p.benutzer, passwort: entschluessele(p.passwort), absender: p.absender, name: p.name, imapHost: p.imapHost, imapPort: p.imapPort };
  } catch {
    return null; // Schlüssel geändert (SESSION_SECRET neu): Postfach muss neu eingerichtet werden
  }
}

/**
 * Von wessen Postfach geht dieser Eintrag raus?
 * 1. Wer die Mail unterschreibt (Name in den letzten Zeilen, z. B. „Daniel Lück“),
 * 2. sonst wer sie zuerst freigegeben hat,
 * 3. sonst niemand (allgemeiner Absender).
 * Nur Personen mit eingerichtetem Postfach zählen.
 */
export async function absenderFuer(e: { text: string; freigaben: { name: string }[] }): Promise<{ benutzer: string; konto: SmtpKonto } | null> {
  const db = await getDb();
  const alle = (await db.select().from(schema.benutzer)).filter((b) => b.aktiv && b.postfach);
  const schluss = e.text.split(/\r?\n/).slice(-6).join("\n");
  const kandidat = alle.find((b) => schluss.includes(b.name)) ?? alle.find((b) => b.name === e.freigaben[0]?.name);
  const konto = kandidat ? kontoAus(kandidat.postfach) : null;
  return kandidat && konto ? { benutzer: kandidat.name, konto } : null;
}

// ---------- IMAP (nur das Nötigste: anmelden, Ordner „Gesendet“ finden, Mail ablegen) ----------

type Zeile = (befehl: string, literal?: Buffer) => Promise<string[]>;

/** Öffnet eine IMAP-Sitzung über TLS, meldet an, führt `arbeit` aus und meldet ab. */
export async function imapSitzung<T>(k: Pick<SmtpKonto, "imapHost" | "imapPort" | "benutzer" | "passwort">, arbeit: (befehl: Zeile) => Promise<T>, o: { unsicherFuerTest?: boolean } = {}): Promise<T> {
  const sock: net.Socket = o.unsicherFuerTest ? net.connect(k.imapPort, k.imapHost) : tls.connect({ host: k.imapHost, port: k.imapPort, servername: k.imapHost });
  sock.setTimeout(20_000);
  let puffer = "";
  let warten: ((z: string) => void) | null = null;
  const zeilen: string[] = [];
  sock.on("data", (d: Buffer) => {
    puffer += d.toString("utf8");
    let i: number;
    while ((i = puffer.indexOf("\r\n")) >= 0) {
      const z = puffer.slice(0, i);
      puffer = puffer.slice(i + 2);
      if (warten) {
        const w = warten;
        warten = null;
        w(z);
      } else zeilen.push(z);
    }
  });
  const fehler = new Promise<never>((_, nein) => {
    sock.on("error", nein);
    sock.on("timeout", () => nein(new Error("Zeitüberschreitung")));
  });
  const naechste = () => (zeilen.length ? Promise.resolve(zeilen.shift()!) : Promise.race([new Promise<string>((ja) => (warten = ja)), fehler]));
  let nr = 0;
  const befehl: Zeile = async (text, literal) => {
    const tag = `L${++nr}`;
    if (literal) {
      sock.write(`${tag} ${text} {${literal.length}}\r\n`);
      let z = await naechste();
      while (!z.startsWith("+")) {
        if (z.startsWith(`${tag} `)) throw new Error(z.slice(tag.length + 1));
        z = await naechste();
      }
      sock.write(Buffer.concat([literal, Buffer.from("\r\n")]));
    } else sock.write(`${tag} ${text}\r\n`);
    const antwort: string[] = [];
    for (;;) {
      const z = await naechste();
      if (z.startsWith(`${tag} `)) {
        if (!/^\S+ OK/i.test(z)) throw new Error(z.slice(tag.length + 1).slice(0, 200));
        return antwort;
      }
      antwort.push(z);
    }
  };
  try {
    await naechste(); // Begrüßung
    const q = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
    await befehl(`LOGIN ${q(k.benutzer)} ${q(k.passwort)}`);
    const ergebnis = await arbeit(befehl);
    await befehl("LOGOUT").catch(() => undefined);
    return ergebnis;
  } finally {
    sock.destroy();
  }
}

/** Ordner „Gesendet“ finden: erst über das Merkmal \Sent, sonst über übliche Namen. */
export function gesendetOrdner(liste: string[]): string {
  const ordner = liste
    .map((z) => /^\* LIST \(([^)]*)\) (?:"[^"]*"|NIL) (.+)$/i.exec(z))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => ({ merkmale: m[1], name: m[2].replace(/^"(.*)"$/, "$1") }));
  return (
    ordner.find((o) => /\\Sent\b/i.test(o.merkmale))?.name ??
    ordner.find((o) => /^(INBOX[./])?(Sent|Gesendet|Gesendete Elemente|Sent Items|Sent Messages)$/i.test(o.name))?.name ??
    "Sent"
  );
}

/** Fertige Mail (MIME) im Ordner „Gesendet“ ablegen, als gelesen markiert. */
export async function imGesendetAblegen(k: SmtpKonto, mime: Buffer, o: { unsicherFuerTest?: boolean } = {}): Promise<string> {
  return imapSitzung(
    k,
    async (befehl) => {
      const ordner = gesendetOrdner(await befehl('LIST "" "*"'));
      await befehl(`APPEND "${ordner.replace(/"/g, '\\"')}" (\\Seen)`, mime);
      return ordner;
    },
    o,
  );
}
