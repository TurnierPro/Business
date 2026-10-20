import { desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "./db";
import { BUSINESS_CASE } from "./plan";

// Verkaufs-Pipeline: Stufen aus dem Ablauf, Wert aus dem letzten Angebot (sonst Ø Kaufpreis aus dem Business Case),
// gewichtet mit einer Abschlusswahrscheinlichkeit je Stufe. „Liegt“ = seit X Tagen keine Aktivität.

export const STUFEN = [
  { key: "neu", name: "Gefunden", wahrscheinlichkeit: 0.03, liegtNach: 7 },
  { key: "interessant", name: "Interessant", wahrscheinlichkeit: 0.08, liegtNach: 3 },
  { key: "angeschrieben", name: "Angeschrieben", wahrscheinlichkeit: 0.12, liegtNach: 14 },
  { key: "termin", name: "Termin", wahrscheinlichkeit: BUSINESS_CASE.ziele.prozessCheckQuote, liegtNach: 7 },
  { key: "angebot", name: "Angebot", wahrscheinlichkeit: 0.6, liegtNach: 7 },
  { key: "kunde", name: "Gewonnen", wahrscheinlichkeit: 1, liegtNach: 9999 },
] as const;

export type Karte = { id: number; name: string; ort: string | null; gewerk: string; wert: number; geschaetzt: boolean; tageOhneAktivitaet: number; liegt: boolean; zustaendig: string | null; tags: string[]; naechsteAufgabe: string | null };

export async function pipeline(jetzt = new Date()) {
  const db = await getDb();
  const betriebe = await db.select().from(schema.betriebe).where(inArray(schema.betriebe.status, STUFEN.map((s) => s.key)));
  const ids = betriebe.map((b) => b.id);
  const angebote = ids.length ? await db.select().from(schema.angebote).where(inArray(schema.angebote.betriebId, ids)).orderBy(desc(schema.angebote.erstelltAm)) : [];
  const aufgaben = ids.length ? await db.select().from(schema.aktivitaeten).where(inArray(schema.aktivitaeten.betriebId, ids)) : [];
  return STUFEN.map((s) => {
    const karten: Karte[] = betriebe
      .filter((b) => b.status === s.key)
      .map((b) => {
        const a = angebote.find((x) => x.betriebId === b.id);
        const tage = Math.floor((jetzt.getTime() - b.letzteAktivitaet.getTime()) / 864e5);
        const offen = aufgaben.filter((x) => x.betriebId === b.id && !x.erledigtAm && x.faelligAm).sort((x, y) => x.faelligAm!.getTime() - y.faelligAm!.getTime())[0];
        return { id: b.id, name: b.name, ort: b.ort, gewerk: b.gewerk, wert: a?.einmalig ?? BUSINESS_CASE.oKaufpreis, geschaetzt: !a, tageOhneAktivitaet: tage, liegt: tage >= s.liegtNach, zustaendig: b.zustaendig, tags: b.tags, naechsteAufgabe: offen ? `${offen.titel} · ${offen.faelligAm!.toLocaleDateString("de-DE")}` : null };
      })
      .sort((x, y) => Number(y.liegt) - Number(x.liegt) || y.wert - x.wert);
    const summe = karten.reduce((x, k) => x + k.wert, 0);
    return { ...s, karten, summe, gewichtet: Math.round(summe * s.wahrscheinlichkeit) };
  });
}

/** Prognose: gewichteter Wert aller offenen Chancen (ohne Gewonnene). */
export function prognose(stufen: Awaited<ReturnType<typeof pipeline>>): number {
  return stufen.filter((s) => s.key !== "kunde").reduce((x, s) => x + s.gewichtet, 0);
}

export async function betriebZuweisen(id: number, zustaendig: string | null, tags: string[]): Promise<void> {
  const db = await getDb();
  await db.update(schema.betriebe).set({ zustaendig, tags: [...new Set(tags.map((t) => t.trim()).filter(Boolean))].slice(0, 20) }).where(eq(schema.betriebe.id, id));
}
