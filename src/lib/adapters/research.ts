import fs from "node:fs";
import path from "node:path";
import { schreibe, jsonAus } from "./ki";

export type GefundenerBetrieb = {
  name: string;
  gewerk: string;
  inhaber?: string;
  anrede?: string;
  strasse?: string;
  plz?: string;
  ort?: string;
  telefon?: string;
  website?: string;
  mitarbeiter?: number;
  score: number;
  scoreGrund: string;
};

// Erfundene Testbetriebe für den Simulator. Keine echten Firmen, keine echten Personen.
const TESTBETRIEBE: GefundenerBetrieb[] = [
  { name: "Sanitär Muster GmbH", gewerk: "SHK", anrede: "Herr", inhaber: "Thomas Muster", strasse: "Musterweg 12", plz: "76185", ort: "Karlsruhe", telefon: "0721 1111111", website: "", mitarbeiter: 14, score: 86, scoreGrund: "Keine Website gefunden, 2 offene Stellen bei der Arbeitsagentur." },
  { name: "Elektro Beispiel KG", gewerk: "Elektro", anrede: "Frau", inhaber: "Sabine Beispiel", strasse: "Probestraße 3", plz: "76137", ort: "Karlsruhe", telefon: "0721 2222222", website: "example.com", mitarbeiter: 22, score: 74, scoreGrund: "Website ohne Karriereseite und ohne Anfrageformular." },
  { name: "Schreinerei Test & Sohn", gewerk: "Schreiner", anrede: "Herr", inhaber: "Jonas Test", strasse: "Holzgasse 7", plz: "76227", ort: "Karlsruhe", telefon: "0721 3333333", website: "", mitarbeiter: 8, score: 68, scoreGrund: "Gute Bewertungen, aber kaum sichtbar bei Google." },
  { name: "Malerbetrieb Probe GmbH", gewerk: "Maler", anrede: "Herr", inhaber: "Erik Probe", strasse: "Farbweg 21", plz: "70173", ort: "Stuttgart", telefon: "0711 4444444", website: "example.org", mitarbeiter: 31, score: 79, scoreGrund: "Sucht Azubis, Website nicht fürs Handy eingerichtet." },
  { name: "Kfz-Werkstatt Demo", gewerk: "Kfz", anrede: "Herr", inhaber: "Murat Demo", strasse: "Motorstraße 2", plz: "70469", ort: "Stuttgart", telefon: "0711 5555555", website: "", mitarbeiter: 6, score: 71, scoreGrund: "Terminvergabe nur per Telefon, keine Website." },
  { name: "Heizung Musterle GmbH", gewerk: "SHK", anrede: "Frau", inhaber: "Petra Musterle", strasse: "Kesselweg 9", plz: "76131", ort: "Karlsruhe", telefon: "0721 6666666", website: "example.net", mitarbeiter: 18, score: 64, scoreGrund: "Website veraltet, kein Klick zum Anruf." },
];

export async function sucheBetriebe(anzahl = 20): Promise<{ betriebe: GefundenerBetrieb[]; simuliert: boolean }> {
  if (!process.env.ANTHROPIC_API_KEY) {
    const woche = Math.floor(Date.now() / (7 * 24 * 3600 * 1000));
    const versatz = woche % TESTBETRIEBE.length;
    const liste = [...TESTBETRIEBE.slice(versatz), ...TESTBETRIEBE.slice(0, versatz)];
    return { betriebe: liste.slice(0, Math.min(anzahl, liste.length)), simuliert: true };
  }
  const auftrag = fs.readFileSync(path.join(process.cwd(), "brand", "research-prompt.md"), "utf8");
  const { text } = await schreibe({
    zweck: "research",
    modell: "text",
    websuche: true,
    aufgabe: `${auftrag}\n\nFinde bis zu ${anzahl} Betriebe. Antworte nur mit einem JSON-Array. Felder je Betrieb: name, gewerk, anrede, inhaber, strasse, plz, ort, telefon, website, mitarbeiter (Zahl oder null), score (0-100), scoreGrund (ein Satz).`,
    ersatz: "[]",
  });
  return { betriebe: jsonAus<GefundenerBetrieb[]>(text, []), simuliert: false };
}
