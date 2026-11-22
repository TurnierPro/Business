import { eq } from "drizzle-orm";
import { getDb, schema } from "./db";
import { protokolliere } from "./protokoll";
import { PLAN_BAUSTEINE, PLAN_MONATE, monatsplan, umsatzAus, type Stueck } from "./plan";

// Soll-Umsätze: wie wir uns entwickeln wollen. Vorgabe ist das Szenario Neutral des Business Case,
// jeder Monat lässt sich je Baustein unter Stammdaten → Soll-Umsätze anpassen.

const monatVon = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

export type Soll = { monat: string; umsatz: number; auftraege: number; stueck: Stueck; vorgabe: { umsatz: number; auftraege: number; stueck: Stueck }; geaendert: boolean };

const web = (st: Stueck) => (st.KOMPAKT ?? 0) + (st.PROFESSIONAL ?? 0);

/** Soll je Monat: Stück je Baustein (Vorgabe Szenario Neutral, eigene Werte aus Stammdaten → Soll-Umsätze). Der Umsatz wird daraus gerechnet. */
export async function sollwerte(): Promise<Soll[]> {
  const db = await getDb();
  const eigene = await db.select().from(schema.sollwerte);
  const vorgabe = monatsplan("basis");
  const stueck = vorgabe.map((p) => ({ ...p.stueck, ...(eigene.find((x) => x.monat === p.monat)?.bausteine ?? {}) }));
  const umsatz = umsatzAus(stueck);
  return vorgabe.map((p, i) => ({
    monat: p.monat,
    umsatz: umsatz[i].umsatz,
    auftraege: web(stueck[i]),
    stueck: stueck[i],
    vorgabe: { umsatz: p.umsatz, auftraege: p.auftraege, stueck: p.stueck },
    geaendert: !!eigene.find((x) => x.monat === p.monat)?.bausteine,
  }));
}

export async function sollSpeichern(werte: { monat: string; stueck: Stueck }[], wer: string): Promise<number> {
  const db = await getDb();
  const vorgabe = monatsplan("basis");
  let n = 0;
  for (const w of werte) {
    if (!PLAN_MONATE.includes(w.monat)) throw new Error(`Monat ${w.monat} liegt nicht im Planzeitraum`);
    const st: Stueck = {};
    for (const b of PLAN_BAUSTEINE) {
      const v = w.stueck[b.key] ?? 0;
      if (!(Number.isInteger(v) && v >= 0 && v < 1000)) throw new Error(`Monat ${w.monat}: ${b.name} ungültig`);
      st[b.key] = v;
    }
    const v = vorgabe.find((p) => p.monat === w.monat)!;
    if (PLAN_BAUSTEINE.every((b) => st[b.key] === (v.stueck[b.key] ?? 0))) {
      await db.delete(schema.sollwerte).where(eq(schema.sollwerte.monat, w.monat));
      continue;
    }
    const zeile = { umsatz: 0, auftraege: web(st), bausteine: st, geaendertVon: wer, geaendertAm: new Date() }; // umsatz wird beim Lesen gerechnet
    await db.insert(schema.sollwerte).values({ monat: w.monat, ...zeile }).onConflictDoUpdate({ target: schema.sollwerte.monat, set: zeile });
    n++;
  }
  await protokolliere(wer, `Soll gespeichert (${n} Monate abweichend vom Business Case)`);
  return n;
}

/** Soll gegen Ist für Monat, Quartal und Jahr (Geschäftsjahr = Kalenderjahr). */
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
  const geschaeftsjahr = Array.from({ length: 12 }, (_, i) => monatVon(new Date(heute.getFullYear(), i, 1))); // Geschäftsjahr = Kalenderjahr
  const bereich = (name: string, monate: string[]) => ({ name, soll: summe(monate), ist: ist(monate), imPlan: monate.some((m) => PLAN_MONATE.includes(m)) });
  return {
    zeitraeume: [bereich("Dieser Monat", [jetzt]), bereich("Dieses Quartal", quartal), bereich(`Jahr ${heute.getFullYear()}`, geschaeftsjahr)],
    naechste: soll.filter((s) => s.monat >= jetzt).slice(0, 6).map((s) => ({ ...s, ist: ist([s.monat]) })),
  };
}
