import { and, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { getDb, schema } from "./db";
import { inTagen } from "./format";

// Eine Zählweise für „Zu tun“: Menü-Zahl, Kacheln und „Mein Tag“ rechnen alle hiermit.
export type ZuTunZahlen = { aufgaben: number; besuche: number; freigaben: number; einstufen: number; tickets: number; unbekannt: number; gesamt: number };

export async function zuTunZahlen(wer: string, jetzt = new Date()): Promise<ZuTunZahlen> {
  const db = await getDb();
  const zaehle = sql<number>`count(*)::int`;
  const [[aufgaben], [besuche], [freigaben], [einstufen], [tickets], [unbekannt]] = await Promise.all([
    db.select({ n: zaehle }).from(schema.aktivitaeten).where(and(isNull(schema.aktivitaeten.erledigtAm), eq(schema.aktivitaeten.zustaendig, wer), lte(schema.aktivitaeten.faelligAm, inTagen(1, "00:00")), or(eq(schema.aktivitaeten.art, "aufgabe"), eq(schema.aktivitaeten.art, "termin")))),
    db.select({ n: zaehle }).from(schema.betriebe).where(and(eq(schema.betriebe.status, "angeschrieben"), lte(schema.betriebe.besuchAb, jetzt))),
    db.select({ n: zaehle }).from(schema.postausgang).where(eq(schema.postausgang.status, "zur_freigabe")),
    db.select({ n: zaehle }).from(schema.betriebe).where(eq(schema.betriebe.status, "neu")),
    db.select({ n: zaehle }).from(schema.tickets).where(inArray(schema.tickets.status, ["neu", "in_arbeit"])),
    db.select({ n: zaehle }).from(schema.nachrichten).where(eq(schema.nachrichten.status, "unbekannt")),
  ]);
  const z = { aufgaben: aufgaben.n, besuche: besuche.n, freigaben: freigaben.n, einstufen: einstufen.n, tickets: tickets.n, unbekannt: unbekannt.n };
  return { ...z, gesamt: Object.values(z).reduce((x, y) => x + y, 0) };
}
