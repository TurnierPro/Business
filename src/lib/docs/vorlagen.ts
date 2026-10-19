import { marke } from "../marke";
import { PAKETE, PaketKey, euro, UST } from "../pakete";
import type { Pruefpunkt } from "../adapters/websitecheck";
import {
  Anschrift,
  absaetze,
  anschriftfeld,
  datumDe,
  dinCss,
  druckSeite,
  esc,
  falzmarken,
  fuss,
  kopf,
} from "./basis";

// Alle Druckvorlagen. Jede Vorlage bekommt nur Daten und liefert fertiges HTML im Stelax-Design.

export type BriefDaten = { an: Anschrift; betreff: string; text: string; datum: string; demoUrl?: string; qr?: string };
export type AngebotDaten = {
  an: Anschrift;
  nummer: string;
  datum: string;
  paket: PaketKey;
  einleitung: string;
  einmalig: number;
  monatlich: number;
  positionen?: { text: string; einmalig: number; monatlich: number; hinweis?: string }[];
  zahlweg?: "stripe" | "ueberweisung";
};
export type CheckDaten = { an: Anschrift; website?: string | null; datum: string; punkte: Pruefpunkt[]; prioritaeten: string[]; ladezeitMs?: number };
export type LeitfadenDaten = { an: Anschrift; datum: string; fragen: string[]; hinweise: string[] };
export type ProtokollDaten = {
  an: Anschrift;
  datum: string;
  ziele: string[];
  probleme: string[];
  empfehlung: { paket: PaketKey; begruendung: string };
  offeneFragen: string[];
  massnahmen: { was: string; wann: string; wer: string }[];
};
export type RechnungDaten = { an: Anschrift; nummer: string; datum: string; art: string; positionen: { text: string; netto: number }[]; zahlungszielTage: number };

const DSGVO_HINWEIS = `Woher wir Ihre Anschrift haben: aus dem öffentlichen Impressum Ihres Betriebs. Verantwortlich: ${marke.absender.firma}, ${marke.absender.strasse}, ${marke.absender.ort}. Zweck: einmalige Information über unser Angebot (Art. 6 Abs. 1 lit. f DSGVO). Sie können jederzeit widersprechen, formlos an ${marke.absender.email} oder Tel. ${marke.absender.telefon}. Dann schreiben wir Ihnen nicht mehr und löschen Ihre Daten. Ohne Rückmeldung löschen wir sie nach 6 Monaten. Mehr unter ${marke.absender.web}/datenschutz.`;

export function brief(d: BriefDaten): string {
  const qr = d.qr
    ? `<div class="box" style="display:flex;gap:5mm;align-items:center;margin-top:6mm"><img src="${d.qr}" alt="QR-Code zur Vorschau" style="width:24mm;height:24mm"><div><b>So könnte Ihre Seite aussehen.</b><br><span class="leise">Code scannen oder ${esc(d.demoUrl ?? "")} öffnen. Die Vorschau ist nur für Sie, ohne Cookies und wird nach 60 Tagen gelöscht.</span></div></div>`
    : "";
  return druckSeite({
    titel: d.betreff,
    extraCss: dinCss,
    inhalt: `<div class="seite din">${falzmarken}${kopf()}${anschriftfeld(d.an)}
<div class="infoblock">Ihr Ansprechpartner<br><b>Daniel Lück</b><br>Tel. ${esc(marke.absender.telefon)}<br>${esc(marke.absender.email)}<br><br>Datum<br><b class="mono">${esc(d.datum)}</b></div>
<div class="briefkoerper"><h2 style="margin-top:0">${esc(d.betreff)}</h2>${absaetze(d.text)}${qr}
<p class="ki-hinweis">${esc(DSGVO_HINWEIS)}</p></div>${fuss()}</div>`,
  });
}

