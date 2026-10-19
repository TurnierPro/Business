import { desc, isNotNull } from "drizzle-orm";
import { getDb, schema } from "./db";
import { BUSINESS_CASE, PLAN_MONATE, SZENARIEN, monatsplan, type SzenarioKey } from "./plan";
import { auswertung, zeitraum } from "./finanzen";

// Plan gegen Ist: Wo stehen wir im Vergleich zum Business Case?

const monatVon = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

export async function planIst(s: SzenarioKey, heute = new Date()) {
  const db = await getDb();
  const [rechnungen, ausgaben, angebote, projekte, konto] = await Promise.all([
    db.select().from(schema.rechnungen),
    db.select().from(schema.ausgaben),
    db.select().from(schema.angebote).where(isNotNull(schema.angebote.unterschriebenAm)),
    db.select().from(schema.projekte).where(isNotNull(schema.projekte.liveAm)),
    db.select().from(schema.kontostaende).orderBy(desc(schema.kontostaende.monat)),
  ]);
  const plan = monatsplan(s);
  const jetzt = monatVon(heute);
  const monate = plan.map((p) => {
    const vorbei = p.monat <= jetzt;
    const umsatz = rechnungen.filter((r) => monatVon(r.erstelltAm) === p.monat).reduce((x, r) => x + r.netto, 0);
    const kosten = ausgaben.filter((a) => monatVon(a.datum) === p.monat).reduce((x, a) => x + a.netto, 0);
    const auftraege = angebote.filter((a) => monatVon(a.unterschriebenAm!) === p.monat).length;
    return { ...p, vorbei, ist: vorbei ? { umsatz, kosten, auftraege, ergebnis: umsatz - kosten } : null };
  });
  // Aufträge und Umsatz aus der Zeit vor dem Planstart (Testphase) zählen zum ersten Planmonat
  const vorStart = {
    umsatz: rechnungen.filter((r) => monatVon(r.erstelltAm) < PLAN_MONATE[0]).reduce((x, r) => x + r.netto, 0),
    auftraege: angebote.filter((a) => monatVon(a.unterschriebenAm!) < PLAN_MONATE[0]).length,
  };
  const summe = (l: typeof monate, k: "umsatz" | "kosten" | "auftraege" | "ergebnis", ist: boolean) => l.reduce((x, m) => x + (ist ? (m.ist?.[k] ?? 0) : m[k]), 0);
  const bisHeute = monate.filter((m) => m.vorbei);
  const jahr1 = monate.slice(0, 12);

  // Gehaltsregel: eigenes Geld = Kontostand − KfW-Restschuld − fällige USt − Steuerrücklage
  const letzter = konto[0];
  let gehalt: null | { monat: string; kontostand: number; kredit: number; ust: number; ruecklage: number; eigenesGeld: number; stufe: "voll" | "basis" | "not" | "halten"; text: string } = null;
  if (letzter) {
    const kredit = letzter.monat >= BUSINESS_CASE.kreditAb ? BUSINESS_CASE.kredit : 0;
    const m = zeitraum(letzter.monat);
    const ust = Math.max(0, (await auswertung(m)).ustZahllast);
    // Steuerrücklage: 31,5 % des bisherigen Gewinns im Planzeitraum
    const ergebnisBisher = monate.filter((x) => x.monat <= letzter.monat).reduce((a, x) => a + (x.ist?.ergebnis ?? 0), 0);
    const ruecklage = Math.round(Math.max(ergebnisBisher, 0) * BUSINESS_CASE.steuersatz);
    const eigenesGeld = letzter.betrag - kredit - ust - ruecklage;
    const r = BUSINESS_CASE.gehaltsregel;
    const stufe = eigenesGeld >= r.voll ? "voll" : eigenesGeld < r.not ? "not" : eigenesGeld < r.basis ? "basis" : "halten";
    const text =
      stufe === "voll" ? "Eigenes Geld ab 20.000 €: volles Gehalt ist erlaubt."
      : stufe === "not" ? "Eigenes Geld unter −15.000 €: ab Folgemonat Notgehalt (2.500 €)."
      : stufe === "basis" ? "Eigenes Geld unter 0 €: ab Folgemonat Basisgehalt (4.500 €)."
      : "Zwischen 0 und 20.000 €: Gehaltsstufe beibehalten. Volle Gehälter nie aus dem Kredit.";
    gehalt = { monat: letzter.monat, kontostand: letzter.betrag, kredit, ust, ruecklage, eigenesGeld, stufe, text };
  }

  const r = BUSINESS_CASE.gehaltsregel;
  const auftraegeBisStichtag = angebote.filter((a) => a.unterschriebenAm! <= new Date(`${r.stichtag}T23:59:59`)).length;
  const wochenBisLive = projekte.length
    ? projekte.reduce((x, p) => x + (p.liveAm!.getTime() - p.erstelltAm.getTime()) / (7 * 864e5), 0) / projekte.length
    : null;

  return {
    szenario: SZENARIEN[s],
    monate,
    jetzt,
    bisHeute: {
      umsatzPlan: summe(bisHeute, "umsatz", false),
      umsatzIst: summe(bisHeute, "umsatz", true) + vorStart.umsatz,
      kostenPlan: summe(bisHeute, "kosten", false),
      kostenIst: summe(bisHeute, "kosten", true),
      auftraegePlan: summe(bisHeute, "auftraege", false),
      auftraegeIst: summe(bisHeute, "auftraege", true) + vorStart.auftraege,
    },
    jahr1: {
      umsatzPlan: SZENARIEN[s].umsatzJahr[0],
      umsatzIst: summe(jahr1, "umsatz", true) + vorStart.umsatz,
      auftraegePlan: SZENARIEN[s].auftraegeJahr[0],
      auftraegeIst: summe(jahr1, "auftraege", true) + vorStart.auftraege,
      ergebnisPlan: summe(jahr1, "ergebnis", false),
      ergebnisIst: summe(jahr1, "ergebnis", true),
    },
    gehalt,
    konto,
    stichtag: { datum: r.stichtag, ziel: r.auftraegeBisStichtag, ist: auftraegeBisStichtag },
    wochenBisLive,
  };
}

export type PlanIst = Awaited<ReturnType<typeof planIst>>;
