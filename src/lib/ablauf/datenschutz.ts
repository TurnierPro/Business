import fs from "node:fs";
import path from "node:path";
import { and, eq, inArray, ne, notInArray, or } from "drizzle-orm";
import { getDb, schema } from "../db";
import { protokolliere } from "../protokoll";
import { datenOrdner } from "../pfade";
import { loescheSeite } from "../sites/generator";
import { PAKETE, PaketKey } from "../pakete";
import { betrieb, sperrSchluessel } from "./gemeinsam";

const AUFBEWAHREN = ["rechnung", "angebot", "auftragsbestaetigung", "abnahmeprotokoll"];

// Betroffenenrechte (Art. 15 und 17 DSGVO) und Verzeichnis der Verarbeitungen als Auftragsverarbeiter (Art. 30 Abs. 2).

/** Alles, was wir zu einem Betrieb gespeichert haben, als JSON (Auskunft nach Art. 15). */
export async function datenauskunft(betriebId: number, wer: string) {
  const db = await getDb();
  const b = await betrieb(betriebId);
  const [kontakte, aktivitaeten, tickets, zeiten, nachrichten] = await Promise.all([
    db.select().from(schema.kontakte).where(eq(schema.kontakte.betriebId, betriebId)),
    db.select().from(schema.aktivitaeten).where(eq(schema.aktivitaeten.betriebId, betriebId)),
    db.select().from(schema.tickets).where(eq(schema.tickets.betriebId, betriebId)),
    db.select().from(schema.zeiten).where(eq(schema.zeiten.betriebId, betriebId)),
    db.select().from(schema.nachrichten).where(eq(schema.nachrichten.betriebId, betriebId)),
  ]);
  const [termine, angebote, projekte, rechnungen, dokumente, post, anfragen, verlauf] = await Promise.all([
    db.select().from(schema.termine).where(eq(schema.termine.betriebId, betriebId)),
    db.select().from(schema.angebote).where(eq(schema.angebote.betriebId, betriebId)),
    db.select().from(schema.projekte).where(eq(schema.projekte.betriebId, betriebId)),
    db.select().from(schema.rechnungen).where(eq(schema.rechnungen.betriebId, betriebId)),
    db.select({ id: schema.dokumente.id, art: schema.dokumente.art, titel: schema.dokumente.titel, erstelltAm: schema.dokumente.erstelltAm }).from(schema.dokumente).where(eq(schema.dokumente.betriebId, betriebId)),
    db.select({ zweck: schema.postausgang.zweck, kanal: schema.postausgang.kanal, empfaenger: schema.postausgang.empfaenger, betreff: schema.postausgang.betreff, text: schema.postausgang.text, status: schema.postausgang.status, versendetAm: schema.postausgang.versendetAm }).from(schema.postausgang).where(eq(schema.postausgang.betriebId, betriebId)),
    db.select().from(schema.anfragen).where(eq(schema.anfragen.betriebId, betriebId)),
    db.select().from(schema.protokoll).where(eq(schema.protokoll.betriebId, betriebId)),
  ]);
  await protokolliere(wer, "Datenauskunft erstellt (Art. 15 DSGVO)", betriebId);
  const { portalToken: _p, stripeKundeId: _s, stripeZahlart: _z, ...stammdaten } = b;
  return {
    erstelltAm: new Date().toISOString(),
    hinweis: "Auskunft nach Art. 15 DSGVO. Zwecke: Akquise (Art. 6 Abs. 1 lit. f), Vertrag (lit. b), Aufbewahrung von Rechnungen (lit. c, § 147 AO, 8 Jahre).",
    stammdaten,
    ansprechpartner: kontakte,
    aktivitaeten,
    tickets,
    zeiten,
    nachrichten,
    termine: termine.map(({ audioPfad, ...t }) => ({ ...t, aufnahmeGespeichert: !!audioPfad })),
    angebote,
    projekte: projekte.map(({ portalToken: _t, ...p }) => p),
    rechnungen,
    dokumente,
    postausgang: post,
    anfragen,
    verlauf,
  };
}

/**
 * Löschung nach Art. 17. Rechnungen und Handelsbriefe müssen wir aufbewahren (§ 147 AO, § 257 HGB):
 * Gibt es Rechnungen, bleiben nur diese, Angebot, Auftragsbestätigung, Abnahmeprotokoll und die versendeten Mails dazu.
 * Ein Eintrag auf der Sperrliste sorgt dafür, dass der Betrieb nie wieder angeschrieben wird.
 */
