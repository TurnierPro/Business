import { and, asc, eq, isNull, lte, or } from "drizzle-orm";
import { getDb, schema } from "../db";
import { protokolliere } from "../protokoll";
import { inTagen } from "../format";

// CRM-Grundlagen: Ansprechpartner, Aktivitäten (Notiz, Anruf, Termin, Aufgabe) und Aufgabenlisten.

// Wer automatisch angelegte Aufgaben bekommt (für andere Firmen über Umgebungsvariablen änderbar)
export const VERTRIEB = process.env.ZUSTAENDIG_VERTRIEB ?? "Daniel Lück";
export const TECHNIK = process.env.ZUSTAENDIG_TECHNIK ?? "Max Steiner";

export const ARTEN: Record<string, string> = { notiz: "Notiz", anruf: "Anruf", termin: "Termin", aufgabe: "Aufgabe" };

export async function kontaktSpeichern(k: { id?: number; betriebId: number; name: string; rolle?: string; telefon?: string; email?: string; notiz?: string; haupt?: boolean }, wer: string): Promise<number> {
  if (!k.name.trim()) throw new Error("Name fehlt");
  const db = await getDb();
  const werte = { betriebId: k.betriebId, name: k.name.trim(), rolle: k.rolle || null, telefon: k.telefon || null, email: k.email || null, notiz: k.notiz || null, haupt: !!k.haupt };
  if (werte.haupt) await db.update(schema.kontakte).set({ haupt: false }).where(eq(schema.kontakte.betriebId, k.betriebId));
  let id = k.id;
  if (id) await db.update(schema.kontakte).set(werte).where(eq(schema.kontakte.id, id));
  else [{ id }] = await db.insert(schema.kontakte).values(werte).returning({ id: schema.kontakte.id });
  await protokolliere(wer, `Kontakt gespeichert: ${werte.name}`, k.betriebId);
  return id!;
}

export async function kontaktLoeschen(id: number, wer: string): Promise<void> {
  const db = await getDb();
  const [k] = await db.delete(schema.kontakte).where(eq(schema.kontakte.id, id)).returning();
  if (k) await protokolliere(wer, `Kontakt gelöscht: ${k.name}`, k.betriebId);
}

export type NeueAktivitaet = {
  betriebId?: number | null;
  projektId?: number | null;
  ticketId?: number | null;
  art: "notiz" | "anruf" | "termin" | "aufgabe";
  titel: string;
  text?: string;
  faelligAm?: Date | null;
  dauerMin?: number | null;
  zustaendig?: string | null;
  erledigt?: boolean;
};

export async function aktivitaetAnlegen(a: NeueAktivitaet, wer: string): Promise<number> {
  if (!a.titel.trim()) throw new Error("Titel fehlt");
  if (!ARTEN[a.art]) throw new Error("Unbekannte Art");
  if ((a.art === "aufgabe" || a.art === "termin") && !a.faelligAm) throw new Error("Bitte ein Datum angeben");
  const db = await getDb();
  const [neu] = await db
    .insert(schema.aktivitaeten)
    .values({
      betriebId: a.betriebId ?? null,
      projektId: a.projektId ?? null,
      ticketId: a.ticketId ?? null,
      art: a.art,
      titel: a.titel.trim(),
      text: a.text?.trim() || null,
      faelligAm: a.art === "aufgabe" || a.art === "termin" ? (a.faelligAm ?? null) : null,
      dauerMin: a.dauerMin ?? null,
      zustaendig: a.zustaendig || (a.art === "aufgabe" || a.art === "termin" ? wer : null),
      erledigtAm: a.erledigt || a.art === "notiz" || a.art === "anruf" ? new Date() : null,
      erstelltVon: wer,
    })
    .returning({ id: schema.aktivitaeten.id });
  // Jede Aktivität hält den Lead „warm“ (Pipeline zeigt liegengebliebene Chancen)
  if (a.betriebId) await db.update(schema.betriebe).set({ letzteAktivitaet: new Date() }).where(eq(schema.betriebe.id, a.betriebId));
  return neu.id;
}

export async function erledigen(id: number, erledigt: boolean, wer: string): Promise<void> {
  const db = await getDb();
  const [a] = await db.update(schema.aktivitaeten).set({ erledigtAm: erledigt ? new Date() : null }).where(eq(schema.aktivitaeten.id, id)).returning();
  if (a && erledigt) await protokolliere(wer, `Erledigt: ${a.titel}`, a.betriebId);
}

export async function verschieben(id: number, neu: Date): Promise<void> {
  const db = await getDb();
  await db.update(schema.aktivitaeten).set({ faelligAm: neu }).where(eq(schema.aktivitaeten.id, id));
}

/** Offene Aufgaben und Termine, optional nur für eine Person, bis zu einem Datum. */
export async function offeneAufgaben(o: { wer?: string; bis?: Date } = {}) {
  const db = await getDb();
  const bedingungen = [isNull(schema.aktivitaeten.erledigtAm), or(eq(schema.aktivitaeten.art, "aufgabe"), eq(schema.aktivitaeten.art, "termin"))];
  if (o.wer) bedingungen.push(eq(schema.aktivitaeten.zustaendig, o.wer));
  if (o.bis) bedingungen.push(lte(schema.aktivitaeten.faelligAm, o.bis));
  return db
    .select({ a: schema.aktivitaeten, betrieb: schema.betriebe.name })
    .from(schema.aktivitaeten)
    .leftJoin(schema.betriebe, eq(schema.aktivitaeten.betriebId, schema.betriebe.id))
    .where(and(...bedingungen))
    .orderBy(asc(schema.aktivitaeten.faelligAm));
}

/** Automatische Aufgabe vom System (z. B. Nachfassen), nur wenn es noch keine offene mit gleichem Titel gibt. */
export async function systemAufgabe(o: { betriebId: number; titel: string; text?: string; inTagen: number; zustaendig: string; projektId?: number }): Promise<void> {
  const db = await getDb();
  const [schon] = await db
    .select({ id: schema.aktivitaeten.id })
    .from(schema.aktivitaeten)
    .where(and(eq(schema.aktivitaeten.betriebId, o.betriebId), eq(schema.aktivitaeten.titel, o.titel), isNull(schema.aktivitaeten.erledigtAm)));
  if (schon) return;
  const faellig = inTagen(o.inTagen);
  await db.insert(schema.aktivitaeten).values({ betriebId: o.betriebId, projektId: o.projektId ?? null, art: "aufgabe", titel: o.titel, text: o.text ?? null, faelligAm: faellig, zustaendig: o.zustaendig, erstelltVon: "Stelax OS" });
}

/** Offene Systemaufgaben eines Betriebs schließen, wenn das Ereignis eingetreten ist (z. B. Angebot angenommen). */
export async function systemAufgabeErledigt(betriebId: number, titelAnfang: string): Promise<void> {
  const db = await getDb();
  const offen = await db.select().from(schema.aktivitaeten).where(and(eq(schema.aktivitaeten.betriebId, betriebId), isNull(schema.aktivitaeten.erledigtAm), eq(schema.aktivitaeten.erstelltVon, "Stelax OS")));
  for (const a of offen.filter((x) => x.titel.startsWith(titelAnfang))) await db.update(schema.aktivitaeten).set({ erledigtAm: new Date() }).where(eq(schema.aktivitaeten.id, a.id));
}
