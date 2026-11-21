// Webauftritt (Basis des Baukastens) laut Skill levarex-baukasten (Stand 31.10.2026). Beträge in Cent, netto.
// Module und Zusatzmodule stehen in katalog.ts. Änderungen aus den Stammdaten legt katalog-db.ts darüber.

export type PaketKey = "KOMPAKT" | "PROFESSIONAL";

export type Paket = {
  name: string;
  einmalig: number;
  monatlich: number;
  wochen: number; // Lieferfrist nach Erhalt der vollständigen Inhalte
  problem: string; // ein Satz aus Sicht des Betriebs
  inhalt: string[]; // genau fünf Punkte
  aktiv?: boolean;
};

export const PAKETE: Record<PaketKey, Paket> = {
  KOMPAKT: {
    name: "Webauftritt Kompakt",
    einmalig: 149000,
    monatlich: 6000,
    wochen: 3,
    problem: "Wer Ihren Betrieb im Netz sucht, findet nichts Brauchbares, und der Auftrag geht an den Nächsten.",
    inhalt: [
      "eine Seite mit Leistungen, Einzugsgebiet und Kontakt, die Texte schreiben wir",
      "Design in Ihren Farben, mit Ihrem Logo und echten Fotos aus dem Betrieb",
      "Anfrageformular mit Fotos und Telefonnummer zum Antippen",
      "Google-Unternehmensprofil eingerichtet, Anfragen und Anrufe werden gezählt",
      "Hosting, Wartung, Rechtstexte und 15 Minuten Änderungen im Monat",
    ],
  },
  PROFESSIONAL: {
    name: "Webauftritt Professional",
    einmalig: 299000,
    monatlich: 15000,
    wochen: 6,
    problem: "Kunden suchen bei Google nach Ihrer Leistung in Ihrem Ort und landen bei der Konkurrenz.",
    inhalt: [
      "bis 8 Seiten, mit einer eigenen Seite für jede Leistung",
      "eigene Seiten für Ihre Orte, damit Sie bei Google im Ort gefunden werden",
      "Design in Ihren Farben, echte Fotos, Anfrageformular mit Fotos",
      "Monatsbericht über Anfragen, Anrufe und Google",
      "Hosting, Wartung, Rechtstexte und 60 Minuten Änderungen im Monat",
    ],
  },
};

// Änderungen im Monat, die im Monatsbeitrag enthalten sind (Minuten)
export const AENDERUNGS_MINUTEN: Record<PaketKey, number> = { KOMPAKT: 15, PROFESSIONAL: 60 };

// Ausdrücklich nicht enthalten. Steht in der Leistungsbeschreibung jedes Angebots.
const NICHT_WEB = ["Logo-Entwicklung", "Shop", "Blog", "Mehrsprachigkeit", "laufende SEO- und GEO-Pflege (Modul Marketing & Sichtbarkeit)"];
export const NICHT_ENTHALTEN: Record<PaketKey, string[]> = { KOMPAKT: NICHT_WEB, PROFESSIONAL: NICHT_WEB };

/** Empfehlung ohne Gespräch: ab 10 Mitarbeitenden Professional, sonst Kompakt. */
export const paketVorschlag = (mitarbeiter: number | null | undefined): PaketKey => ((mitarbeiter ?? 10) >= 10 ? "PROFESSIONAL" : "KOMPAKT");

export const UST = 0.19;

export function euro(cent: number): string {
  return (cent / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}
