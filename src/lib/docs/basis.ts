import fs from "node:fs";
import path from "node:path";
import { marke } from "../marke";
import { logoSvg } from "./logo";
import { pflichtangaben } from "../recht";

// Gemeinsamer Rahmen für alle gedruckten Dokumente: helles Thema, A4, Marken-Schriften eingebettet.

let schriftCss: string | undefined;

function datei(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), "node_modules", rel)).toString("base64");
}

export function schriften(): string {
  schriftCss ??= `
@font-face{font-family:"Archivo";src:url(data:font/woff2;base64,${datei("@fontsource-variable/archivo/files/archivo-latin-wdth-normal.woff2")}) format("woff2");font-weight:100 900;font-stretch:62% 125%;}
@font-face{font-family:"Archivo";src:url(data:font/woff2;base64,${datei("@fontsource-variable/archivo/files/archivo-latin-ext-wdth-normal.woff2")}) format("woff2");font-weight:100 900;font-stretch:62% 125%;unicode-range:U+0100-02AF,U+2020-20CF;}
@font-face{font-family:"IBM Plex Mono";src:url(data:font/woff2;base64,${datei("@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2")}) format("woff2");font-weight:400;}
@font-face{font-family:"IBM Plex Mono";src:url(data:font/woff2;base64,${datei("@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-600-normal.woff2")}) format("woff2");font-weight:600;}`;
  return schriftCss;
}

const t = marke.hell;

export const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const absaetze = (text: string) =>
  text
    .trim()
    .split(/\n\s*\n/)
    .map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("");

export const datumDe = (d: Date = new Date()) => d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });

