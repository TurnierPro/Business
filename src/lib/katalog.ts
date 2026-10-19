import { PAKETE, PaketKey } from "./pakete";

// Preiskatalog für das Angebot vor Ort: Pakete, KI-Module, Zusatzleistungen (Business Case, Stand 18.10.2026).
// Modul- und Zusatzpreise sind laut Business Case vorläufig. Keine Abhängigkeit von Server-Code: läuft auch im Browser.

export type Modul = { key: string; nr: number; name: string; text: string; einmalig: number | null; monatlich: number; stufe: 1 | 2; hinweis?: string; nurFuer?: string };
export type Zusatz = { key: string; name: string; einmalig: number; monatlich: number };

export const MODULE: Modul[] = [
  { key: "m1", nr: 1, name: "WhatsApp-Anfrage-Assistent", text: "Nimmt Anfragen per WhatsApp an, fragt fehlende Angaben und Fotos nach", einmalig: 99000, monatlich: 7900, stufe: 1, hinweis: "zzgl. WhatsApp-Gebühren" },
  { key: "m2", nr: 2, name: "Website-Anfrage-Assistent", text: "Gleiche Logik als Fenster auf der Homepage", einmalig: 79000, monatlich: 5900, stufe: 1, hinweis: "mit Modul 1: 490 € + 39 €" },
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

export function berechne(a: Auswahl): { positionen: Position[]; einmalig: number; monatlich: number; hinweise: string[] } {
  const p = PAKETE[a.paket];
  const positionen: Position[] = [{ text: `Paket ${p.name}`, einmalig: p.einmalig, monatlich: p.monatlich }];
  const hinweise: string[] = [];
  const inklusive = a.paket === "L" ? 3 : 0;
  const gewaehlt = MODULE.filter((m) => a.module.includes(m.key));
  gewaehlt.forEach((m, i) => {
    let einmalig = m.einmalig ?? a.preisModul8 ?? 0;
    let monatlich = m.monatlich;
    if (m.key === "m2" && a.module.includes("m1")) {
      einmalig = 49000;
      monatlich = 3900;
    }
    if (i < inklusive) {
      positionen.push({ text: `Modul ${m.nr}: ${m.name}`, einmalig: 0, monatlich: 0, hinweis: "im Paket L enthalten" });
    } else {
      positionen.push({ text: `Modul ${m.nr}: ${m.name}`, einmalig, monatlich, hinweis: m.hinweis });
    }
    if (m.stufe === 2 && a.paket !== "L" && !a.zusaetze.includes("prozesscheck")) hinweise.push(`Modul ${m.nr} setzt einen Prozess-Check voraus (in L enthalten).`);
    if (m.key === "m8" && !a.preisModul8) hinweise.push("Modul 8 braucht einen individuellen Preis.");
  });
  if (a.paket === "L" && gewaehlt.length < 3) hinweise.push(`Paket L enthält 3 Module, gewählt sind ${gewaehlt.length}.`);
  for (const z of ZUSAETZE.filter((x) => a.zusaetze.includes(x.key))) {
    if (z.key === "prozesscheck" && a.paket === "L") continue;
    positionen.push({ text: z.name, einmalig: z.einmalig, monatlich: z.monatlich });
  }
  if (a.prozessCheckAnrechnen) positionen.push({ text: "Anrechnung Prozess-Check (Auftrag innerhalb von 60 Tagen)", einmalig: -69000, monatlich: 0 });
  const einmalig = positionen.reduce((s, x) => s + x.einmalig, 0);
  const monatlich = positionen.reduce((s, x) => s + x.monatlich, 0);
  return { positionen, einmalig, monatlich, hinweise };
}
