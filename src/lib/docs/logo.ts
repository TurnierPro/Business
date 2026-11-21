import fs from "node:fs";
import path from "node:path";

// Levarex-Logo aus den Originaldateien (brand/logos, Kopie aus Levarex_Logos.zip). Nie nachzeichnen.
// hell = Papier (Druck, PDF, Mail), dunkel = Basalt (Oberfläche). Mit CONSULTING für Kopf von Dokumenten,
// ohne CONSULTING für kleine Breiten (Seitenleiste, Kopfzeilen).

const ORDNER = path.join(process.cwd(), "brand", "logos");
const cache = new Map<string, string>();

export type LogoArt = "lockup" | "ohne-consulting" | "bildmarke";

function datei(art: LogoArt, thema: "hell" | "dunkel"): string {
  const name = art === "lockup" ? "levarex-lockup-quadrat" : art === "ohne-consulting" ? "levarex-lockup-quadrat-ohne-consulting" : "levarex-bildmarke";
  // Die Bildmarke gibt es nur hell (eigene Fläche in Papier)
  return `${name}-${art === "bildmarke" ? "hell" : thema}.svg`;
}

/** SVG-Text des Original-Logos, mit Höhe in Pixeln (Breite ergibt sich aus der viewBox). */
export function logo(o: { art?: LogoArt; thema: "hell" | "dunkel"; hoehe?: number }): string {
  const name = datei(o.art ?? "lockup", o.thema);
  let svg = cache.get(name);
  if (!svg) {
    svg = fs.readFileSync(path.join(ORDNER, name), "utf8").trim();
    cache.set(name, svg);
  }
  return svg.replace("<svg ", `<svg height="${o.hoehe ?? 28}" `);
}
