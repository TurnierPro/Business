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
    case "finanzbericht": {
      const x = d.daten as { zeitraum: string; auswertung: Auswertung };
      return finanzbericht(zeitraum(x.zeitraum), x.auswertung);
    }
    default:
      throw new Error(`Unbekannte Dokumentart: ${d.art}`);
  }
}

const g = globalThis as unknown as { __stelaxBrowser?: Promise<Browser> };

function browser(): Promise<Browser> {
  g.__stelaxBrowser ??= chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ["--no-sandbox", "--font-render-hinting=none"],
  });
  return g.__stelaxBrowser;
}

export async function htmlZuPdf(html: string): Promise<Buffer> {
  const b = await browser();
  const seite = await b.newPage();
  try {
    await seite.setContent(html, { waitUntil: "load" });
    await seite.evaluate(() => document.fonts.ready);
    return Buffer.from(await seite.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true }));
  } finally {
    await seite.close();
  }
}

export async function dokumentPdf(d: Dok): Promise<Buffer> {
  return htmlZuPdf(dokumentHtml(d));
}
