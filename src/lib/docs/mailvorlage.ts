import { marke } from "../marke";
import { pflichtangaben } from "../recht";
import { esc } from "./basis";

// E-Mails im Levarex-Design. Regeln für Mail-Programme (Outlook, Gmail, Apple Mail):
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

/** Logo als Bild aus der Originaldatei (public/marke, erzeugt mit scripts/logo-png.ts). Gmail zeigt kein SVG. */
function logoBild(): string {
  const basis = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `<img src="${basis}/marke/levarex-logo-mail.png" width="216" height="26" alt="LEVAREX Consulting" style="display:block;border:0;height:26px;width:216px;font-family:${SCHRIFT};font-size:16px;letter-spacing:4px;color:${t.text}">`;
}

export function mailHtml(o: { betreff: string; text: string }): string {
  const a = marke.absender;
  const p = pflichtangaben();
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(o.betreff)}</title></head>
<body style="margin:0;padding:0;background:${t.flaeche}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${t.flaeche}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:${t.grund};border:1px solid ${t.linie}">
<tr><td style="padding:28px 32px 8px;font-family:${SCHRIFT}">${logoBild()}</td></tr>
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
