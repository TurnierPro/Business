import { euro } from "./pakete";

// Säulendiagramm Umsatz und Ausgaben je Monat. Eine Achse, dünne Säulen, Legende, Werte als Tooltip.
// Wird in der App (dunkel) und im Quartalsbericht (hell) verwendet.

export type DiagrammFarben = { umsatz: string; ausgaben: string; text: string; leise: string; linie: string; grund: string };

export const FARBEN_DUNKEL: DiagrammFarben = { umsatz: "#C9A35C", ausgaben: "#5E9FC0", text: "#ECE8E0", leise: "#A29D93", linie: "#2C3230", grund: "#1A1E1D" };
export const FARBEN_HELL: DiagrammFarben = { umsatz: "#806026", ausgaben: "#3F7FA0", text: "#151816", leise: "#5B574F", linie: "#D6D2C8", grund: "#F5F3EE" };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

function schritt(max: number): number {
  const roh = max / 4;
  const p = 10 ** Math.floor(Math.log10(Math.max(roh, 1)));
  return ([1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= roh) ?? 10 * p);
}

export function umsatzDiagramm(daten: { name: string; umsatz: number; ausgaben: number }[], f: DiagrammFarben, breite = 720): string {
  const hoehe = 260, links = 64, rechts = 16, oben = 40, unten = 32;
  const maxWert = Math.max(1, ...daten.flatMap((d) => [d.umsatz, d.ausgaben])) / 100;
  const s = schritt(maxWert);
  const top = Math.ceil(maxWert / s) * s;
  const innenB = breite - links - rechts, innenH = hoehe - oben - unten;
  const y = (cent: number) => oben + innenH - (cent / 100 / top) * innenH;
  const gruppe = innenB / daten.length;
  const balken = Math.min(28, (gruppe - 16) / 2);
  const ticks = Array.from({ length: Math.round(top / s) + 1 }, (_, i) => i * s);
  const fmt = (v: number) => (v >= 1000 ? `${(v / 1000).toLocaleString("de-DE")} T€` : `${v.toLocaleString("de-DE")} €`);
  const saeule = (x: number, cent: number, farbe: string, titel: string) => {
    const h = oben + innenH - y(cent);
    if (h <= 0) return "";
    const r = Math.min(4, h);
    const yy = y(cent);
    return `<path d="M${x} ${oben + innenH}V${yy + r}Q${x} ${yy} ${x + r} ${yy}H${x + balken - r}Q${x + balken} ${yy} ${x + balken} ${yy + r}V${oben + innenH}Z" fill="${farbe}"><title>${esc(titel)}</title></path>`;
  };
  return `<svg viewBox="0 0 ${breite} ${hoehe}" width="100%" role="img" aria-label="Umsatz und Ausgaben je Monat" style="font-family:'IBM Plex Mono',monospace;font-size:11px">
<g>${ticks.map((t) => `<line x1="${links}" x2="${breite - rechts}" y1="${y(t * 100)}" y2="${y(t * 100)}" stroke="${f.linie}" stroke-width="1"/><text x="${links - 8}" y="${y(t * 100) + 4}" text-anchor="end" fill="${f.leise}">${fmt(t)}</text>`).join("")}</g>
<g font-family="Archivo, sans-serif" font-size="12"><rect x="${links}" y="8" width="10" height="10" rx="2" fill="${f.umsatz}"/><text x="${links + 16}" y="17" fill="${f.text}">Umsatz netto</text><rect x="${links + 120}" y="8" width="10" height="10" rx="2" fill="${f.ausgaben}"/><text x="${links + 136}" y="17" fill="${f.text}">Ausgaben netto</text></g>
${daten
  .map((d, i) => {
    const mitte = links + gruppe * i + gruppe / 2;
    return `${saeule(mitte - balken - 1, d.umsatz, f.umsatz, `${d.name}: Umsatz ${euro(d.umsatz)}`)}${saeule(mitte + 1, d.ausgaben, f.ausgaben, `${d.name}: Ausgaben ${euro(d.ausgaben)}`)}<text x="${mitte}" y="${hoehe - 10}" text-anchor="middle" fill="${f.leise}">${esc(d.name)}</text>`;
  })
  .join("")}
<line x1="${links}" x2="${breite - rechts}" y1="${oben + innenH}" y2="${oben + innenH}" stroke="${f.leise}" stroke-width="1"/>
</svg>`;
}

