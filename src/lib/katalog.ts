import { PAKETE, PaketKey, type Paket } from "./pakete";
import { LAUFZEIT_MONATE } from "./recht";

// Baukasten für das Angebot vor Ort (Skill levarex-baukasten, Stand 31.10.2026):
// 1 Webauftritt (Basis) + Module + Zusatzmodule. Keine Rabatte, Ausnahme Pilotpreis Kundenmanagement.
// Keine Abhängigkeit von Server-Code: läuft auch im Browser.

export type Modul = {
  key: string;
  nr: number;
  name: string;
  text: string; // Kurzbeschreibung für den Konfigurator
  problem?: string;
  punkte?: string[]; // genau fünf Punkte für die Leistungsbeschreibung
  einmalig: number | null; // null = Preis individuell
  monatlich: number;
  stufe: 1 | 2; // 2 = Prozess-Check ist Pflicht
  hinweis?: string;
  nurFuer?: string;
  // Pilotpreis (nur Kundenmanagement, nur die ersten zwei Betriebe)
  pilot?: { einmalig: number; hinweis: string };
  aktiv?: boolean;
};
export type Zusatz = { key: string; name: string; text?: string; einmalig: number; monatlich: number; individuell?: boolean; aktiv?: boolean };
export type Katalog = { pakete: Record<string, Paket>; module: Modul[]; zusaetze: Zusatz[] };

export const MODULE: Modul[] = [
  {
    key: "personal",
    nr: 2,
    name: "Personal & Bewerbung",
    text: "Karriereseite, Bewerben per Handy oder WhatsApp in einer Minute, Stellenpflege",
    problem: "Offene Stellen bleiben monatelang leer, weil Bewerben bei Ihnen zu umständlich ist und keiner sieht, was Sie als Arbeitgeber bieten.",
    punkte: [
      "Karriereseite mit bis zu 5 Stellen, Azubi- und Praktikumsseite",
      "Ihre Mitarbeiter-Benefits auf einen Blick, mit Vorschlägen für Extras",
      "Bewerben per Handy oder WhatsApp in einer Minute, ohne Lebenslauf",
      "wir pflegen Ihre Stellen, neue Stellen binnen 3 Werktagen online",
      "Monatsbericht: Aufrufe und Klicks auf „Bewerben“",
    ],
    einmalig: 149000,
    monatlich: 8000,
    stufe: 1,
    hinweis: "setzt unseren Webauftritt voraus; Jobbörsen nicht enthalten",
  },
  {
    key: "marketing",
    nr: 3,
    name: "Marketing & Sichtbarkeit",
    text: "8 Beiträge im Monat, Antwortentwürfe auf Bewertungen, SEO und GEO, Monatsbericht",
    problem: "Sie machen gute Arbeit, aber kaum jemand sieht sie, weder bei Google noch auf Instagram, und für Marketing bleibt keine Zeit.",
    punkte: [
      "8 Beiträge im Monat auf Instagram und Facebook aus Fotos, die Sie uns schicken; Sie geben jeden Beitrag frei",
      "Antwortentwürfe auf Ihre Google-Bewertungen zur Freigabe",
      "SEO: Website und Google-Profil laufend gepflegt",
      "GEO: Ihr Betrieb so beschrieben, dass KI-Suchen ihn finden können; monatlicher Test",
      "Monatsbericht: Reichweite, Bewertungen, Platzierung bei Google und in der KI-Suche",
    ],
    einmalig: 249000,
    monatlich: 30000,
    stufe: 1,
    hinweis: "keine Platzierungsgarantie; Werbebudget zahlt der Betrieb direkt",
  },
  {
    key: "kundenmanagement",
    nr: 4,
    name: "Kundenmanagement",
    text: "Kunden und Fälligkeiten an einem Ort, Terminbuchung, Erinnerungen, Nachfassen, Bewertungsbitte",
    problem: "Anrufe gehen verloren, Angebote bleiben liegen, und Stammkunden vergessen ihren nächsten Termin.",
    punkte: [
      "Ihre Kunden mit Fahrzeugen oder Anlagen und Fälligkeiten an einem Ort",
      "Online-Terminbuchung und automatische Erinnerung an HU, Wartung und Inspektion",
      "offene Angebote nach 7 und 14 Tagen nachgefasst",
      "nach jedem Auftrag die Bitte um eine Bewertung",
      "Anfrage- und KI-Telefonassistent sammeln Telefon, WhatsApp und Website an einem Ort",
    ],
    einmalig: 399000,
    monatlich: 25000,
    stufe: 2,
    hinweis: "bis 100 SMS im Monat, darüber 0,10 € je SMS; Gebühren Dritter zum Selbstkostenpreis; AV-Vertrag Pflicht",
    pilot: { einmalig: 199000, hinweis: "Pilotpreis nur für die ersten zwei Betriebe (Start Mai 2027), gegen Referenz und Messung; bei Kündigung in den ersten 6 Monaten ohne wichtigen Grund wird die Differenz anteilig nachgezahlt" },
  },
];

