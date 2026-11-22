// Business Case als Code (Stand November 2026, Liquiditätsmodell 17.11.2026). Planzeitraum Dezember 2026 bis Dezember 2029.
// Quelle: Levarex Business Case, Kapitel 4 (Angebot), 9 (Kapazität), 10 (Finanzplan), 11 (Gehalt).
// Wo der Business Case nichts festlegt, ist der Wert eine Annahme und mit [A] markiert. Ändert sich der Business Case, nur hier anpassen.

import { PAKETE } from "./pakete";
import { MODULE } from "./katalog";

// Schlüssel bleiben aus technischen Gründen; die Namen sind die des Business Case.
export type SzenarioKey = "vorsichtig" | "basis" | "ambitioniert";

export const PLAN_START = "2026-12";
export const PLAN_MONATE = Array.from({ length: 37 }, (_, i) => {
  const d = new Date(2026, 11 + i, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
});
export const PLAN_JAHRE = [2027, 2028, 2029];

const jahr = (monat: string) => Number(monat.slice(0, 4));

export const SZENARIEN: Record<SzenarioKey, { name: string; beschreibung: string; vollesGehaltAb: string; bc: { einnahmen: number[]; ergebnis: number[]; kontoEnde: number[]; tiefsterKontostand: number } }> = {
  vorsichtig: { name: "Minimal", beschreibung: "4 Websites pro Monat (Anfang 2027) bis 8 (2029), je 1 Personal und Marketing pro Monat. Danach planen wir Liquidität und Gehalt.", vollesGehaltAb: "2027-11", bc: { einnahmen: [21000000, 39500000, 59000000], ergebnis: [300000, 6200000, 17300000], kontoEnde: [2167900, 8661300, 24460400], tiefsterKontostand: 448000 } },
  basis: { name: "Neutral", beschreibung: "8 Websites pro Monat, Marketing bei 25 %, Personal bei 12,5 %, Nachkauf ≈ 22 % im ersten Jahr, Kundenmanagement 1 pro Monat (ab 2028: 2). Darauf arbeiten wir hin.", vollesGehaltAb: "2027-04", bc: { einnahmen: [42600000, 83700000, 116700000], ergebnis: [11000000, 39200000, 59800000], kontoEnde: [13892800, 50516900, 99217100], tiefsterKontostand: 670500 } },
  ambitioniert: { name: "Best Case", beschreibung: "10 Websites pro Monat, Marketing bei 50 %, Personal bei 20 %, Nachkauf ≈ 30 %, Kundenmanagement 1 (2028: 2, 2029: 3). Das Ziel.", vollesGehaltAb: "2027-03", bc: { einnahmen: [67000000, 131100000, 189800000], ergebnis: [27000000, 71800000, 109800000], kontoEnde: [30683000, 95341300, 185238600], tiefsterKontostand: 801300 } },
};

export const BUSINESS_CASE = {
  stammkapital: 1250000, // eingezahlt (je 6.250 €), kein Kredit
  kredit: 0,
  kreditAb: "2099-01",
  steuersatz: 0.284, // Ertragsteuer Stutensee
  kuendigungMonat: 0.004, // 0,4 % der Monatsbeiträge pro Monat
  gehalt: { mindest: 593000, voll: 857000, steigerung: 0.1, danielAb: "2027-02", maximilianAb: "2027-04" },
  gehaltsregel: { voll: 2000000, basis: 0, not: -1500000, stichtag: "2027-03-15", auftraegeBisStichtag: 12 },
  // Für Pipeline und Kennzahlen
  oKaufpreis: Math.round((3 * PAKETE.KOMPAKT.einmalig + PAKETE.PROFESSIONAL.einmalig) / 4),
  ziele: { stundenS: 4, betreuungStundenJeKunde: 1, prozessCheckQuote: 0.4, wochenBisLivegang: 6 },
};

/** Laufende Kosten je Monat ohne Gehälter (Business Case, Grundannahmen). */
export function laufendeKosten(monat: string): number {
  if (monat < "2027-01") return 50800 + 26000; // Dezember 2026: Steuerberatung, Software und Hosting
  const software = monat < "2027-05" ? 42000 : 47000;
  const dienstwagen = monat >= "2027-02" ? 87000 : 0; // Daniel ab Februar
  const versicherungen = monat.endsWith("-01") ? 296600 : 0; // jährlich im Januar
  return 50800 + 6900 + software + 40000 + 15000 + dienstwagen + 30000 + versicherungen; // Steuerberatung, IHK u. a., Software, Rechtsberatung, Handy und Büro, Dienstwagen, KI
}

// [A] Laufende Kosten je Kunde mit Website (KI, Hosting, Betrieb). Der Business Case nennt „KI-Kosten 300 € + je Kunde“ ohne Betrag;
// 25 € passt über alle drei Szenarien und Jahre am besten zu den Ergebnissen des Liquiditätsmodells.
export const KOSTEN_JE_KUNDE = 2500;

// Einstellungen (Business Case, Kapitel 9: erste Einstellung und Mitarbeitende Ende 2029); Vollzeitkraft ≈ 4.300 € im Monat.
// [A] Verteilung der weiteren Einstellungen bis Ende 2029.
const VOLLZEIT = 430000;
const EINSTELLUNGEN: Record<SzenarioKey, string[]> = {
  vorsichtig: ["2028-03", "2029-01"],
  basis: ["2027-05", "2028-01", "2028-07", "2029-01"],
  ambitioniert: ["2027-04", "2027-07", "2027-10", "2028-01", "2028-04", "2028-07", "2028-10", "2029-01", "2029-04"],
};
export const personal = (s: SzenarioKey, monat: string) => EINSTELLUNGEN[s].filter((ab) => monat >= ab).length;

// Einmalige Kosten: Gründung und Anschaffungen (Business Case, Tabelle Seite 10)
const EINMAL: Record<string, number> = {
  "2026-12": 120000 + 200000 + 50000, // Notar und Handelsregister, Rechtsberatung 1. Rate, Gründungsnebenkosten
  "2027-01": 200000 + 25000 + 90000 + 100000 + 34000, // Rechtsberatung 2. Rate, Lohnbuchhaltung, iPad Pro, Smartphone, Plaud Note Pro
};

/** Bruttogehälter beider Geschäftsführer (gleiches Gehalt; Mindestgehalt bis „volles Gehalt ab“, dann +10 % je Jahr). */
export function gehaelter(monat: string, s: SzenarioKey): { daniel: number; maximilian: number } {
  const g = BUSINESS_CASE.gehalt;
  const voll = monat >= SZENARIEN[s].vollesGehaltAb;
  const hoehe = voll ? Math.round((g.voll * (1 + g.steigerung) ** Math.max(0, jahr(monat) - 2027)) / 100) * 100 : g.mindest; // volle Euro: 8.570, 9.427, 10.370
  return { daniel: monat >= g.danielAb ? hoehe : 0, maximilian: monat >= g.maximilianAb ? hoehe : 0 };
}

// Bausteine im Plan: zwei Webauftritte, drei Module. Preise kommen aus dem Baukasten (pakete.ts, katalog.ts).
export const PLAN_BAUSTEINE = [
  { key: "KOMPAKT", name: "Kompakt", einmalig: PAKETE.KOMPAKT.einmalig, monatlich: PAKETE.KOMPAKT.monatlich, web: true },
  { key: "PROFESSIONAL", name: "Prof.", einmalig: PAKETE.PROFESSIONAL.einmalig, monatlich: PAKETE.PROFESSIONAL.monatlich, web: true },
  ...MODULE.map((m) => ({ key: m.key, name: m.key === "kundenmanagement" ? "Kundenm." : m.name.split(" ")[0], einmalig: m.einmalig ?? 0, monatlich: m.monatlich, web: false })),
] as const;
export type Stueck = Record<string, number>;

// Mengen je Szenario (Business Case, Tabelle „Drei Szenarien“)
type Mengen = { websites: (monat: string) => number; anteilProfessional: number; personal: (w: number, monat: string) => number; marketing: (w: number, monat: string) => number; nachkauf: number; kundenmanagement: (monat: string) => number };
export const MENGEN: Record<SzenarioKey, Mengen> = {
  vorsichtig: {
    // 4 (Anfang 2027) → 8 (2029); 2027 laut Monatstabelle 4/5/6, [A] 2028 7
    websites: (m) => (m < "2027-01" ? 0 : m < "2027-05" ? 4 : m < "2027-09" ? 5 : m < "2028-01" ? 6 : m < "2029-01" ? 7 : 8),
    anteilProfessional: 0.3, // je Monat gerundet: 4 → 1, 5 → 2, 6 → 2 Professional; ergibt genau die Einmalzahlungen der Monatstabelle
    personal: (_w, m) => (m < "2027-01" ? 0 : 1),
    marketing: (_w, m) => (m < "2027-01" ? 0 : 1),
    nachkauf: 0,
    kundenmanagement: () => 0,
  },
  basis: {
    websites: (m) => (m < "2027-01" ? 0 : 8),
    anteilProfessional: 0.3, // [A] wie Minimal
    personal: (w) => w * 0.125,
    marketing: (w) => w * 0.25,
    nachkauf: 0.22,
    kundenmanagement: (m) => (m < "2027-05" ? 0 : m < "2028-01" ? 1 : 2), // Pilotbetriebe ab Mai 2027
  },
  ambitioniert: {
    websites: (m) => (m < "2027-01" ? 0 : 10),
    anteilProfessional: 0.3, // [A] wie Minimal
    personal: (w) => w * 0.2,
    marketing: (w) => w * 0.5,
    nachkauf: 0.3,
    kundenmanagement: (m) => (m < "2027-05" ? 0 : m < "2028-01" ? 1 : m < "2029-01" ? 2 : 3),
  },
};
// Für die Anzeige „Quoten im Szenario“
export const QUOTEN: Record<SzenarioKey, { PROFESSIONAL: number; personal: string; marketing: string; nachkauf: number; kundenmanagement: string }> = {
  vorsichtig: { PROFESSIONAL: 0.3, personal: "1 pro Monat", marketing: "1 pro Monat", nachkauf: 0, kundenmanagement: "–" },
  basis: { PROFESSIONAL: 0.3, personal: "12,5 %", marketing: "25 %", nachkauf: 0.22, kundenmanagement: "1 pro Monat, ab 2028: 2" },
  ambitioniert: { PROFESSIONAL: 0.3, personal: "20 %", marketing: "50 %", nachkauf: 0.3, kundenmanagement: "1, 2028: 2, 2029: 3 pro Monat" },
};
export const MODULE_AB = "2027-01";
const PILOT_KM = 2; // die ersten zwei Kundenmanagement-Betriebe zum Pilotpreis
const LIVE_NACH = 1; // Livegang einen Monat nach Auftrag (Business Case: zweite Hälfte „einen Monat später“)

/** Stückzahlen je Monat und Baustein (kumuliert gerundet, damit Quoten über die Zeit stimmen). */
export function planStueck(s: SzenarioKey): Stueck[] {
  const m = MENGEN[s];
  const w = PLAN_MONATE.map((monat) => m.websites(monat));
  const kum: Record<string, number> = { PROFESSIONAL: 0, personal: 0, marketing: 0, nachkauf: 0 };
  const gerundet: Record<string, number> = { PROFESSIONAL: 0, personal: 0, marketing: 0, nachkauf: 0 };
  const schritt = (k: string, wert: number) => {
    kum[k] += wert;
    const neu = Math.round(kum[k]) - gerundet[k];
    gerundet[k] += neu;
    return neu;
  };
  return PLAN_MONATE.map((monat, i) => {
    const pro = Math.round(w[i] * m.anteilProfessional); // je Monat gerundet (so in der Monatstabelle des Business Case)
    // Nachkauf: der Anteil der Kunden der letzten 12 Monate, der im ersten Jahr ein Modul dazukauft ([A] je zur Hälfte Personal und Marketing)
    const nach = schritt("nachkauf", (m.nachkauf / 12) * w.slice(Math.max(0, i - 12), i).reduce((x, y) => x + y, 0));
    const nachPersonal = Math.floor(nach / 2);
    return {
      KOMPAKT: w[i] - pro,
      PROFESSIONAL: pro,
      personal: schritt("personal", m.personal(w[i], monat)) + nachPersonal,
      marketing: schritt("marketing", m.marketing(w[i], monat)) + (nach - nachPersonal),
      kundenmanagement: m.kundenmanagement(monat),
    };
  });
}

export type PlanUmsatz = { einmalig: number; beitraege: number; umsatz: number; vertraege: number };

/** Umsatz aus Stückzahlen: einmalig 50 % bei Unterschrift, 50 % beim Livegang einen Monat später; Monatsbeitrag ab Livegang, 0,4 % Kündigungen im Monat. */
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
  const monatlichNeu = stueck.map((st) => PLAN_BAUSTEINE.reduce((y, b) => y + (st[b.key] ?? 0) * b.monatlich, 0));
  let beitraege = 0;
  let vertraege = 0;
  return stueck.map((_, i) => {
    const einmalig = Math.round(einmalJeMonat[i] / 2 + (einmalJeMonat[i - LIVE_NACH] ?? 0) / 2);
    beitraege = beitraege * (1 - BUSINESS_CASE.kuendigungMonat) + (monatlichNeu[i - LIVE_NACH] ?? 0);
    vertraege += i >= LIVE_NACH ? (stueck[i - LIVE_NACH].KOMPAKT ?? 0) + (stueck[i - LIVE_NACH].PROFESSIONAL ?? 0) : 0;
    const b = Math.round(beitraege / 100) * 100; // volle Euro
    return { einmalig, beitraege: b, umsatz: einmalig + b, vertraege };
  });
}

