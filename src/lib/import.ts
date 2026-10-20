import { legeBetriebAn } from "./ablauf/akquise";

// CSV-Import für Leads (z. B. Export aus Excel, einem alten CRM oder einer Messe-Liste).
// Erkannte Spalten: Name/Firma, Gewerk, Anrede, Inhaber/Ansprechpartner, Straße, PLZ, Ort, Telefon, E-Mail, Website, Mitarbeiter, Quelle.
// Sperrliste und Doppelte prüft legeBetriebAn wie beim Wochenlauf.

const SPALTEN: Record<string, string[]> = {
  name: ["name", "firma", "betrieb", "unternehmen", "company"],
  gewerk: ["gewerk", "branche"],
  anrede: ["anrede"],
  inhaber: ["inhaber", "ansprechpartner", "kontakt", "geschäftsführer", "geschaeftsfuehrer"],
  strasse: ["straße", "strasse", "adresse", "street"],
  plz: ["plz", "postleitzahl", "zip"],
  ort: ["ort", "stadt", "city"],
  telefon: ["telefon", "tel", "phone"],
  email: ["e-mail", "email", "mail"],
  website: ["website", "webseite", "homepage", "url", "web"],
  mitarbeiter: ["mitarbeiter", "ma", "mitarbeitende"],
  datenquelle: ["quelle", "datenquelle", "source"],
};

export function csvZeilen(text: string): string[][] {
  const trenner = (text.split("\n")[0].match(/;/g)?.length ?? 0) >= (text.split("\n")[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const zeilen: string[][] = [];
  let feld = "", zeile: string[] = [], inAnf = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inAnf) {
      if (c === '"' && text[i + 1] === '"') { feld += '"'; i++; }
      else if (c === '"') inAnf = false;
      else feld += c;
    } else if (c === '"') inAnf = true;
    else if (c === trenner) { zeile.push(feld); feld = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      zeile.push(feld); feld = "";
      if (zeile.some((x) => x.trim())) zeilen.push(zeile);
      zeile = [];
    } else feld += c;
  }
  zeile.push(feld);
  if (zeile.some((x) => x.trim())) zeilen.push(zeile);
  return zeilen;
}

export async function leadsImportieren(text: string, wer: string): Promise<{ neu: number; uebersprungen: { zeile: number; grund: string }[] }> {
  const zeilen = csvZeilen(text.replace(/^\uFEFF/, ""));
  if (zeilen.length < 2) throw new Error("Die Datei braucht eine Kopfzeile und mindestens eine Zeile mit Daten.");
  const kopf = zeilen[0].map((k) => k.trim().toLowerCase());
  const index = Object.fromEntries(Object.entries(SPALTEN).map(([feld, namen]) => [feld, kopf.findIndex((k) => namen.includes(k))]));
  if (index.name < 0) throw new Error("Spalte „Name“ oder „Firma“ fehlt.");
  if (zeilen.length > 2001) throw new Error("Höchstens 2.000 Zeilen auf einmal.");
  let neu = 0;
  const uebersprungen: { zeile: number; grund: string }[] = [];
  for (const [i, z] of zeilen.slice(1).entries()) {
    const wert = (f: string) => (index[f] >= 0 ? (z[index[f]] ?? "").trim() : "");
    if (!wert("name")) { uebersprungen.push({ zeile: i + 2, grund: "Name fehlt" }); continue; }
    const r = await legeBetriebAn(
      {
        name: wert("name"),
        gewerk: wert("gewerk") || "SHK",
        anrede: wert("anrede") || undefined,
        inhaber: wert("inhaber") || undefined,
        strasse: wert("strasse") || undefined,
        plz: wert("plz") || undefined,
        ort: wert("ort") || undefined,
        telefon: wert("telefon") || undefined,
        email: wert("email") || undefined,
        website: wert("website") || undefined,
        mitarbeiter: Number(wert("mitarbeiter")) || undefined,
        datenquelle: wert("datenquelle") || `CSV-Import, ${new Date().toLocaleDateString("de-DE")}`,
        score: 50,
        scoreGrund: "Import",
      },
      "Import",
      wer,
    );
    if (r.id) neu++;
    else uebersprungen.push({ zeile: i + 2, grund: r.grund ?? "nicht angelegt" });
  }
  return { neu, uebersprungen };
}