export async function allesLoeschen(betriebId: number, bestaetigung: string, wer: string): Promise<string> {
  const db = await getDb();
  const b = await betrieb(betriebId);
  if (bestaetigung.trim() !== b.name) throw new Error(`Zur Bestätigung genau den Namen „${b.name}“ eintragen.`);
  const rechnungen = await db.select().from(schema.rechnungen).where(eq(schema.rechnungen.betriebId, betriebId));

  // Dateien zuerst: Aufnahmen, Uploads, Seiten, Anfragen-Fotos, archivierte PDFs (außer Rechnungen)
  for (const t of await db.select().from(schema.termine).where(eq(schema.termine.betriebId, betriebId))) if (t.audioPfad) fs.rmSync(t.audioPfad, { force: true });
  for (const p of await db.select().from(schema.projekte).where(eq(schema.projekte.betriebId, betriebId))) fs.rmSync(path.join(datenOrdner("uploads"), `projekt-${p.id}`), { recursive: true, force: true });
  for (const s of await db.select().from(schema.seiten).where(eq(schema.seiten.betriebId, betriebId))) {
    loescheSeite(s.slug);
    fs.rmSync(path.join(datenOrdner("anfragen"), s.slug), { recursive: true, force: true });
  }
  const doks = await db.select().from(schema.dokumente).where(eq(schema.dokumente.betriebId, betriebId));
  for (const d of doks) if (d.archivPfad && !(rechnungen.length && AUFBEWAHREN.includes(d.art))) fs.rmSync(d.archivPfad, { force: true });

  await db.insert(schema.sperrliste).values({ name: b.name, schluessel: sperrSchluessel(b.name, b.website), grund: "Löschung auf Wunsch (Art. 17 DSGVO)" }).onConflictDoNothing();

  if (!rechnungen.length) {
    await db.delete(schema.betriebe).where(eq(schema.betriebe.id, betriebId)); // löscht alles Abhängige mit
    await db.delete(schema.protokoll).where(eq(schema.protokoll.betriebId, betriebId));
    await protokolliere(wer, "Alle Daten eines Betriebs gelöscht (Art. 17 DSGVO)", null, `Betrieb #${betriebId}`);
    return "Alle Daten gelöscht";
  }
  await db.delete(schema.termine).where(eq(schema.termine.betriebId, betriebId));
  await db.delete(schema.kontakte).where(eq(schema.kontakte.betriebId, betriebId));
  await db.delete(schema.aktivitaeten).where(eq(schema.aktivitaeten.betriebId, betriebId));
  await db.delete(schema.tickets).where(eq(schema.tickets.betriebId, betriebId));
  // Von Nachrichten bleiben nur unsere versendeten Mails (Handelsbriefe), der Rest geht
  await db.delete(schema.nachrichten).where(and(eq(schema.nachrichten.betriebId, betriebId), or(ne(schema.nachrichten.richtung, "aus"), ne(schema.nachrichten.kanal, "mail"))));
  await db.delete(schema.anfragen).where(eq(schema.anfragen.betriebId, betriebId));
  await db.delete(schema.seiten).where(eq(schema.seiten.betriebId, betriebId));
  await db.delete(schema.dokumente).where(and(eq(schema.dokumente.betriebId, betriebId), notInArray(schema.dokumente.art, AUFBEWAHREN)));
  await db.delete(schema.postausgang).where(and(eq(schema.postausgang.betriebId, betriebId), inArray(schema.postausgang.status, ["zur_freigabe", "abgelehnt", "freigegeben"])));
  await db.update(schema.projekte).set({ inhalte: {}, onboarding: {}, status: "beendet" }).where(eq(schema.projekte.betriebId, betriebId));
  // Stammdaten auf das für Rechnungen Nötige beschränken und sperren (Art. 18)
  await db
    .update(schema.betriebe)
    .set({ status: "gesperrt", telefon: null, email: null, website: null, notizen: null, scoreGrund: null, inhaber: null, datenquelle: null, portalToken: null })
    .where(eq(schema.betriebe.id, betriebId));
  await protokolliere(wer, "Daten gelöscht, Rechnungen und Handelsbriefe bleiben (§ 147 AO, § 257 HGB)", betriebId);
  return `Gelöscht bis auf ${rechnungen.length} Rechnungen und die Vertragsunterlagen (Aufbewahrungspflicht)`;
}

/** Entwurf des Verzeichnisses als Auftragsverarbeiter: was wir für welchen Kunden verarbeiten. */
export async function verarbeitungen() {
  const db = await getDb();
  const zeilen = await db
    .select({ p: schema.projekte, name: schema.betriebe.name })
    .from(schema.projekte)
    .innerJoin(schema.betriebe, eq(schema.projekte.betriebId, schema.betriebe.id))
    .where(inArray(schema.projekte.status, ["inhalte", "bau", "pruefung", "bereit", "live"]));
  const unter = ["Hetzner Online GmbH (Hosting, Deutschland)"];
  if (process.env.RESEND_API_KEY) unter.push("Resend (E-Mail-Versand)");
  if (process.env.ANTHROPIC_API_KEY) unter.push("Anthropic (KI, nur für Entwürfe)");
  return zeilen.map(({ p, name }) => {
    const paket = p.paket as PaketKey;
    const taetigkeiten = ["Hosting und Wartung der Website (Server-Logs)", "Anfrageformular: Name, Telefon, E-Mail, Nachricht, Fotos"];
    if (paket === "M" || paket === "L") taetigkeiten.push("Kurzbewerbungen: Name, Kontakt, Angaben zur Person (ohne KI-Rangfolge)");
    if (paket === "S_WERKSTATT" || paket === "L") taetigkeiten.push("Online-Terminbuchung: Name, Kontakt, Termin, ggf. Fahrzeug");
    if (paket === "L") taetigkeiten.push("Entlastungs-Bausteine nach Auswahl (siehe Angebot)");
    return { kunde: name, paket: PAKETE[paket]?.name ?? paket, seit: p.erstelltAm, taetigkeiten, betroffene: "Kunden, Interessenten und Bewerber des Betriebs", unterauftragnehmer: unter, loeschung: "Anfragen 12 Monate nach Eingang, Bewerbungen 6 Monate nach Abschluss, Logs 14 Tage (Annahme, im AVV festlegen)" };
  });
}

