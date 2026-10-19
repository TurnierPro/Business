// Business Case als Code (Stand 18.10.2026). Planzeitraum Dez 2026 bis Nov 2028.
// Feste Werte stehen im Business Case. Wo er nur Spannen nennt, ist die Verteilung eine Annahme (unten markiert).
// Ändert sich der Business Case, nur hier anpassen.

export type SzenarioKey = "vorsichtig" | "basis" | "ambitioniert";

export const PLAN_START = "2026-12";
export const PLAN_MONATE = Array.from({ length: 24 }, (_, i) => {
  const d = new Date(2026, 11 + i, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
});

// Aufträge je Monat Dez 2026 … Nov 2028. Business Case: Startmonate und Spannen; Summen je Jahr stimmen exakt.
// Annahme: Dezember ohne Aufträge (Akquise erst nach Notartermin), Spannen gleichmäßig aufgefüllt.
const AUFTRAEGE: Record<SzenarioKey, number[]> = {
  vorsichtig: [0, 1, 2, 1, 2, 2, 2, 3, 2, 3, 2, 3, /* Jahr 2 */ 3, 4, 4, 4, 4, 4, 4, 3, 3, 4, 4, 3],
  basis: [0, 2, 3, 2, 3, 3, 3, 4, 3, 4, 4, 4, /* Jahr 2 */ 4, 5, 5, 5, 6, 6, 6, 6, 4, 6, 6, 6],
  ambitioniert: [0, 3, 4, 4, 5, 6, 6, 6, 5, 6, 6, 7, /* Jahr 2 */ 6, 8, 8, 8, 8, 8, 8, 7, 6, 8, 8, 7],
};

export const SZENARIEN: Record<SzenarioKey, { name: string; beschreibung: string; umsatzJahr: [number, number]; auftraegeJahr: [number, number]; tiefsterKontostand: number; vollesGehaltAb: string; notgehaltMonate: number }> = {
  vorsichtig: { name: "Vorsichtig", beschreibung: "1/2/1 Aufträge, dann 2–4", umsatzJahr: [10648600, 29169600], auftraegeJahr: [23, 44], tiefsterKontostand: -523600, vollesGehaltAb: "2028-07", notgehaltMonate: 7 },
  basis: { name: "Basis", beschreibung: "2/3/2 Aufträge, dann 3–5, 2028 4–6", umsatzJahr: [16621900, 43643200], auftraegeJahr: [35, 65], tiefsterKontostand: -317200, vollesGehaltAb: "2028-01", notgehaltMonate: 0 },
  ambitioniert: { name: "Ambitioniert", beschreibung: "3/4/4 Aufträge, dann 5–8", umsatzJahr: [27675800, 63357800], auftraegeJahr: [58, 90], tiefsterKontostand: -145500, vollesGehaltAb: "2027-07", notgehaltMonate: 0 },
};

export const BUSINESS_CASE = {
  fixkostenMonat: 390000,
  einmalkosten: 1675000,
  variabelJeProjekt: 60000, // 700 € bei „Entlastet“
  variabelL: 70000,
  anteilL: 0.15,
  oKaufpreis: 480000,
  oBetreuung: 23300,
  steuersatz: 0.315,
  stammkapital: 1250000,
  kredit: 3000000, // Auszahlung Feb 2027, 2 Jahre tilgungsfrei
  kreditAb: "2027-02",
  kontokorrent: 1000000,
  kapitalbedarf: 2460000,
  gehalt: { maxVoll: 780000, danielVoll: 830000, basis: 450000, not: 250000, danielStart: 100000 },
  gehaltsregel: { voll: 2000000, basis: 0, not: -1500000, stichtag: "2027-03-15", auftraegeBisStichtag: 12 },
  ziele: { stundenS: 12, betreuungStundenJeKunde: 1, prozessCheckQuote: 0.4, wochenBisLivegang: 6 },
};

// Einmalkosten Dez–Mär (Summe 16.750 € laut Business Case). Annahme zur Verteilung auf die Monate.
const EINMAL: Record<string, number> = {
  "2026-12": 350000 + 400000 + 200000, // Gründung, Rechtsberatung, 2 iPhones
  "2027-01": 350000, // MacBook Pro, Monitor, iPad, Zubehör
  "2027-02": 155000, // MacBook Air Daniel
  "2027-03": 100000 + 120000, // Leasing-Bereitstellung, Wallbox
};

function gehaelter(monat: string, s: SzenarioKey): number {
  const g = BUSINESS_CASE.gehalt;
  const voll = monat >= SZENARIEN[s].vollesGehaltAb;
  const not = s === "vorsichtig" && monat >= "2027-12" && monat < "2028-07";
  const stufe = (vollBetrag: number) => (voll ? vollBetrag : not ? g.not : g.basis);
  const max = monat < "2027-04" ? 0 : stufe(g.maxVoll); // bis März zahlt Max' Arbeitgeber
  const daniel = monat < "2027-06" ? g.danielStart : stufe(g.danielVoll); // bis Mai 1.000 € plus Gründungszuschuss
  return max + daniel;
}

export type PlanMonat = { monat: string; auftraege: number; umsatz: number; kosten: number; ergebnis: number; betreuungskunden: number };

/** Monatsplan: Umsatz aus Aufträgen (50 % bei Auftrag, 50 % im Folgemonat) und Betreuung, auf die Jahresumsätze des Business Case skaliert. */
export function monatsplan(s: SzenarioKey): PlanMonat[] {
  const a = AUFTRAEGE[s];
  const bc = BUSINESS_CASE;
  const roh = a.map((n, i) => {
    const kunden = a.slice(0, Math.max(0, i - 1)).reduce((x, y) => x + y, 0); // live zwei Monate nach Auftrag
    return { kunden, umsatz: (n * bc.oKaufpreis) / 2 + ((a[i - 1] ?? 0) * bc.oKaufpreis) / 2 + kunden * bc.oBetreuung };
  });
  const faktor = [0, 1].map((j) => SZENARIEN[s].umsatzJahr[j] / roh.slice(j * 12, j * 12 + 12).reduce((x, r) => x + r.umsatz, 0));
  const variabel = bc.variabelJeProjekt * (1 - bc.anteilL) + bc.variabelL * bc.anteilL;
  return PLAN_MONATE.map((monat, i) => {
    const umsatz = Math.round(roh[i].umsatz * faktor[i < 12 ? 0 : 1]);
    const kosten = bc.fixkostenMonat + (EINMAL[monat] ?? 0) + Math.round(a[i] * variabel) + gehaelter(monat, s);
    return { monat, auftraege: a[i], umsatz, kosten, ergebnis: umsatz - kosten, betreuungskunden: roh[i].kunden };
  });
}

export const ANNAHMEN = [
  "Aufträge je Monat innerhalb der Spannen des Business Case verteilt; Jahressummen stimmen.",
  "Umsatzverlauf: 50 % im Auftragsmonat, 50 % im Folgemonat, Betreuung ab dem zweiten Monat nach Auftrag; auf die Jahresumsätze des Business Case skaliert.",
  "Kosten: Fixkosten 3.900 €, Einmalkosten Dez–Mär, 600 € je Projekt (700 € bei Entlastet), Gehälter (Arbeitgeberkosten) nach Szenario und Gehaltsregel.",
  "Steuern (31,5 %), Kredit, Kontokorrent und Umsatzsteuer sind nicht im Monatsergebnis, sondern in der Gehaltsregel berücksichtigt.",
];
