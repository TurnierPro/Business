// Business Case als Code (Stand 18.10.2026). Planzeitraum Dez 2026 bis Nov 2028.
// Feste Werte stehen im Business Case. Wo er nur Spannen nennt, ist die Verteilung eine Annahme (unten markiert).
// Ändert sich der Business Case, nur hier anpassen.

import { PAKETE } from "./pakete";
import { MODULE } from "./katalog";

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
  const max = monat < "2027-04" ? 0 : stufe(g.maxVoll); // bis März zahlt Maximilian' Arbeitgeber
  const daniel = monat < "2027-06" ? g.danielStart : stufe(g.danielVoll); // bis Mai 1.000 € plus Gründungszuschuss
  return max + daniel;
}

// Bausteine im Plan: zwei Webauftritte, drei Module. Preise kommen aus dem Baukasten (pakete.ts, katalog.ts).
export const PLAN_BAUSTEINE = [
  { key: "KOMPAKT", name: "Kompakt", einmalig: PAKETE.KOMPAKT.einmalig, monatlich: PAKETE.KOMPAKT.monatlich, web: true },
  { key: "PROFESSIONAL", name: "Prof.", einmalig: PAKETE.PROFESSIONAL.einmalig, monatlich: PAKETE.PROFESSIONAL.monatlich, web: true },
  ...MODULE.map((m) => ({ key: m.key, name: m.key === "kundenmanagement" ? "Kundenm." : m.name.split(" ")[0], einmalig: m.einmalig ?? 0, monatlich: m.monatlich, web: false })),
] as const;
export type Stueck = Record<string, number>;

// [A] Annahmen je Szenario, bis Dok. 43 eigene Modulquoten liefert:
// Anteil Professional an den Webauftritten und Modulquote je verkauftem Webauftritt.
export const QUOTEN: Record<SzenarioKey, { PROFESSIONAL: number; personal: number; marketing: number; kundenmanagement: number }> = {
  vorsichtig: { PROFESSIONAL: 0.3, personal: 0.1, marketing: 0.1, kundenmanagement: 0.05 },
  basis: { PROFESSIONAL: 0.4, personal: 0.15, marketing: 0.15, kundenmanagement: 0.1 },
  ambitioniert: { PROFESSIONAL: 0.5, personal: 0.2, marketing: 0.2, kundenmanagement: 0.15 },
};
// Bis April 2027 verkauft Daniel nur den Webauftritt (Beweisphase); Module ab Mai 2027 (Start Kundenmanagement-Pilot).
export const MODULE_AB = "2027-05";
const PILOT_KM = 2; // die ersten zwei Kundenmanagement-Betriebe zum Pilotpreis
const LIVE_NACH = 2; // Monate vom Auftrag bis zum Livegang

/** Stückzahlen je Monat und Baustein aus Aufträgen und Quoten (kumuliert gerundet, damit die Summen stimmen). */
export function planStueck(s: SzenarioKey): Stueck[] {
  const a = AUFTRAEGE[s];
  const q = QUOTEN[s];
  const kum = (i: number, quote: number, ab = "") => Math.round(a.slice(0, i + 1).reduce((x, n, j) => x + (PLAN_MONATE[j] >= ab ? n : 0), 0) * quote);
  return a.map((n, i) => {
    const anteil = (k: keyof typeof q, ab = "") => kum(i, q[k], ab) - (i ? kum(i - 1, q[k], ab) : 0);
    const pro = anteil("PROFESSIONAL");
    return { KOMPAKT: n - pro, PROFESSIONAL: pro, personal: anteil("personal", MODULE_AB), marketing: anteil("marketing", MODULE_AB), kundenmanagement: anteil("kundenmanagement", MODULE_AB) };
  });
}

export type PlanUmsatz = { einmalig: number; beitraege: number; umsatz: number; vertraege: number };

/** Umsatz aus Stückzahlen: einmalig 50 % bei Auftrag, 50 % beim Livegang (2 Monate später); Monatsbeitrag ab Livegang. */
export function umsatzAus(stueck: Stueck[]): PlanUmsatz[] {
  const kmPilot = MODULE.find((m) => m.key === "kundenmanagement")?.pilot?.einmalig;
  let kmBisher = 0;
  const einmalJeMonat = stueck.map((st) =>
    PLAN_BAUSTEINE.reduce((x, b) => {
      const n = st[b.key] ?? 0;
      if (b.key === "kundenmanagement" && kmPilot) {
        const pilot = Math.max(0, Math.min(n, PILOT_KM - kmBisher));
        kmBisher += n;
        return x + pilot * kmPilot + (n - pilot) * b.einmalig;
      }
      return x + n * b.einmalig;
    }, 0),
  );
  return stueck.map((_, i) => {
    const einmalig = Math.round(einmalJeMonat[i] / 2 + (einmalJeMonat[i - LIVE_NACH] ?? 0) / 2);
    const live = stueck.slice(0, Math.max(0, i - LIVE_NACH + 1));
    const beitraege = live.reduce((x, st) => x + PLAN_BAUSTEINE.reduce((y, b) => y + (st[b.key] ?? 0) * b.monatlich, 0), 0);
    const vertraege = live.reduce((x, st) => x + (st.KOMPAKT ?? 0) + (st.PROFESSIONAL ?? 0), 0);
    return { einmalig, beitraege, umsatz: einmalig + beitraege, vertraege };
  });
}

export type PlanMonat = { monat: string; auftraege: number; stueck: Stueck; einmalig: number; beitraege: number; umsatz: number; kosten: number; ergebnis: number; betreuungskunden: number };

/** Monatsplan je Szenario: Umsatz aus den Bausteinen, Kosten aus Fixkosten (Plan je Kategorie), Einmalkosten, Projektkosten und Gehältern. */
export function monatsplan(s: SzenarioKey, fixkostenMonat: number = BUSINESS_CASE.fixkostenMonat): PlanMonat[] {
  const stueck = planStueck(s);
  const u = umsatzAus(stueck);
  const variabel = BUSINESS_CASE.variabelJeProjekt;
  return PLAN_MONATE.map((monat, i) => {
    const auftraege = (stueck[i].KOMPAKT ?? 0) + (stueck[i].PROFESSIONAL ?? 0);
    const kosten = fixkostenMonat + (EINMAL[monat] ?? 0) + auftraege * variabel + gehaelter(monat, s);
    return { monat, auftraege, stueck: stueck[i], einmalig: u[i].einmalig, beitraege: u[i].beitraege, umsatz: u[i].umsatz, kosten, ergebnis: u[i].umsatz - kosten, betreuungskunden: u[i].vertraege };
  });
}

export const ANNAHMEN = [
  "[A] Webauftritte je Monat innerhalb der Spannen des Szenarios verteilt.",
  "[A] Anteil Professional und Modulquoten je Szenario (siehe Tabelle oben), Module ab Mai 2027; die ersten zwei Kundenmanagement-Betriebe zum Pilotpreis.",
  "Umsatz: einmalig 50 % bei Auftrag, 50 % beim Livegang zwei Monate später; Monatsbeiträge ab Livegang, laufend über 24 Monate.",
  "Kosten: Plan je Kategorie aus den Finanzen, Einmalkosten Dez–Mär, 600 € je Webauftritt, Gehälter (Arbeitgeberkosten) nach Szenario.",
  "Steuern (31,5 %), Kredit, Kontokorrent und Umsatzsteuer sind nicht im Monatsergebnis, sondern in der Gehaltsregel berücksichtigt.",
];