export function angebot(d: AngebotDaten): string {
  const p = PAKETE[d.paket];
  const ust = Math.round(d.einmalig * UST);
  return druckSeite({
    titel: `Angebot ${d.nummer}`,
    extraCss: dinCss,
    inhalt: `<div class="seite din">${falzmarken}${kopf()}${anschriftfeld(d.an)}
<div class="infoblock">Angebot<br><b class="mono">${esc(d.nummer)}</b><br><br>Datum<br><b class="mono">${esc(d.datum)}</b><br><br>Gültig bis<br><b class="mono">${esc(datumDe(new Date(Date.now() + 30 * 864e5)))}</b></div>
<div class="briefkoerper"><h1>Angebot: ${esc(p.name)}</h1>${absaetze(d.einleitung)}
<h2>Was Sie bekommen</h2><ul>${p.inhalt.map((i) => `<li>${esc(i)}</li>`).join("")}${(d.positionen ?? []).slice(1).map((x) => `<li>${esc(x.text)}</li>`).join("")}</ul>
</div>${fuss()}</div>
<div class="seite">${kopf()}
<h2 style="margin-top:0">Preise</h2>
<table><thead><tr><th>Leistung</th><th class="zahl">Einmalig netto</th><th class="zahl">Monatlich netto</th></tr></thead><tbody>
${(d.positionen?.length ? d.positionen : [{ text: p.name, einmalig: d.einmalig, monatlich: d.monatlich }])
  .map((x) => `<tr><td>${esc(x.text)}${"hinweis" in x && x.hinweis ? `<br><span class="leise" style="font-size:8.5pt">${esc(x.hinweis)}</span>` : ""}</td><td class="zahl">${x.einmalig ? euro(x.einmalig) : "–"}</td><td class="zahl">${x.monatlich ? euro(x.monatlich) : "–"}</td></tr>`)
  .join("")}
<tr><td><b>Summe netto</b></td><td class="zahl"><b>${euro(d.einmalig)}</b></td><td class="zahl"><b>${euro(d.monatlich)}</b></td></tr>
<tr><td>Umsatzsteuer 19 %</td><td class="zahl">${euro(ust)}</td><td class="zahl">${euro(Math.round(d.monatlich * UST))}</td></tr>
<tr><td><b>Summe brutto</b></td><td class="zahl"><b>${euro(d.einmalig + ust)}</b></td><td class="zahl"><b>${euro(d.monatlich + Math.round(d.monatlich * UST))}</b></td></tr>
</tbody></table>
<p class="leise" style="font-size:8.5pt">Betreuung mit 12 Monaten Mindestlaufzeit.</p>
<h2>So läuft es ab</h2>
<ul>${
  d.zahlweg === "stripe"
    ? "<li>50 % bei Auftrag: Sie zahlen direkt online nach der Annahme (Karte oder SEPA-Lastschrift über Stripe). Wir beginnen nach Zahlungseingang.</li><li>50 % beim Livegang und die monatliche Betreuung ziehen wir mit der hinterlegten Zahlungsart ein. Rechnungen erhalten Sie per E-Mail.</li>"
    : "<li>50 % bei Auftrag, 50 % beim Livegang, per Überweisung. Wir beginnen nach Zahlungseingang.</li><li>Betreuung per SEPA-Lastschrift, monatlich.</li>"
}
<li>Livegang ${p.wochen <= 4 ? "30 Tage" : `${p.wochen} Wochen`} nach Erhalt Ihrer Inhalte. Klappt das nicht, ist ein Monat Betreuung kostenlos.</li>
<li>Beim Livegang: Lighthouse ≥ 95 und Barrierefreiheit nach WCAG 2.2 AA, sonst bessern wir kostenlos nach.</li>
<li>Die Domain läuft auf Ihren Namen. Nach 12 Monaten gehören Ihnen Inhalte und Code.</li>
<li>Website, Formulare und Kundendaten liegen in Deutschland (Hetzner).</li></ul>
<div class="box"><b>Annehmen</b><br><span class="leise">Sie nehmen dieses Angebot in Ihrem Kundenportal an (Link in unserer E-Mail). ${d.zahlweg === "stripe" ? "Danach zahlen Sie die Anzahlung direkt online." : "Danach bekommen Sie die Rechnung über die Anzahlung."}</span></div>
${fuss()}</div>`,
  });
}

export function checkReport(d: CheckDaten): string {
  const zeilen = d.punkte
    .map((p) => `<tr><td>${esc(p.name)}</td><td><span class="ampel ${p.ampel}">${p.ampel === "gruen" ? "GUT" : p.ampel === "gelb" ? "PRÜFEN" : "HANDELN"}</span></td><td>${esc(p.befund)}</td></tr>`)
    .join("");
  return druckSeite({
    titel: `Online-Check ${d.an.name}`,
    inhalt: `<div class="seite">${kopf()}
<p class="leise mono">ONLINE-CHECK · ${esc(d.datum)}</p>
<h1>${esc(d.an.name)}</h1>
<p>Wir haben geprüft, wie Kunden und Bewerber Ihren Betrieb online finden und erreichen${d.website ? `: <span class="mono">${esc(d.website)}</span>` : "."}</p>
<table><thead><tr><th style="width:32mm">Punkt</th><th style="width:24mm">Stand</th><th>Befund</th></tr></thead><tbody>${zeilen}</tbody></table>
${fuss()}</div>
<div class="seite">${kopf()}
<h2 style="margin-top:0">Die drei wichtigsten Schritte</h2>
<ol>${d.prioritaeten.map((p) => `<li style="margin-bottom:3mm">${esc(p)}</li>`).join("")}</ol>
<div class="box"><b>Gern zeigen wir Ihnen das vor Ort.</b><br><span class="leise">Daniel Lück kommt für 20 Minuten vorbei und bringt eine Vorschau Ihrer neuen Seite mit. Tel. ${esc(marke.absender.telefon)}</span></div>
<p class="ki-hinweis">Hinweis: Dieser Bericht wurde mit Unterstützung von KI erstellt und von Stelax geprüft (Art. 50 KI-Verordnung). Grundlage ist eine automatische Prüfung der öffentlich erreichbaren Startseite am ${esc(d.datum)}.</p>
${fuss()}</div>`,
  });
}