/** Kumulierter Umsatz: Plan (gestrichelt) gegen Ist (durchgezogen) über den Planzeitraum, Markierung „heute“. */
export function planIstDiagramm(punkte: { name: string; plan: number; ist: number | null }[], f: DiagrammFarben, breite = 720): string {
  const hoehe = 280, links = 70, rechts = 20, oben = 40, unten = 32;
  let p = 0, i = 0;
  const kum = punkte.map((x) => ({ name: x.name, plan: (p += x.plan), ist: x.ist === null ? null : (i += x.ist) }));
  const max = Math.max(1, ...kum.map((k) => Math.max(k.plan, k.ist ?? 0))) / 100;
  const s = schritt(max);
  const top = Math.ceil(max / s) * s;
  const innenB = breite - links - rechts, innenH = hoehe - oben - unten;
  const x = (j: number) => links + (innenB * j) / Math.max(1, kum.length - 1);
  const y = (cent: number) => oben + innenH - (cent / 100 / top) * innenH;
  const fmt = (v: number) => (v >= 1000 ? `${(v / 1000).toLocaleString("de-DE")} T€` : `${v} €`);
  const planPfad = kum.map((k, j) => `${j ? "L" : "M"}${x(j)} ${y(k.plan)}`).join("");
  const istPunkte = kum.filter((k) => k.ist !== null);
  const istPfad = istPunkte.map((k, j) => `${j ? "L" : "M"}${x(j)} ${y(k.ist!)}`).join("");
  const heute = istPunkte.length - 1;
  const ticks = Array.from({ length: Math.round(top / s) + 1 }, (_, t) => t * s);
  return `<svg viewBox="0 0 ${breite} ${hoehe}" width="100%" role="img" aria-label="Kumulierter Umsatz, Plan gegen Ist" style="font-family:'IBM Plex Mono',monospace;font-size:11px">
${ticks.map((t) => `<line x1="${links}" x2="${breite - rechts}" y1="${y(t * 100)}" y2="${y(t * 100)}" stroke="${f.linie}"/><text x="${links - 8}" y="${y(t * 100) + 4}" text-anchor="end" fill="${f.leise}">${fmt(t)}</text>`).join("")}
<g font-family="Archivo, sans-serif" font-size="12"><line x1="${links}" x2="${links + 18}" y1="13" y2="13" stroke="${f.ausgaben}" stroke-width="2" stroke-dasharray="5 4"/><text x="${links + 24}" y="17" fill="${f.text}">Plan (Business Case)</text><line x1="${links + 170}" x2="${links + 188}" y1="13" y2="13" stroke="${f.umsatz}" stroke-width="2"/><text x="${links + 194}" y="17" fill="${f.text}">Ist</text></g>
<path d="${planPfad}" fill="none" stroke="${f.ausgaben}" stroke-width="2" stroke-dasharray="5 4"/>
${istPfad ? `<path d="${istPfad}" fill="none" stroke="${f.umsatz}" stroke-width="2"/>` : ""}
${kum.map((k, j) => `<circle cx="${x(j)}" cy="${y(k.plan)}" r="6" fill="transparent"><title>${esc(k.name)}: Plan ${euro(k.plan)}${k.ist !== null ? `, Ist ${euro(k.ist)}` : ""}</title></circle>`).join("")}
${heute >= 0 ? `<line x1="${x(heute)}" x2="${x(heute)}" y1="${oben}" y2="${oben + innenH}" stroke="${f.leise}" stroke-dasharray="2 3"/><circle cx="${x(heute)}" cy="${y(kum[heute].ist!)}" r="4" fill="${f.umsatz}" stroke="${f.grund}" stroke-width="2"/><text x="${x(heute) + 6}" y="${oben + 12}" fill="${f.leise}">heute</text>` : ""}
${kum.map((k, j) => (j % 3 === 0 ? `<text x="${x(j)}" y="${hoehe - 10}" text-anchor="middle" fill="${f.leise}">${esc(k.name)}</text>` : "")).join("")}
<line x1="${links}" x2="${breite - rechts}" y1="${oben + innenH}" y2="${oben + innenH}" stroke="${f.leise}"/>
</svg>`;
}