export type PlanMonat = { monat: string; auftraege: number; stueck: Stueck; einmalig: number; beitraege: number; umsatz: number; kosten: number; gehalt: number; ergebnis: number; konto: number; betreuungskunden: number };

/**
 * Monatsplan je Szenario: Umsatz aus den Bausteinen; Kosten = laufende Kosten (Business Case oder Plan je Kategorie) + Einmalkosten;
 * Gehälter getrennt. Konto ab Stammkapital, ohne Steuerzahlungen (die Rücklage von 28,4 % mindert nur das eigene Geld).
 */
export function monatsplan(s: SzenarioKey, fixkostenMonat?: number): PlanMonat[] {
  const stueck = planStueck(s);
  const u = umsatzAus(stueck);
  let konto = BUSINESS_CASE.stammkapital;
  return PLAN_MONATE.map((monat, i) => {
    const auftraege = (stueck[i].KOMPAKT ?? 0) + (stueck[i].PROFESSIONAL ?? 0);
    const laufend = fixkostenMonat !== undefined && monat >= "2027-01" ? fixkostenMonat : laufendeKosten(monat);
    const kosten = laufend + (EINMAL[monat] ?? 0) + u[i].vertraege * KOSTEN_JE_KUNDE + personal(s, monat) * VOLLZEIT;
    const g = gehaelter(monat, s);
    const gehalt = g.daniel + g.maximilian;
    const ergebnis = u[i].umsatz - kosten - gehalt;
    konto += ergebnis;
    return { monat, auftraege, stueck: stueck[i], einmalig: u[i].einmalig, beitraege: u[i].beitraege, umsatz: u[i].umsatz, kosten, gehalt, ergebnis, konto, betreuungskunden: u[i].vertraege };
  });
}

