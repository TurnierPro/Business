// Pakete laut Business Case (Stand 18.10.2026). Beträge in Cent, netto.

export type PaketKey = "START" | "S" | "S_WERKSTATT" | "M" | "L";

export const PAKETE: Record<PaketKey, { name: string; einmalig: number; monatlich: number; inhalt: string[]; wochen: number }> = {
  START: {
    name: "Start",
    einmalig: 149000,
    monatlich: 5900,
    wochen: 3,
    inhalt: ["1 Seite mit Abschnitten", "Google-Unternehmensprofil", "Anfrageformular", "Klick zum Anruf", "Rechtstexte, Hosting, Wartung", "15 Minuten Änderungen im Monat"],
  },
  S: {
    name: "S – Anfragen",
    einmalig: 349000,
    monatlich: 14900,
    wochen: 4,
    inhalt: [
      "Website bis 8 Seiten (Lighthouse ≥ 95, WCAG 2.2 AA)",
      "Google-Unternehmensprofil, Local SEO, Search Console",
      "Anfrageformular mit Foto-Upload",
      "Klick zum Anruf mit Messung",
      "Bewertungs-QR-Karte, Foto-Anleitung und Handyfotos beim Termin",
      "Betreuung: Hosting, Wartung, Sicherheit, Rechtstexte, 30 Minuten Änderungen, Monatsreport",
      "Erste 3 Monate Betreuung inklusive",
    ],
  },
  S_WERKSTATT: {
    name: "S-Werkstatt",
    einmalig: 399000,
    monatlich: 17900,
    wochen: 4,
    inhalt: ["Alles aus S", "Online-Terminbuchung", "Erinnerung HU/AU"],
  },
  M: {
    name: "M – Anfragen + Bewerbungen",
    einmalig: 490000,
    monatlich: 19900,
    wochen: 5,
    inhalt: [
      "Alles aus S",
      "Karriereseite bis 5 Stellen, Azubi- und Praktikumsseite",
      "Kurzbewerbung per Handy ohne Lebenslauf, „Bewerben per WhatsApp“-Link",
      "Google for Jobs, Jobbörse der Arbeitsagentur, kostenlose Indeed-Anzeigen",
      "Betreuung: Stellen pflegen, Bewerbungsreport",
    ],
  },
  L: {
    name: "L – Entlastet",
    einmalig: 890000,
    monatlich: 59000,
    wochen: 9,
    inhalt: [
      "Alles aus M",
      "Prozess-Check vor Ort",
      "Online-Terminbuchung",
      "3 Entlastungs-Bausteine nach Wahl",
      "Quartals-Review vor Ort, Monatsreport gesparte Zeit",
      "Lizenzen und Nutzungsgebühren Dritter zzgl.",
    ],
  },
};

// Ausdrücklich nicht enthalten (Business Case). Steht in der Leistungsbeschreibung jedes Angebots.
const NICHT_S = ["Bewertungsmanagement", "Werbeanzeigen", "Social Media", "Blog", "Logo", "Shop", "Mehrsprachigkeit", "Karriereseite", "Terminbuchung", "Chatbot"];
export const NICHT_ENTHALTEN: Record<PaketKey, string[]> = {
  START: NICHT_S,
  S: NICHT_S,
  S_WERKSTATT: NICHT_S.filter((x) => x !== "Terminbuchung"),
  M: ["Recruiting-Kampagnen", "Mediabudget und bezahlte Anzeigen", "Vorauswahl von Bewerbern", "Personalvermittlung", "Bewertungsmanagement", "Social Media", "Shop", "Chatbot"],
  L: ["KI-Telefonassistent", "Buchhaltung und Steuerberatung", "Individualsoftware", "mehr als 3 Entlastungs-Bausteine", "Schulung über 2 Stunden"],
};

export const UST = 0.19;

export function euro(cent: number): string {
  return (cent / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}