export function druckSeite(o: { titel: string; inhalt: string; extraCss?: string }): string {
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${esc(o.titel)}</title><style>
${schriften()}
@page{size:A4;margin:0}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{font-family:"Archivo",sans-serif;font-size:10.5pt;line-height:1.5;color:${t.text};background:${t.grund};-webkit-print-color-adjust:exact;print-color-adjust:exact}
.seite{width:210mm;height:297mm;padding:12mm 20mm 34mm 25mm;position:relative;background:${t.grund};page-break-after:always;overflow:visible;display:flow-root}
/* Kopf auf jeder Seite an derselben Stelle: 12 mm von oben (wie im DIN-Brief) */
p,li,td,th,h1,h2,h3,.box,.anschrift,.infoblock{overflow-wrap:anywhere;hyphens:auto}
tr,li,.box{break-inside:avoid}
h1,h2,h3{break-after:avoid}
.seite:last-child{page-break-after:auto}
h1,h2,h3{font-weight:600;font-stretch:118%;margin:0 0 4mm;line-height:1.2;letter-spacing:.01em}
h1{font-size:19pt}h2{font-size:13pt;margin-top:7mm}h3{font-size:11pt;margin-top:5mm}
p{margin:0 0 3.2mm}
.leise{color:${t.textLeise}}
.mono{font-family:"IBM Plex Mono",monospace}
.akzent{color:${t.akzent}}
table{width:100%;border-collapse:collapse;margin:3mm 0 5mm}
th,td{text-align:left;vertical-align:top;padding:2.2mm 2mm;border-bottom:.3mm solid ${t.linie}}
th{font-weight:600;font-size:9pt;color:${t.textLeise};text-transform:uppercase;letter-spacing:.06em}
td.zahl,th.zahl{text-align:right;font-family:"IBM Plex Mono",monospace;white-space:nowrap}
.kopf{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10mm}
.kopf .slogan{font-size:8.5pt;color:${t.textLeise};margin-top:2mm}
.fuss{position:absolute;left:25mm;right:20mm;bottom:8mm;font-size:7pt;line-height:1.45;color:${t.textLeise};border-top:.3mm solid ${t.linie};padding-top:2.5mm;display:grid;grid-template-columns:38fr 27fr 35fr;gap:5mm}
.fuss div{white-space:nowrap;overflow:hidden;text-overflow:clip}
.box{border:.3mm solid ${t.linie};padding:4mm 5mm;margin:4mm 0;background:${t.flaeche}}
.ampel{display:inline-block;font-family:"IBM Plex Mono",monospace;font-size:8.5pt;font-weight:600;padding:.6mm 2mm;border:.3mm solid currentColor;border-radius:2px;white-space:nowrap}
.ampel.gruen{color:${t.signalOk}}.ampel.gelb{color:${t.akzent}}.ampel.rot{color:${t.signalFehler}}
ul{margin:0 0 3mm;padding-left:5mm}li{margin-bottom:1mm}
.ki-hinweis{font-size:7.5pt;color:${t.textLeise};margin-top:6mm}
${o.extraCss ?? ""}
</style></head><body>${o.inhalt}</body></html>`;
}

export function kopf(): string {
  return `<div class="kopf"><div>${logoSvg({ text: t.text, akzent: t.akzent, consulting: true, hoehe: 40 })}<div class="slogan">${esc(marke.slogan)}</div></div></div>`;
}

export function fuss(): string {
  const a = marke.absender;
  const p = pflichtangaben();
  // Pflichtangaben nach § 35a GmbHG: Rechtsform, Sitz, Registergericht, Nummer, alle Geschäftsführer.
  // Feste Zeilen statt Fließtext: so bricht nichts unkontrolliert um (die Layout-Prüfung meldet zu lange Zeilen).
  const zeilen = (l: string[]) => `<div>${l.map(esc).join("<br>")}</div>`;
  return `<div class="fuss">${zeilen([p.firma, `${a.strasse}, ${a.ort}`, `Sitz ${a.sitz} · ${a.registergericht}`, a.hrb ? a.hrb : "HRB folgt nach Eintragung"])}${zeilen([`Tel. ${a.telefon}`, a.email, a.web, `USt-IdNr. ${a.ustId}`])}${zeilen(["Geschäftsführer:", ...a.geschaeftsfuehrer.split(/,\s*/), `IBAN ${a.iban}`])}</div>`;
}

export type Anschrift = { name: string; anrede?: string | null; inhaber?: string | null; strasse?: string | null; plz?: string | null; ort?: string | null };

export function anschriftfeld(an: Anschrift): string {
  const a = marke.absender;
  const person = an.inhaber ? `${an.anrede === "Frau" ? "Frau" : "Herrn"} ${an.inhaber}` : "";
  return `<div class="anschrift"><div class="ruecksende">${esc(a.firma)} · ${esc(a.strasse)} · ${esc(a.ort)}</div>${esc(an.name)}<br>${person ? esc(person) + "<br>" : ""}${esc(an.strasse ?? "")}<br>${esc(an.plz ?? "")} ${esc(an.ort ?? "")}</div>`;
}

export function briefAnrede(an: Anschrift): string {
  if (!an.inhaber) return "Sehr geehrte Damen und Herren,";
  const nachname = an.inhaber.split(" ").slice(-1)[0];
  return an.anrede === "Frau" ? `Sehr geehrte Frau ${nachname},` : `Sehr geehrter Herr ${nachname},`;
}

// DIN 5008 Form B: Anschriftfeld 45 mm von oben, Falzmarken bei 105 und 210 mm, Lochmarke bei 148,5 mm.
export const dinCss = `
.din{padding-top:0}
.din .kopf{position:absolute;top:12mm;left:25mm;right:20mm}
.anschrift{position:absolute;top:50mm;left:25mm;width:85mm;height:40mm;font-size:10.5pt;line-height:1.35}
.ruecksende{font-size:7pt;color:${t.textLeise};border-bottom:.3mm solid ${t.linie};margin-bottom:2mm;padding-bottom:1mm;white-space:nowrap;overflow:hidden}
.infoblock{position:absolute;top:50mm;right:20mm;width:60mm;font-size:8.5pt;line-height:1.5;color:${t.textLeise}}
.infoblock b{color:${t.text};font-weight:600}
.briefkoerper{margin-top:88mm}
.falz{position:absolute;left:5mm;width:4mm;border-top:.3mm solid ${t.rahmen}}
`;

export const falzmarken = `<div class="falz" style="top:105mm"></div><div class="falz" style="top:148.5mm;width:6mm"></div><div class="falz" style="top:210mm"></div>`;
