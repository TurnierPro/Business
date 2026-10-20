import { PAKETE, PaketKey, type Paket } from "./pakete";

// Preiskatalog für das Angebot vor Ort: Pakete, KI-Module, Zusatzleistungen (Business Case, Stand 18.10.2026).
// Modul- und Zusatzpreise sind laut Business Case vorläufig. Keine Abhängigkeit von Server-Code: läuft auch im Browser.

export type Modul = {
  key: string;
  nr: number;
  name: string;
  text: string;
  einmalig: number | null; // null = Preis individuell
  monatlich: number;
  stufe: 1 | 2; // 2 = braucht einen Prozess-Check
  hinweis?: string;
  nurFuer?: string;
  // Kombi-Preis, wenn ein anderes Modul mitgebucht wird (z. B. Modul 2 mit Modul 1)
  kombi?: { mit: string; einmalig: number; monatlich: number };
  aktiv?: boolean;
};
export type Zusatz = { key: string; name: string; einmalig: number; monatlich: number; aktiv?: boolean };
export type Katalog = { pakete: Record<string, Paket>; module: Modul[]; zusaetze: Zusatz[] };

export const MODULE: Modul[] = [
  { key: "m1", nr: 1, name: "WhatsApp-Anfrage-Assistent", text: "Nimmt Anfragen per WhatsApp an, fragt fehlende Angaben und Fotos nach", einmalig: 99000, monatlich: 7900, stufe: 1, hinweis: "zzgl. WhatsApp-Gebühren" },
  { key: "m2", nr: 2, name: "Website-Anfrage-Assistent", text: "Gleiche Logik als Fenster auf der Homepage", einmalig: 79000, monatlich: 5900, stufe: 1, hinweis: "mit Modul 1: 490 € + 39 €", kombi: { mit: "m1", einmalig: 49000, monatlich: 3900 } },
  { key: "m3", nr: 3, name: "Verpasster Anruf → Rückmeldung", text: "Anrufer bekommt sofort SMS oder WhatsApp mit Link zum Anfrageformular", einmalig: 29000, monatlich: 2900, stufe: 1 },
  { key: "m4", nr: 4, name: "Erinnerung und Wiederkehr", text: "HU/AU, Inspektion, Wartung, Heizungs-Check (nur mit Einwilligung)", einmalig: 49000, monatlich: 3900, stufe: 1, nurFuer: "Kfz, SHK" },
  { key: "m5", nr: 5, name: "Postfach-Assistent", text: "Sortiert E-Mails, schreibt Antwortentwürfe, Mensch gibt frei", einmalig: 99000, monatlich: 7900, stufe: 2 },
  { key: "m6", nr: 6, name: "Werkstatt-Kommunikation", text: "Fahrzeugannahme, Freigabe Kostenvoranschlag, Status per WhatsApp", einmalig: 99000, monatlich: 7900, stufe: 2, nurFuer: "Kfz" },
  { key: "m7", nr: 7, name: "Beleg-Autopilot", text: "Rechnungen und Belege aus dem Postfach in die Buchhaltung", einmalig: 49000, monatlich: 2900, stufe: 2 },
  { key: "m8", nr: 8, name: "Angebotsentwurf (Pilot)", text: "Entwurf aus Sprachnotiz, Fotos und Aufmaß", einmalig: null, monatlich: 0, stufe: 2, hinweis: "Preis individuell", nurFuer: "ohne Handwerkersoftware" },
];

export const ZUSAETZE: Zusatz[] = [
  { key: "karriere", name: "Karriereseite einzeln", einmalig: 189000, monatlich: 4900 },
  { key: "seo", name: "Search Console und Local SEO (für Start)", einmalig: 39000, monatlich: 4900 },
  { key: "termine", name: "Online-Terminbuchung", einmalig: 49000, monatlich: 3900 },
  { key: "foto", name: "Foto-Shooting Halbtag (Partnerfotograf)", einmalig: 79000, monatlich: 0 },
  { key: "fotovideo", name: "Foto und Kurzvideo (Partnerfotograf)", einmalig: 149000, monatlich: 0 },
  { key: "social_start", name: "Social-Media-Start", einmalig: 39000, monatlich: 0 },
  { key: "social_begleitung", name: "Social-Media-Begleitung (4 Beiträge)", einmalig: 0, monatlich: 14900 },
  { key: "prozesscheck", name: "Prozess-Check vor Ort (halber Tag)", einmalig: 69000, monatlich: 0 },
];

export type Auswahl = { paket: PaketKey; module: string[]; zusaetze: string[]; preisModul8?: number; prozessCheckAnrechnen?: boolean };
export type Position = { text: string; einmalig: number; monatlich: number; hinweis?: string };

/** Der aktuelle Katalog (Werkseinstellung plus Stammdaten). Im Browser kommt er als Eigenschaft vom Server. */
export const aktuellerKatalog = (): Katalog => ({ pakete: PAKETE, module: MODULE, zusaetze: ZUSAETZE });

export function berechne(a: Auswahl, k: Katalog = aktuellerKatalog()): { positionen: Position[]; einmalig: number; monatlich: number; hinweise: string[] } {
  const p = k.pakete[a.paket];
  if (!p) throw new Error(`Unbekanntes Paket: ${a.paket}`);
  const positionen: Position[] = [{ text: `Paket ${p.name}`, einmalig: p.einmalig, monatlich: p.monatlich }];
  const hinweise: string[] = [];
  const inklusive = p.inklusiveModule ?? 0;
  const gewaehlt = k.module.filter((m) => a.module.includes(m.key));
  gewaehlt.forEach((m, i) => {
    let einmalig = m.einmalig ?? a.preisModul8 ?? 0;
    let monatlich = m.monatlich;
    if (m.kombi && a.module.includes(m.kombi.mit)) {
      einmalig = m.kombi.einmalig;
      monatlich = m.kombi.monatlich;
    }
    if (i < inklusive) {
      positionen.push({ text: `Modul ${m.nr}: ${m.name}`, einmalig: 0, monatlich: 0, hinweis: `im Paket ${p.name} enthalten` });
    } else {
      positionen.push({ text: `Modul ${m.nr}: ${m.name}`, einmalig, monatlich, hinweis: m.hinweis });
    }
    if (m.stufe === 2 && !inklusive && !a.zusaetze.includes("prozesscheck")) hinweise.push(`Modul ${m.nr} setzt einen Prozess-Check voraus.`);
    if (m.einmalig === null && !a.preisModul8) hinweise.push(`Modul ${m.nr} braucht einen individuellen Preis.`);
  });
  if (inklusive && gewaehlt.length < inklusive) hinweise.push(`Paket ${p.name} enthält ${inklusive} Module, gewählt sind ${gewaehlt.length}.`);
  const pc = k.zusaetze.find((x) => x.key === "prozesscheck");
  for (const z of k.zusaetze.filter((x) => a.zusaetze.includes(x.key))) {
    if (z.key === "prozesscheck" && inklusive) continue;
    positionen.push({ text: z.name, einmalig: z.einmalig, monatlich: z.monatlich });
  }
  if (a.prozessCheckAnrechnen && pc) positionen.push({ text: "Anrechnung Prozess-Check (Auftrag innerhalb von 60 Tagen)", einmalig: -pc.einmalig, monatlich: 0 });
  const einmalig = positionen.reduce((s, x) => s + x.einmalig, 0);
  const monatlich = positionen.reduce((s, x) => s + x.monatlich, 0);
  return { positionen, einmalig, monatlich, hinweise };
}
