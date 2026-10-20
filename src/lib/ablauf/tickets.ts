import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "../db";
import { protokolliere } from "../protokoll";
import { melde } from "../adapters/push";
import { AENDERUNGS_MINUTEN, PaketKey } from "../pakete";
import { inPostausgang } from "./postausgang";
import { betrieb } from "./gemeinsam";
import { TECHNIK } from "./crm";
import { betreuungImMonat, zeitErfassen } from "./zeiten";

// Tickets: Änderungswünsche, Fehler und Fragen. Kunden stellen sie im Portal, wir per Telefon oder Mail.
// Antworten an Kunden gehen wie alles durch den Postausgang.

export const KATEGORIEN: Record<string, string> = { aenderung: "Änderung", fehler: "Fehler", frage: "Frage", wunsch: "Neuer Wunsch" };
export const PRIORITAETEN: Record<string, string> = { normal: "normal", hoch: "hoch", dringend: "dringend" };
export const TICKET_STATUS: Record<string, string> = { neu: "neu", in_arbeit: "in Arbeit", wartet_kunde: "wartet auf Kunde", erledigt: "erledigt" };

export const ticketNummer = (id: number) => `T-${String(id).padStart(4, "0")}`;

export async function ticketAnlegen(t: { betriebId: number; projektId?: number | null; betreff: string; beschreibung: string; kategorie?: string; prioritaet?: string; quelle: string }, wer: string): Promise<number> {
  if (t.betreff.trim().length < 3 || t.beschreibung.trim().length < 5) throw new Error("Bitte kurz beschreiben, worum es geht.");
  const db = await getDb();
  let projektId = t.projektId ?? null;
  if (!projektId) {
    const [p] = await db.select({ id: schema.projekte.id }).from(schema.projekte).where(eq(schema.projekte.betriebId, t.betriebId)).orderBy(desc(schema.projekte.erstelltAm)).limit(1);
    projektId = p?.id ?? null;
  }
  const [neu] = await db
    .insert(schema.tickets)
    .values({
      betriebId: t.betriebId,
      projektId,
      betreff: t.betreff.trim().slice(0, 200),
      beschreibung: t.beschreibung.trim().slice(0, 5000),
      kategorie: KATEGORIEN[t.kategorie ?? ""] ? t.kategorie! : "aenderung",
      prioritaet: PRIORITAETEN[t.prioritaet ?? ""] ? t.prioritaet! : "normal",
      quelle: t.quelle,
      zustaendig: TECHNIK,
      erstelltVon: wer,
    })
    .returning({ id: schema.tickets.id });
  const b = await betrieb(t.betriebId);
  await protokolliere(wer, `Ticket ${ticketNummer(neu.id)}: ${t.betreff}`, t.betriebId);
  if (t.quelle === "portal" || t.prioritaet === "dringend") await melde("job", t.prioritaet !== "dringend", `Neues Ticket von ${b.name}`, `${ticketNummer(neu.id)} · ${t.betreff}`);
  return neu.id;
}

export async function ticketAendern(id: number, w: { status?: string; zustaendig?: string; prioritaet?: string; loesung?: string }, wer: string): Promise<void> {
  const db = await getDb();
  const [t] = await db.select().from(schema.tickets).where(eq(schema.tickets.id, id));
  if (!t) throw new Error("Ticket nicht gefunden");
  const status = w.status && TICKET_STATUS[w.status] ? w.status : t.status;
  await db
    .update(schema.tickets)
    .set({ status, zustaendig: w.zustaendig ?? t.zustaendig, prioritaet: w.prioritaet && PRIORITAETEN[w.prioritaet] ? w.prioritaet : t.prioritaet, loesung: w.loesung ?? t.loesung, erledigtAm: status === "erledigt" ? (t.erledigtAm ?? new Date()) : null })
    .where(eq(schema.tickets.id, id));
  if (status !== t.status) await protokolliere(wer, `Ticket ${ticketNummer(id)}: ${TICKET_STATUS[status]}`, t.betriebId);
}

/** Zeit auf ein Ticket buchen: zählt als Betreuung gegen das Monatskontingent. */
export async function ticketZeit(id: number, minuten: number, notiz: string, wer: string): Promise<void> {
  const db = await getDb();
  const [t] = await db.select().from(schema.tickets).where(eq(schema.tickets.id, id));
  if (!t) throw new Error("Ticket nicht gefunden");
  await zeitErfassen({ betriebId: t.betriebId, projektId: t.projektId, ticketId: id, minuten, taetigkeit: "betreuung", notiz: notiz || `${ticketNummer(id)} ${t.betreff}` }, wer);
  if (t.status === "neu") await ticketAendern(id, { status: "in_arbeit" }, wer);
}

/** Antwort an den Kunden: als Mail in den Postausgang. */
export async function ticketAntworten(id: number, text: string, erledigt: boolean, wer: string): Promise<number> {
  const db = await getDb();
  const [t] = await db.select().from(schema.tickets).where(eq(schema.tickets.id, id));
  if (!t) throw new Error("Ticket nicht gefunden");
  if (text.trim().length < 10) throw new Error("Antwort ist zu kurz.");
  const b = await betrieb(t.betriebId);
  const eintrag = await inPostausgang({
    betriebId: b.id,
    projektId: t.projektId,
    kanal: "mail",
    zweck: "ticket_antwort",
    empfaenger: b.email ?? "(E-Mail-Adresse fehlt)",
    betreff: `${erledigt ? "Erledigt" : "Rückmeldung"}: ${t.betreff} (${ticketNummer(id)})`,
    text: `Guten Tag,\n\n${text.trim()}\n\nMit freundlichen Grüßen\n${wer}\nStelax Consulting`,
    meta: { ticketId: id },
  });
  await ticketAendern(id, { status: erledigt ? "erledigt" : "wartet_kunde", loesung: erledigt ? text.trim() : undefined }, wer);
  return eintrag;
}

/** Kontingent im laufenden Monat: enthaltene und verbrauchte Minuten. */
export async function kontingent(betriebId: number) {
  const db = await getDb();
  const [p] = await db.select().from(schema.projekte).where(eq(schema.projekte.betriebId, betriebId)).orderBy(desc(schema.projekte.erstelltAm)).limit(1);
  const enthalten = p ? AENDERUNGS_MINUTEN[p.paket as PaketKey] ?? 0 : 0;
  const verbraucht = await betreuungImMonat(betriebId);
  return { enthalten, verbraucht, rest: Math.max(0, enthalten - verbraucht), ueber: Math.max(0, verbraucht - enthalten) };
}
