import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { getDb, schema } from "../db";

// Zeiterfassung. Ziele laut Baukasten: Kompakt 4 h, Professional 8 h je Webauftritt; Betreuung ≤ 1 Stunde je Kunde und Monat.

export const TAETIGKEITEN: Record<string, string> = {
  vertrieb: "Vertrieb und Termin",
  abstimmung: "Abstimmung mit Kunde",
  inhalte: "Inhalte und Fotos",
  bau: "Bau und Technik",
  pruefung: "Prüfung und Livegang",
  betreuung: "Betreuung und Änderungen",
  intern: "Intern",
};

// Ziel-Stunden je Baustein (Skill levarex-baukasten, Ziel nach Einarbeitung; Start: Kompakt 6, Professional 12)
export const ZIEL_STUNDEN: Record<string, number> = { KOMPAKT: 4, PROFESSIONAL: 8 };
export const ZIEL_STUNDEN_MODULE: Record<string, number> = { personal: 5, marketing: 6, kundenmanagement: 15 };

export async function zeitErfassen(z: { betriebId?: number | null; projektId?: number | null; ticketId?: number | null; minuten: number; taetigkeit: string; notiz?: string; datum?: Date }, wer: string): Promise<void> {
  if (!(z.minuten > 0 && z.minuten <= 24 * 60)) throw new Error("Bitte Minuten zwischen 1 und 1440 angeben");
  if (!TAETIGKEITEN[z.taetigkeit]) throw new Error("Unbekannte Tätigkeit");
  const db = await getDb();
  let betriebId = z.betriebId ?? null;
  if (!betriebId && z.projektId) [{ betriebId }] = await db.select({ betriebId: schema.projekte.betriebId }).from(schema.projekte).where(eq(schema.projekte.id, z.projektId));
  await db.insert(schema.zeiten).values({ betriebId, projektId: z.projektId ?? null, ticketId: z.ticketId ?? null, wer, minuten: Math.round(z.minuten), taetigkeit: z.taetigkeit, notiz: z.notiz || null, datum: z.datum ?? new Date() });
}

export async function zeitLoeschen(id: number): Promise<void> {
  const db = await getDb();
  await db.delete(schema.zeiten).where(eq(schema.zeiten.id, id));
}

export async function zeitenVonProjekt(projektId: number) {
  const db = await getDb();
  const liste = await db.select().from(schema.zeiten).where(eq(schema.zeiten.projektId, projektId)).orderBy(desc(schema.zeiten.datum));
  // Lieferung = alles außer Betreuung (die zählt gegen das monatliche Kontingent)
  const lieferung = liste.filter((z) => z.taetigkeit !== "betreuung").reduce((s, z) => s + z.minuten, 0);
  return { liste, lieferungMinuten: lieferung, gesamtMinuten: liste.reduce((s, z) => s + z.minuten, 0) };
}

/** Betreuungsminuten eines Kunden im Kalendermonat (für Kontingent und Kennzahl). */
export async function betreuungImMonat(betriebId: number, monat = new Date()): Promise<number> {
  const db = await getDb();
  const von = new Date(monat.getFullYear(), monat.getMonth(), 1);
  const bis = new Date(monat.getFullYear(), monat.getMonth() + 1, 1);
  const [r] = await db
    .select({ s: sql<number>`coalesce(sum(${schema.zeiten.minuten}),0)::int` })
    .from(schema.zeiten)
    .where(and(eq(schema.zeiten.betriebId, betriebId), eq(schema.zeiten.taetigkeit, "betreuung"), gte(schema.zeiten.datum, von), lt(schema.zeiten.datum, bis)));
  return r.s;
}

export const stunden = (min: number) => `${(min / 60).toLocaleString("de-DE", { maximumFractionDigits: 1 })} h`;
