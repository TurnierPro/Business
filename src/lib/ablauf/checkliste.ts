import { and, asc, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "../db";
import type { PaketKey } from "../pakete";

// Lieferschritte je Paket. Punkte mit Schlüssel hakt Stelax OS selbst ab, sobald das Ereignis eintritt.

type Punkt = [phase: string, titel: string, schluessel?: string];

const BASIS: Punkt[] = [
  ["Start", "Anzahlung eingegangen", "anzahlung"],
  ["Start", "Start-Mail mit Portal-Link verschickt", "kickoff"],
  ["Start", "Domain geklärt (vorhanden, Umzug oder neu registrieren)"],
  ["Inhalte", "Texte, Fotos und Logo vom Kunden", "inhalte"],
  ["Inhalte", "Fotos beim Termin gemacht oder Foto-Anleitung geschickt"],
  ["Bau", "Seiten gebaut und alle 10 Prüfungen bestanden", "gebaut"],
  ["Bau", "Anfrageformular mit Foto-Upload getestet"],
  ["Bau", "Klick zum Anruf mit Messung eingerichtet"],
  ["Bau", "Rechtstexte vom lizenzierten Anbieter eingebunden"],
  ["Livegang", "Livegang freigegeben", "livegang"],
  ["Livegang", "Domain zeigt auf Stelax, Zertifikat aktiv", "domain"],
  ["Nach Livegang", "Google-Unternehmensprofil und Search Console eingerichtet"],
  ["Nach Livegang", "Bewertungs-QR-Karte übergeben"],
  ["Nach Livegang", "Abnahme erklärt", "abnahme"],
  ["Nach Livegang", "AV-Vertrag unterschrieben"],
];
const KARRIERE: Punkt[] = [
  ["Bau", "Karriereseite mit Stellen und Kurzbewerbung"],
  ["Nach Livegang", "Stellen bei Google for Jobs, Arbeitsagentur und Indeed"],
];
const ENTLASTET: Punkt[] = [
  ["Start", "Prozess-Check vor Ort durchgeführt"],
  ["Bau", "Online-Terminbuchung eingerichtet (BFSG prüfen)"],
  ["Bau", "Entlastungs-Baustein 1 eingerichtet und getestet"],
  ["Bau", "Entlastungs-Baustein 2 eingerichtet und getestet"],
  ["Bau", "Entlastungs-Baustein 3 eingerichtet und getestet"],
  ["Nach Livegang", "Schulung (bis 2 Stunden) durchgeführt"],
  ["Nach Livegang", "Erstes Quartals-Review vor Ort geplant"],
];
const WERKSTATT: Punkt[] = [["Bau", "Online-Terminbuchung und HU/AU-Erinnerung eingerichtet"]];

export const PHASEN = ["Start", "Inhalte", "Bau", "Livegang", "Nach Livegang"];

export function vorlage(paket: PaketKey): Punkt[] {
  const extra = paket === "M" ? KARRIERE : paket === "L" ? [...KARRIERE, ...ENTLASTET] : paket === "S_WERKSTATT" ? WERKSTATT : [];
  return [...BASIS, ...extra].sort((a, b) => PHASEN.indexOf(a[0]) - PHASEN.indexOf(b[0]));
}

/** Legt die Checkliste an, falls es noch keine gibt. */
export async function checklisteSicherstellen(projektId: number): Promise<void> {
  const db = await getDb();
  const [schon] = await db.select({ id: schema.projektAufgaben.id }).from(schema.projektAufgaben).where(eq(schema.projektAufgaben.projektId, projektId)).limit(1);
  if (schon) return;
  const [p] = await db.select().from(schema.projekte).where(eq(schema.projekte.id, projektId));
  if (!p) return;
  await db.insert(schema.projektAufgaben).values(vorlage(p.paket as PaketKey).map(([phase, titel, schluessel], i) => ({ projektId, phase, titel, schluessel: schluessel ?? null, reihenfolge: i })));
  // Was schon passiert ist, gleich abhaken
  const fertig: string[] = ["anzahlung"];
  if (p.inhalteAm) fertig.push("inhalte");
  if (["bereit", "live", "beendet"].includes(p.status)) fertig.push("gebaut");
  if (p.liveAm) fertig.push("livegang");
  const umzug = p.umzug as { domain?: string; status?: string };
  if (p.liveAm && (!umzug.domain || umzug.status === "umgestellt")) fertig.push("domain");
  if (["abgenommen", "vorbehalt", "fiktion"].includes(p.abnahmeStatus ?? "")) fertig.push("abnahme");
  for (const k of fertig) await hakeAb(projektId, k);
}

export async function hakeAb(projektId: number, schluessel: string, wer = "Stelax OS"): Promise<void> {
  const db = await getDb();
  await db
    .update(schema.projektAufgaben)
    .set({ erledigtAm: new Date(), erledigtVon: wer })
    .where(and(eq(schema.projektAufgaben.projektId, projektId), eq(schema.projektAufgaben.schluessel, schluessel), isNull(schema.projektAufgaben.erledigtAm)));
}

export async function umschalten(id: number, wer: string): Promise<void> {
  const db = await getDb();
  const [a] = await db.select().from(schema.projektAufgaben).where(eq(schema.projektAufgaben.id, id));
  if (!a) throw new Error("Punkt nicht gefunden");
  await db.update(schema.projektAufgaben).set(a.erledigtAm ? { erledigtAm: null, erledigtVon: null } : { erledigtAm: new Date(), erledigtVon: wer }).where(eq(schema.projektAufgaben.id, id));
}

export async function punktHinzufuegen(projektId: number, phase: string, titel: string): Promise<void> {
  if (!titel.trim()) throw new Error("Titel fehlt");
  const db = await getDb();
  const alle = await db.select().from(schema.projektAufgaben).where(eq(schema.projektAufgaben.projektId, projektId));
  await db.insert(schema.projektAufgaben).values({ projektId, phase: PHASEN.includes(phase) ? phase : "Bau", titel: titel.trim(), reihenfolge: alle.length });
}

export async function checkliste(projektId: number) {
  await checklisteSicherstellen(projektId);
  const db = await getDb();
  return db.select().from(schema.projektAufgaben).where(eq(schema.projektAufgaben.projektId, projektId)).orderBy(asc(schema.projektAufgaben.reihenfolge));
}
