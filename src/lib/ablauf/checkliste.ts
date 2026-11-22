import { and, asc, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "../db";
import type { PaketKey } from "../pakete";
import { gebuchteModule } from "../bausteine";

// Lieferschritte je Webauftritt und gebuchtem Modul. Punkte mit Schlüssel hakt Levarex OS selbst ab, sobald das Ereignis eintritt.

type Punkt = [phase: string, titel: string, schluessel?: string];

const BASIS: Punkt[] = [
  ["Start", "Anzahlung eingegangen", "anzahlung"],
  ["Start", "Start-Mail mit Portal-Link verschickt", "kickoff"],
  ["Start", "AV-Vertrag unterschrieben (mit den Verträgen)", "av"],
  ["Start", "SEPA-Mandat erteilt (Tablet oder Kundenportal)", "mandat"],
  ["Start", "Domain geklärt (vorhanden, Umzug oder neu registrieren)"],
  ["Inhalte", "Texte, Fotos und Logo vom Kunden", "inhalte"],
  ["Inhalte", "Fotos beim Termin gemacht oder Foto-Anleitung geschickt"],
  ["Bau", "Seiten gebaut und alle 10 Prüfungen bestanden", "gebaut"],
  ["Bau", "Anfrageformular mit Foto-Upload getestet"],
  ["Bau", "Klick zum Anruf mit Messung eingerichtet"],
  ["Bau", "Rechtstexte vom lizenzierten Anbieter eingebunden"],
  ["Abnahme", "Vorschau beim Kunden, Abnahme erklärt (oder Frist abgelaufen)", "abnahme"],
  ["Livegang", "Livegang freigegeben", "livegang"],
  ["Livegang", "Domain zeigt auf Levarex, Zertifikat aktiv", "domain"],
  ["Nach Livegang", "Google-Unternehmensprofil und Search Console eingerichtet"],
];
const PERSONAL: Punkt[] = [
  ["Bau", "Karriereseite mit bis zu 5 Stellen, Azubi- und Praktikumsseite"],
  ["Bau", "Benefits erfasst, Bewerben per Handy und WhatsApp getestet"],
  ["Nach Livegang", "Stellenpflege eingerichtet (neue Stellen binnen 3 Werktagen)"],
];
const MARKETING: Punkt[] = [
  ["Start", "Profile mit Partnerzugriff (Instagram, Facebook, Google)"],
  ["Bau", "Google-Profil vollständig, strukturierte Daten, Frage-Antwort-Bereich auf der Website"],
  ["Bau", "Redaktionsplan und erste 8 Beiträge zur Freigabe"],
  ["Nach Livegang", "Antwortvorlagen für Bewertungen, GEO-Ausgangstest"],
];
const KUNDENMANAGEMENT: Punkt[] = [
  ["Start", "Prozess-Check vor Ort durchgeführt"],
  ["Bau", "Kunden, Fahrzeuge oder Anlagen und Fälligkeiten übernommen"],
  ["Bau", "Online-Terminbuchung und Erinnerungen eingerichtet (BFSG prüfen)"],
  ["Bau", "Jeder Ablauf eine Testwoche im Entwurfsmodus"],
  ["Nach Livegang", "Nachfassen nach 7 und 14 Tagen und Bewertungsbitte aktiv"],
];

export const PHASEN = ["Start", "Inhalte", "Bau", "Abnahme", "Livegang", "Nach Livegang"];

export function vorlage(_paket: PaketKey, module: string[] = []): Punkt[] {
  const extra = [...(module.includes("personal") ? PERSONAL : []), ...(module.includes("marketing") ? MARKETING : []), ...(module.includes("kundenmanagement") ? KUNDENMANAGEMENT : [])];
  return [...BASIS, ...extra].sort((a, b) => PHASEN.indexOf(a[0]) - PHASEN.indexOf(b[0]));
}

/** Legt die Checkliste an, falls es noch keine gibt. */
export async function checklisteSicherstellen(projektId: number): Promise<void> {
  const db = await getDb();
  const [schon] = await db.select({ id: schema.projektAufgaben.id }).from(schema.projektAufgaben).where(eq(schema.projektAufgaben.projektId, projektId)).limit(1);
  if (schon) return;
  const [p] = await db.select().from(schema.projekte).where(eq(schema.projekte.id, projektId));
  if (!p) return;
  await db.insert(schema.projektAufgaben).values(vorlage(p.paket as PaketKey, await gebuchteModule(p)).map(([phase, titel, schluessel], i) => ({ projektId, phase, titel, schluessel: schluessel ?? null, reihenfolge: i })));
  // Was schon passiert ist, gleich abhaken
  const fertig: string[] = ["anzahlung"];
  if (p.inhalteAm) fertig.push("inhalte");
  if (["bereit", "live", "beendet"].includes(p.status)) fertig.push("gebaut");
  if (p.liveAm) fertig.push("livegang");
  const umzug = p.umzug as { domain?: string; status?: string };
  if (p.liveAm && (!umzug.domain || umzug.status === "umgestellt")) fertig.push("domain");
  if (["abgenommen", "vorbehalt", "fiktion"].includes(p.abnahmeStatus ?? "")) fertig.push("abnahme");
  const unterschrieben = (await db.select().from(schema.dokumente).where(eq(schema.dokumente.betriebId, p.betriebId))).filter((d) => ((d.daten as { unterschriften?: { rolle: string }[] }).unterschriften ?? []).some((u) => u.rolle === "kunde"));
  if (unterschrieben.some((d) => d.art === "av_vertrag")) fertig.push("av");
  if (unterschrieben.some((d) => d.art === "sepa_mandat")) fertig.push("mandat");
  for (const k of fertig) await hakeAb(projektId, k);
}

export async function hakeAb(projektId: number, schluessel: string, wer = "Levarex OS"): Promise<void> {
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
