import { marke } from "../marke";
import { pflichtangaben } from "../recht";
import { esc } from "./basis";

// E-Mails im Nexova-Design. Regeln für Mail-Programme (Outlook, Gmail, Apple Mail):
// Tabellen statt Flexbox, nur Inline-Styles, keine Skripte, keine SVG (Gmail zeigt sie nicht),
// helles Design (wie alles Gedruckte), Systemschriften als Ersatz für Archivo.

const t = marke.hell;
const SCHRIFT = "Archivo, 'Helvetica Neue', Helvetica, Arial, sans-serif";

/** Text mit Absätzen und anklickbaren Links (alles maskiert). */
function textAlsHtml(text: string): string {
  return text
    .trim()
    .split(/\n\s*\n/)
    .map((absatz) => {
      const html = esc(absatz)
        .replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, (u) => `<a href="${u}" style="color:${t.akzent};word-break:break-all">${u}</a>`)
        .replace(/\n/g, "<br>");
      return `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:${t.text}">${html}</p>`;
    })
    .join("");
}

/** Wortmarke als Text: N E X O V A mit Messing-X. */
function wortmarke(): string {
  const wort = marke.name.split(" ")[0].toUpperCase();
  const i = wort.indexOf("X");
  const teil = (s: string) => `<span style="color:${t.text}">${esc(s)}</span>`;
  const mitte = i >= 0 ? `${teil(wort.slice(0, i))}<span style="color:${t.akzent}">X</span>${teil(wort.slice(i + 1))}` : teil(wort);
  return `<div style="font-family:${SCHRIFT};font-size:22px;letter-spacing:7px;font-weight:300">${mitte}</div><div style="font-family:${SCHRIFT};font-size:9px;letter-spacing:5px;color:${t.textLeise};margin-top:2px">CONSULTING</div>`;
}

export function mailHtml(o: { betreff: string; text: string }): string {
  const a = marke.absender;
  const p = pflichtangaben();
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(o.betreff)}</title></head>
<body style="margin:0;padding:0;background:${t.flaeche}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${t.flaeche}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:${t.grund};border:1px solid ${t.linie}">
<tr><td style="padding:28px 32px 8px;font-family:${SCHRIFT}">${wortmarke()}</td></tr>
<tr><td style="padding:16px 32px 8px;font-family:${SCHRIFT}">${textAlsHtml(o.text)}</td></tr>
<tr><td style="padding:16px 32px 28px;font-family:${SCHRIFT};font-size:11px;line-height:1.6;color:${t.textLeise};border-top:1px solid ${t.linie}">
${esc(p.firma)} · ${esc(a.strasse)}, ${esc(a.ort)}<br>
Tel. ${esc(a.telefon)} · <a href="mailto:${esc(a.email)}" style="color:${t.textLeise}">${esc(a.email)}</a> · ${esc(a.web)}<br>
${esc(p.register)}<br>${esc(p.gf)}
</td></tr>
</table>
<div style="font-family:${SCHRIFT};font-size:11px;color:${t.textLeise};padding-top:12px">${esc(marke.slogan)}</div>
</td></tr></table>
</body></html>`;
}