export function leitfaden(d: LeitfadenDaten): string {
  return druckSeite({
    titel: `Gesprächsleitfaden ${d.an.name}`,
    inhalt: `<div class="seite">${kopf()}<p class="leise mono">INTERN · NICHT WEITERGEBEN · ${esc(d.datum)}</p>
<h1>Gesprächsleitfaden: ${esc(d.an.name)}</h1>
<h2>Vorab wissen</h2><ul>${d.hinweise.map((h) => `<li>${esc(h)}</li>`).join("")}</ul>
<h2>Fragen</h2><ol>${d.fragen.map((f) => `<li style="margin-bottom:2.5mm">${esc(f)}</li>`).join("")}</ol>
<div class="box">Aufnahme nur mit Einwilligung. In Stelax OS vor dem Start bestätigen lassen.</div>${fuss()}</div>`,
  });
}

export function protokoll(d: ProtokollDaten): string {
  const liste = (l: string[]) => `<ul>${l.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;
  return druckSeite({
    titel: `Gesprächsprotokoll ${d.an.name}`,
    inhalt: `<div class="seite">${kopf()}<p class="leise mono">GESPRÄCH VOR ORT · ${esc(d.datum)}</p>
<h1>Protokoll und Maßnahmenplan</h1><p>${esc(d.an.name)}${d.an.inhaber ? `, ${esc(d.an.inhaber)}` : ""}</p>
<h2>Ihre Ziele</h2>${liste(d.ziele)}
<h2>Was heute bremst</h2>${liste(d.probleme)}
<h2>Unsere Empfehlung: ${esc(PAKETE[d.empfehlung.paket].name)}</h2><p>${esc(d.empfehlung.begruendung)}</p>
${fuss()}</div>
<div class="seite">${kopf()}
<h2 style="margin-top:0">Maßnahmenplan</h2>
<table><thead><tr><th>Was</th><th style="width:34mm">Wann</th><th style="width:30mm">Wer</th></tr></thead><tbody>
${d.massnahmen.map((m) => `<tr><td>${esc(m.was)}</td><td>${esc(m.wann)}</td><td>${esc(m.wer)}</td></tr>`).join("")}
</tbody></table>
${d.offeneFragen.length ? `<h2>Noch offen</h2>${liste(d.offeneFragen)}` : ""}
<p class="ki-hinweis">Dieses Protokoll wurde aus der Gesprächsaufnahme mit Unterstützung von KI erstellt und von Stelax geprüft. Die Aufnahme wird nach Freigabe gelöscht.</p>
${fuss()}</div>`,
  });
}

export function rechnung(d: RechnungDaten): string {
  const netto = d.positionen.reduce((s, p) => s + p.netto, 0);
  const ust = Math.round(netto * UST);
  return druckSeite({
    titel: `Rechnung ${d.nummer}`,
    extraCss: dinCss,
    inhalt: `<div class="seite din">${falzmarken}${kopf()}${anschriftfeld(d.an)}
<div class="infoblock">Rechnung<br><b class="mono">${esc(d.nummer)}</b><br><br>Rechnungsdatum<br><b class="mono">${esc(d.datum)}</b><br><br>USt-IdNr.<br><b>${esc(marke.absender.ustId)}</b></div>
<div class="briefkoerper"><h1>Rechnung ${esc(d.nummer)}</h1>
<table><thead><tr><th>Leistung</th><th class="zahl">Netto</th></tr></thead><tbody>
${d.positionen.map((p) => `<tr><td>${esc(p.text)}</td><td class="zahl">${euro(p.netto)}</td></tr>`).join("")}
<tr><td>Summe netto</td><td class="zahl">${euro(netto)}</td></tr>
<tr><td>Umsatzsteuer 19 %</td><td class="zahl">${euro(ust)}</td></tr>
<tr><td><b>Rechnungsbetrag</b></td><td class="zahl"><b>${euro(netto + ust)}</b></td></tr>
</tbody></table>
<p>Bitte überweisen Sie den Betrag innerhalb von ${d.zahlungszielTage} Tagen auf das unten genannte Konto. Verwendungszweck: <span class="mono">${esc(d.nummer)}</span>.</p>
<p class="leise">Leistungszeitraum: ${esc(d.datum)}. Die elektronische Rechnung (E-Rechnung) erhalten Sie über unser Buchhaltungssystem.</p>
</div>${fuss()}</div>`,
  });
}