/** Jahreswerte (Kalenderjahr) eines Monatsplans. */
export function jahreswerte(plan: PlanMonat[]) {
  return PLAN_JAHRE.map((j) => {
    const l = plan.filter((m) => jahr(m.monat) === j);
    const sum = (k: "umsatz" | "kosten" | "gehalt" | "ergebnis" | "auftraege") => l.reduce((x, m) => x + m[k], 0);
    return { jahr: j, umsatz: sum("umsatz"), kosten: sum("kosten"), gehalt: sum("gehalt"), ergebnis: sum("ergebnis"), auftraege: sum("auftraege"), kontoEnde: l.at(-1)?.konto ?? 0 };
  });
}

export const ANNAHMEN = [
  "Mengen, Modulquoten, Nachkauf und Kundenmanagement je Szenario aus dem Business Case (Tabelle „Drei Szenarien“).",
  "Zahlung: 50 % bei Unterschrift, 50 % beim Livegang einen Monat später; Monatsbeitrag ab Livegang; 0,4 % Kündigungen im Monat.",
  "Kosten: Steuerberatung 508 €, IHK u. a. 69 €, Software und Hosting 260/420/470 €, Rechtsberatung 400 €, Handy und Büro 150 €, Dienstwagen 870 € (ab Februar), KI 300 €, Versicherungen 2.966 € im Januar; Gründung und Anschaffungen Dezember/Januar.",
  "Gehalt: beide gleich, Mindestgehalt 5.930 € brutto, volles Gehalt 8.570 € ab dem Monat laut Szenario, danach +10 % je Jahr; Daniel ab Februar, Maximilian ab April 2027.",
  "Einstellungen: erste Einstellung Minimal März 2028, Neutral Mai 2027, Best Case April 2027; Ende 2029 2, 4 bzw. 9 Mitarbeitende zu je 4.300 € im Monat.",
  "[A] Anteil Professional rund 30 % je Monat (aus der Monatstabelle Minimal abgeleitet), auch für Neutral und Best Case; Nachkauf je zur Hälfte Personal und Marketing; Minimal 2028 7 Websites pro Monat; Zeitpunkte der weiteren Einstellungen.",
  "[A] 25 € laufende Kosten je Kunde und Monat (KI, Hosting, Betrieb); nicht im Modell: Freelancer-Spitzen, Büro ab der dritten Einstellung; Steuern als Rücklage (28,4 %), nicht als Zahlung. Abweichungen zum Liquiditätsmodell zeigt die Tabelle „Abgleich“.",
];
