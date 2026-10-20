import fs from "node:fs";
import path from "node:path";
import { chromium, Browser } from "playwright-core";
import * as v from "./vorlagen";
import { finanzbericht } from "./finanzbericht";
import { zeitraum, type Auswertung } from "../finanzen";

// Macht aus einem Dokument (Art + Daten) HTML und daraus ein PDF.

type Dok = { art: string; daten: unknown };

export function dokumentHtml(d: Dok): string {
  switch (d.art) {
    case "brief":
      return v.brief(d.daten as v.BriefDaten);
    case "angebot":
      return v.angebot(d.daten as v.AngebotDaten);
    case "check_report":
      return v.checkReport(d.daten as v.CheckDaten);
    case "leitfaden":
      return v.leitfaden(d.daten as v.LeitfadenDaten);
    case "protokoll":
      return v.protokoll(d.daten as v.ProtokollDaten);
    case "rechnung":
      return v.rechnung(d.daten as v.RechnungDaten);
    case "auftragsbestaetigung":
      return v.auftragsbestaetigung(d.daten as v.AuftragDaten);
    case "abnahmeprotokoll":
      return v.abnahmeprotokoll(d.daten as v.AbnahmeDaten);
    case "umzugsanleitung":
      return v.umzugsanleitung(d.daten as v.UmzugsanleitungDaten);
    case "monatsreport":
      return v.monatsreport(d.daten as v.MonatsreportDaten);
    case "finanzbericht": {
      const x = d.daten as { zeitraum: string; auswertung: Auswertung };
      return finanzbericht(zeitraum(x.zeitraum), x.auswertung);
    }
    default:
      throw new Error(`Unbekannte Dokumentart: ${d.art}`);
  }
}

const g = globalThis as unknown as { __nexovaBrowser?: Promise<Browser> };

function browser(): Promise<Browser> {
  g.__nexovaBrowser ??= chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ["--no-sandbox", "--font-render-hinting=none"],
  });
  return g.__nexovaBrowser;
}

let umbruchSkript: string | undefined;
const umbruch = () => (umbruchSkript ??= fs.readFileSync(path.join(process.cwd(), "public", "dokument-umbruch.js"), "utf8"));

/** HTML mit Seitenumbruch und Layout-Prüfung zu PDF. Ist das Layout nicht sauber, gibt es kein PDF (die Qualitätskontrolle blockiert dann). */
export async function htmlZuPdf(html: string): Promise<Buffer> {
  const b = await browser();
  // Zweite Schutzebene: Dokumente brauchen weder JavaScript noch Internet (Schriften und Bilder sind eingebettet)
  const seite = await b.newPage({ javaScriptEnabled: false });
  await seite.route("**/*", (r) => (r.request().url().startsWith("data:") ? r.continue() : r.abort()));
  try {
    await seite.setContent(html, { waitUntil: "load" });
    await seite.evaluate(() => document.fonts.ready);
    const probleme = (await seite.evaluate(`${umbruch()}; window.nexovaUmbruch ? window.nexovaUmbruch() : []`)) as string[];
    if (probleme.length) throw new Error(`PDF-Layout nicht sauber: ${probleme.join(" · ")}`);
    return Buffer.from(await seite.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true }));
  } finally {
    await seite.close();
  }
}

export async function dokumentPdf(d: Dok): Promise<Buffer> {
  return htmlZuPdf(dokumentHtml(d));
}