export const ZUSAETZE: Zusatz[] = [
  { key: "prozesscheck", name: "Prozess-Check vor Ort", text: "halber Tag im Betrieb; Pflicht vor Kundenmanagement und Individuellen Modulen", einmalig: 69000, monatlich: 0 },
  { key: "foto", name: "Fotoshooting", text: "Halbtag mit Fotograf in Ihrem Betrieb, mindestens 40 bearbeitete Fotos", einmalig: 129000, monatlich: 0 },
  { key: "fotovideo", name: "Fotoshooting mit Kurzvideo", text: "Halbtag mit Fotograf, Clip 30–60 Sekunden und zwei Hochformat-Schnitte", einmalig: 199000, monatlich: 0 },
  { key: "individuell", name: "Individuelle Module", text: "Sonderabläufe, Anbindungen, eigene Werkzeuge; Festpreis nach Prozess-Check", einmalig: 0, monatlich: 0, individuell: true },
];

export type Auswahl = {
  paket: PaketKey;
  module: string[];
  zusaetze: string[];
  pilot?: boolean; // Pilotpreis für Kundenmanagement
  individuell?: { einmalig: number; monatlich: number; text?: string };
  prozessCheckAnrechnen?: boolean;
};
export type Position = { text: string; einmalig: number; monatlich: number; hinweis?: string };

/** Der aktuelle Katalog (Werkseinstellung plus Stammdaten). Im Browser kommt er als Eigenschaft vom Server. */
export const aktuellerKatalog = (): Katalog => ({ pakete: PAKETE, module: MODULE, zusaetze: ZUSAETZE });

/** Gesamt über die Laufzeit (24 Monate) und Durchschnitt pro Monat, wie auf dem Baukasten-Blatt. */
export function laufzeitSumme(einmalig: number, monatlich: number): { gesamt: number; schnitt: number; monate: number } {
  const gesamt = einmalig + LAUFZEIT_MONATE * monatlich;
  return { gesamt, schnitt: Math.round(gesamt / LAUFZEIT_MONATE), monate: LAUFZEIT_MONATE };
}

export function berechne(a: Auswahl, k: Katalog = aktuellerKatalog()): { positionen: Position[]; einmalig: number; monatlich: number; hinweise: string[] } {
  const p = k.pakete[a.paket];
  if (!p) throw new Error(`Unbekannter Webauftritt: ${a.paket}`);
  const positionen: Position[] = [{ text: p.name, einmalig: p.einmalig, monatlich: p.monatlich }];
  const hinweise: string[] = [];
  const prozessCheck = a.zusaetze.includes("prozesscheck") || !!a.prozessCheckAnrechnen;
  for (const m of k.module.filter((x) => a.module.includes(x.key))) {
    const pilot = !!(a.pilot && m.pilot);
    const einmalig = pilot ? m.pilot!.einmalig : (m.einmalig ?? 0);
    positionen.push({ text: m.name + (pilot ? " (Pilotpreis)" : ""), einmalig, monatlich: m.monatlich, hinweis: pilot ? m.pilot!.hinweis : m.hinweis });
    if (m.stufe === 2 && !prozessCheck) hinweise.push(`${m.name} setzt einen Prozess-Check voraus.`);
    if (m.einmalig === null) hinweise.push(`${m.name} braucht einen individuellen Preis.`);
  }
  for (const z of k.zusaetze.filter((x) => a.zusaetze.includes(x.key))) {
    if (z.individuell) {
      const i = a.individuell;
      if (!i || (!i.einmalig && !i.monatlich)) hinweise.push(`${z.name}: Festpreis eintragen (nach Prozess-Check).`);
      if (!prozessCheck) hinweise.push(`${z.name} setzen einen Prozess-Check voraus.`);
      positionen.push({ text: i?.text?.trim() ? `${z.name}: ${i.text.trim()}` : z.name, einmalig: i?.einmalig ?? 0, monatlich: i?.monatlich ?? 0, hinweis: "Festpreis nach Prozess-Check" });
      continue;
    }
    positionen.push({ text: z.name, einmalig: z.einmalig, monatlich: z.monatlich });
  }
  const pc = k.zusaetze.find((x) => x.key === "prozesscheck");
  if (a.prozessCheckAnrechnen && pc) positionen.push({ text: "Anrechnung Prozess-Check (Auftrag innerhalb von 60 Tagen)", einmalig: -pc.einmalig, monatlich: 0 });
  const einmalig = positionen.reduce((s, x) => s + x.einmalig, 0);
  const monatlich = positionen.reduce((s, x) => s + x.monatlich, 0);
  return { positionen, einmalig, monatlich, hinweise };
}

/** Die sechs Ausbaustufen des Baukastens als Vorlagen für den Konfigurator. */
export const AUSBAUSTUFEN: { nr: number; name: string; auswahl: Pick<Auswahl, "paket" | "module" | "zusaetze"> }[] = [
  { nr: 1, name: "Gering · Einstieg", auswahl: { paket: "KOMPAKT", module: [], zusaetze: [] } },
  { nr: 2, name: "Gering · Einstieg + Kunden", auswahl: { paket: "KOMPAKT", module: ["marketing"], zusaetze: [] } },
  { nr: 3, name: "Mittel · Personal", auswahl: { paket: "PROFESSIONAL", module: ["personal"], zusaetze: [] } },
  { nr: 4, name: "Mittel · Büro", auswahl: { paket: "PROFESSIONAL", module: ["kundenmanagement"], zusaetze: [] } },
  { nr: 5, name: "Voll · alle Module", auswahl: { paket: "PROFESSIONAL", module: ["personal", "marketing", "kundenmanagement"], zusaetze: [] } },
  { nr: 6, name: "Voll · mit Zusatzmodul", auswahl: { paket: "PROFESSIONAL", module: ["personal", "marketing", "kundenmanagement"], zusaetze: ["fotovideo"] } },
];