// ---------- Datenpannen (Art. 33/34) ----------

export const PANNE_RISIKO: Record<string, string> = { pruefen: "wird bewertet", kein: "kein Risiko (nur dokumentieren)", risiko: "Risiko: Meldung an Aufsicht in 72 h", hoch: "hohes Risiko: Aufsicht und Betroffene informieren" };

export async function panneErfassen(p: { entdecktAm: Date; beschreibung: string; betroffene?: string; daten?: string }, wer: string): Promise<number> {
  if (p.beschreibung.trim().length < 10) throw new Error("Bitte kurz beschreiben, was passiert ist.");
  const db = await getDb();
  const [neu] = await db.insert(schema.datenpannen).values({ entdecktAm: p.entdecktAm, beschreibung: p.beschreibung.trim(), betroffene: p.betroffene || null, daten: p.daten || null, erfasstVon: wer }).returning({ id: schema.datenpannen.id });
  await protokolliere(wer, `Datenpanne erfasst (#${neu.id})`);
  const { melde } = await import("../adapters/push");
  await melde("job", false, "Datenpanne erfasst", "Frist: Meldung an die Aufsicht binnen 72 Stunden ab Kenntnis, wenn ein Risiko besteht. Jetzt bewerten.");
  return neu.id;
}

export async function panneAktualisieren(id: number, w: { risiko?: string; massnahmen?: string; gemeldet?: boolean; informiert?: boolean; abgeschlossen?: boolean }, wer: string): Promise<void> {
  const db = await getDb();
  const [p] = await db.select().from(schema.datenpannen).where(eq(schema.datenpannen.id, id));
  if (!p) throw new Error("Nicht gefunden");
  await db
    .update(schema.datenpannen)
    .set({
      risiko: w.risiko && PANNE_RISIKO[w.risiko] ? w.risiko : p.risiko,
      massnahmen: w.massnahmen ?? p.massnahmen,
      gemeldetAm: w.gemeldet ? (p.gemeldetAm ?? new Date()) : p.gemeldetAm,
      betroffeneInformiertAm: w.informiert ? (p.betroffeneInformiertAm ?? new Date()) : p.betroffeneInformiertAm,
      abgeschlossenAm: w.abgeschlossen ? (p.abgeschlossenAm ?? new Date()) : null,
    })
    .where(eq(schema.datenpannen.id, id));
  await protokolliere(wer, `Datenpanne #${id} aktualisiert`);
}

/** Restzeit bis zur 72-Stunden-Frist in Stunden (negativ = überschritten). */
export const restStunden = (entdeckt: Date, jetzt = new Date()) => Math.floor((entdeckt.getTime() + 72 * 3600_000 - jetzt.getTime()) / 3600_000);

// ---------- Anfragen von Betroffenen (Art. 12: ein Monat) ----------

export const ANFRAGE_ARTEN: Record<string, string> = { auskunft: "Auskunft (Art. 15)", berichtigung: "Berichtigung (Art. 16)", loeschung: "Löschung (Art. 17)", einschraenkung: "Einschränkung (Art. 18)", uebertragung: "Datenübertragung (Art. 20)", widerspruch: "Widerspruch (Art. 21)" };

export async function betroffenenanfrageErfassen(a: { eingangAm: Date; art: string; person: string; betriebId?: number | null; notiz?: string }, wer: string): Promise<void> {
  if (!ANFRAGE_ARTEN[a.art]) throw new Error("Unbekannte Art");
  if (!a.person.trim()) throw new Error("Wer hat angefragt?");
  const db = await getDb();
  await db.insert(schema.betroffenenanfragen).values({ eingangAm: a.eingangAm, art: a.art, person: a.person.trim(), betriebId: a.betriebId ?? null, notiz: a.notiz || null, erfasstVon: wer });
  await protokolliere(wer, `Betroffenenanfrage erfasst: ${ANFRAGE_ARTEN[a.art]}`, a.betriebId ?? null);
}

export async function betroffenenanfrageErledigt(id: number, wer: string): Promise<void> {
  const db = await getDb();
  await db.update(schema.betroffenenanfragen).set({ erledigtAm: new Date() }).where(eq(schema.betroffenenanfragen.id, id));
  await protokolliere(wer, `Betroffenenanfrage #${id} erledigt`);
}

/** Frist: ein Monat ab Eingang (Art. 12 Abs. 3 DSGVO). */
export function anfrageFrist(eingang: Date): Date {
  return new Date(eingang.getFullYear(), eingang.getMonth() + 1, eingang.getDate(), 23, 59);
}
