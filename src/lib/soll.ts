import { eq } from "drizzle-orm";
import { getDb, schema } from "./db";
import { protokolliere } from "./protokoll";
import { PLAN_MONATE, monatsplan } from "./plan";

// Soll-Umsätze: wie wir uns entwickeln wollen. Vorgabe ist das Basis-Szenario des Business Case,
// jeder Monat lässt sich unter Stammdaten → Ziele anpassen.

const monatVon = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

export type Soll = { monat: string; umsatz: number; auftraege: number; vorgabe: { umsatz: number; auftraege: number }; geaendert: boolean };

export async function sollwerte(): Promise<Soll[]> {
  const db = await getDb();
  const eigene = await db.select().from(schema.sollwerte);
  return monatsplan("basis").map((p) => {
    const e = eigene.find((x) => x.monat === p.monat);
    return { monat: p.monat, umsatz: e?.umsatz ?? p.umsatz, auftraege: e?.auftraege ?? p.auftraege, vorgabe: { umsatz: p.umsatz, auftraege: p.auftraege }, geaendert: !!e };
  });
}

export async function sollSpeichern(werte: { monat: string; umsatz: number; auftraege: number }[], wer: string): Promise<number> {
  const db = await getDb();
  const vorgabe = monatsplan("basis");
  let n = 0;
  for (const w of werte) {
    if (!PLAN_MONATE.includes(w.monat)) throw new Error(`Monat ${w.monat} liegt nicht im Planzeitraum`);
    if (!(w.umsatz >= 0 && w.umsatz < 1e10 && Number.isInteger(w.auftraege) && w.auftraege >= 0 && w.auftraege < 1000)) throw new Error(`Monat ${w.monat}: Werte ungültig`);
    const v = vorgabe.find((p) => p.monat === w.monat)!;
    if (w.umsatz === v.umsatz && w.auftraege === v.auftraege) {
      await db.delete(schema.sollwerte).where(eq(schema.sollwerte.monat, w.monat));
      continue;
    }
    await db.insert(schema.sollwerte).values({ ...w, geaendertVon: wer }).onConflictDoUpdate({ target: schema.sollwerte.monat, set: { umsatz: w.umsatz, auftraege: w.auftraege, geaendertVon: wer, geaendertAm: new Date() } });
    n++;
  }
  await protokolliere(wer, `Soll-Umsätze gespeichert (${n} Monate abweichend vom Business Case)`);
  return n;
}

/** Soll gegen Ist für Monat, Quartal und Geschäftsjahr (Dezember bis November). */
export async function sollIst(heute = new Date()) {
  const db = await getDb();
  const [soll, rechnungen, angebote] = await Promise.all([sollwerte(), db.select().from(schema.rechnungen), db.select().from(schema.angebote)]);
  const ist = (monate: string[]) => ({
    umsatz: rechnungen.filter((r) => monate.includes(monatVon(r.erstelltAm))).reduce((x, r) => x + r.netto, 0),
    auftraege: angebote.filter((a) => a.unterschriebenAm && monate.includes(monatVon(a.unterschriebenAm))).length,
  });
  const summe = (monate: string[]) => soll.filter((s) => monate.includes(s.monat)).reduce((x, s) => ({ umsatz: x.umsatz + s.umsatz, auftraege: x.auftraege + s.auftraege }), { umsatz: 0, auftraege: 0 });
  const jetzt = monatVon(heute);
  const q = Math.floor(heute.getMonth() / 3);
  const quartal = [0, 1, 2].map((i) => monatVon(new Date(heute.getFullYear(), q * 3 + i, 1)));
  const gjStart = heute.getMonth() === 11 ? heute.getFullYear() : heute.getFullYear() - 1;
  const geschaeftsjahr = Array.from({ length: 12 }, (_, i) => monatVon(new Date(gjStart, 11 + i, 1)));
  const bereich = (name: string, monate: string[]) => ({ name, soll: summe(monate), ist: ist(monate), imPlan: monate.some((m) => PLAN_MONATE.includes(m)) });
  return {
    zeitraeume: [bereich("Dieser Monat", [jetzt]), bereich("Dieses Quartal", quartal), bereich(`Geschäftsjahr ${gjStart}/${String(gjStart + 1).slice(2)}`, geschaeftsjahr)],
    naechste: soll.filter((s) => s.monat >= jetzt).slice(0, 6).map((s) => ({ ...s, ist: ist([s.monat]) })),
  };
}
