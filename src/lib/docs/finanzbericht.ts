import { druckSeite, esc, fuss, kopf, datumDe } from "./basis";
import { euro, UST } from "../pakete";
import { umsatzDiagramm, FARBEN_HELL } from "../diagramm";
import { kategorieName, monatName, type Auswertung, type Zeitraum } from "../finanzen";

// Quartals-, Monats- oder Jahresbericht im Stelax-Design. Grundlage für Gespräche mit dem Steuerberater und der Bank.

export function finanzbericht(z: Zeitraum, a: Auswertung): string {
  const kachel = (name: string, wert: string) => `<td style="border:.3mm solid #D6D2C8;padding:3mm 4mm;width:33%"><div class="leise" style="font-size:8pt">${name}</div><div class="mono" style="font-size:14pt;font-weight:600">${wert}</div></td>`;
  return druckSeite({
    titel: `Finanzbericht ${z.name}`,
    inhalt: `<div class="seite">${kopf()}
<p class="leise mono">FINANZBERICHT · ERSTELLT AM ${esc(datumDe())}</p>
<h1>${esc(z.name)}</h1>
<p>Ergebnis ${a.ergebnis >= 0 ? "positiv" : "negativ"}: <b class="mono">${euro(a.ergebnis)}</b> bei ${euro(a.umsatz)} Umsatz und ${euro(a.kosten)} Ausgaben (netto).</p>
<table style="border-collapse:separate;border-spacing:2mm 2mm;margin-left:-2mm"><tr>${kachel("Umsatz netto", euro(a.umsatz))}${kachel("Ausgaben netto", euro(a.kosten))}${kachel("Ergebnis", euro(a.ergebnis))}</tr>
<tr>${kachel("USt-Zahllast (Ist)", euro(a.ustZahllast))}${kachel("Steuerrücklage 31,5 %", euro(a.steuerruecklage))}${kachel("Offene Forderungen (brutto)", euro(a.offeneForderungen))}</tr></table>
<h2>Umsatz und Ausgaben je Monat</h2>
${umsatzDiagramm(a.proMonat.map((m) => ({ name: monatName(m.monat), umsatz: m.umsatz, ausgaben: m.ausgaben })), FARBEN_HELL, 640)}
<table><thead><tr><th>Monat</th><th class="zahl">Umsatz</th><th class="zahl">Ausgaben</th><th class="zahl">Ergebnis</th></tr></thead><tbody>
${a.proMonat.map((m) => `<tr><td>${monatName(m.monat)}</td><td class="zahl">${euro(m.umsatz)}</td><td class="zahl">${euro(m.ausgaben)}</td><td class="zahl">${euro(m.umsatz - m.ausgaben)}</td></tr>`).join("")}
</tbody></table>
${fuss()}</div>
<div class="seite">${kopf()}
<h2 style="margin-top:0">Ausgaben nach Kategorie, Plan und Ist</h2>
<table><thead><tr><th>Kategorie</th><th class="zahl">Plan</th><th class="zahl">Ist</th><th class="zahl">Abweichung</th></tr></thead><tbody>
${a.proKategorie.map((k) => `<tr><td>${esc(k.name)}</td><td class="zahl">${k.plan ? euro(k.plan) : "–"}</td><td class="zahl">${euro(k.ist)}</td><td class="zahl">${k.plan ? euro(k.ist - k.plan) : "–"}</td></tr>`).join("")}
</tbody></table>
<h2>Umsatzsteuer (Ist-Versteuerung)</h2>
<table><tbody>
<tr><td>Umsatzsteuer aus bezahlten Rechnungen</td><td class="zahl">${euro(a.ustEinnahmen)}</td></tr>
<tr><td>Vorsteuer aus bezahlten Ausgaben</td><td class="zahl">${euro(a.vorsteuer)}</td></tr>
<tr><td><b>Zahllast</b></td><td class="zahl"><b>${euro(a.ustZahllast)}</b></td></tr>
</tbody></table>
<h2>Rechnungen im Zeitraum</h2>
<table><thead><tr><th>Datum</th><th>Nummer</th><th>Kunde</th><th class="zahl">Netto</th><th>Status</th></tr></thead><tbody>
${a.rechnungen.map(({ r, kunde }) => `<tr><td class="mono">${datumDe(new Date(r.erstelltAm))}</td><td class="mono">${esc(r.nummer)}</td><td>${esc(kunde)}</td><td class="zahl">${euro(r.netto)}</td><td>${r.status === "bezahlt" ? "bezahlt" : "offen"}</td></tr>`).join("") || `<tr><td colspan="5" class="leise">Keine</td></tr>`}
</tbody></table>
${fuss()}</div>
<div class="seite">${kopf()}
<h2 style="margin-top:0">Ausgaben im Zeitraum</h2>
<table><thead><tr><th>Datum</th><th>Lieferant</th><th>Kategorie</th><th class="zahl">Netto</th><th class="zahl">USt</th><th>Beleg</th></tr></thead><tbody>
${a.ausgaben.map((x) => `<tr><td class="mono">${datumDe(new Date(x.datum))}</td><td>${esc(x.lieferant)}</td><td>${esc(kategorieName(x.kategorie))}</td><td class="zahl">${euro(x.netto)}</td><td class="zahl">${euro(x.ust)}</td><td>${x.belegName ? "ja" : "<b>fehlt</b>"}</td></tr>`).join("") || `<tr><td colspan="6" class="leise">Keine</td></tr>`}
</tbody></table>
<p class="ki-hinweis">Dieser Bericht ist eine Steuerungsübersicht aus Stelax OS, keine Bilanz und kein Jahresabschluss. Maßgeblich ist die Buchhaltung beim Steuerberater. Beträge in Euro, Umsatz nach Rechnungsdatum, Umsatzsteuer nach Zahlungseingang (Ist-Versteuerung), USt-Satz ${Math.round(UST * 100)} %.</p>
${fuss()}</div>`,
  });
}
