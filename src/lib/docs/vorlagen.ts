import { marke } from "../marke";
import { NICHT_ENTHALTEN, PAKETE, PaketKey, euro, UST } from "../pakete";
import { ABNAHME_FRIST_TAGE, AGB_URL, AGB_VERSION } from "../recht";
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

// Alle Druckvorlagen. Jede Vorlage bekommt nur Daten und liefert fertiges HTML im Nexova-Design.

export type BriefDaten = { an: Anschrift; betreff: string; text: string; datum: string; demoUrl?: string; qr?: string; quelle?: string };
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
  anmerkungen?: string;
  agbVersion?: string;
  // Beim Erstellen eingefroren (ältere Angebote haben das noch nicht, dann gilt der Katalog)
  paketName?: string;
  paketInhalt?: string[];
  nichtEnthalten?: string[];
  wochen?: number;
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
export type RechnungDaten = {
  an: Anschrift;
  nummer: string;
  datum: string;
  art: string;
  positionen: { text: string; netto: number }[];
  zahlungszielTage: number;
  /** Kalenderdatum, bis wann zu zahlen ist (TT.MM.JJJJ) */
  zahlbarBis?: string;
  /** Leistungszeitpunkt bzw. -zeitraum; bei Anzahlungen leer */
  leistung?: string;
};
export type AuftragDaten = {
  an: Anschrift;
  nummer: string;
  angebotNummer: string;
  datum: string;
  paket: PaketKey;
  positionen: { text: string; einmalig: number; monatlich: number }[];
  einmalig: number;
  monatlich: number;
  annahme: { name: string; am: string; agbVersion: string; unternehmer: boolean };
  zahlweg: "stripe" | "ueberweisung";
};
export type AbnahmeDaten = {
  an: Anschrift;
  datum: string;
  projekt: string;
  domain?: string | null;
  ergebnis: "abgenommen" | "vorbehalt" | "fiktion";
  name?: string | null;
  am: string;
  frist?: string | null;
  maengel?: string | null;
  pruefung: { name: string; ok: boolean; detail: string }[];
};
export type MonatsreportDaten = {
  an: Anschrift;
  monat: string;
  domain?: string | null;
  anfragen: number;
  anfragenVormonat: number;
  erreichbar: { pruefungen: number; ausfaelle: number };
  hinweise: string[];
};

// Art. 14 DSGVO (Quelle, Zweck, Rechtsgrundlage, Speicherdauer) und ausdrücklicher Hinweis auf Art. 21 DSGVO.
function dsgvoHinweis(quelle?: string): string {
  const a = marke.absender;
  return `Datenschutz: Verantwortlich ist ${a.firma}, ${a.strasse}, ${a.ort}. Ihre Geschäftsanschrift stammt aus einer öffentlichen Quelle (${quelle || "öffentliches Impressum Ihres Betriebs"}). Zweck ist die einmalige Information über unser Angebot, Rechtsgrundlage unser berechtigtes Interesse an Direktwerbung (Art. 6 Abs. 1 lit. f DSGVO). Ohne Rückmeldung löschen wir Ihre Daten nach 6 Monaten. Widerspruchsrecht nach Art. 21 DSGVO: Sie können der Nutzung Ihrer Daten für Werbung jederzeit ohne Angabe von Gründen widersprechen, formlos an ${a.email} oder Tel. ${a.telefon}. Dann schreiben wir Ihnen nicht mehr. Weitere Rechte (Auskunft, Berichtigung, Löschung, Beschwerde bei der Aufsichtsbehörde) und mehr unter ${a.web}/datenschutz.`;
}

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
<p class="ki-hinweis">${esc(dsgvoHinweis(d.quelle))}</p></div>${fuss()}</div>`,
  });
}

/** Paketdaten für ein Angebot: eingefroren, sonst aus dem aktuellen Katalog. */
function paketFuer(d: AngebotDaten) {
  const k = PAKETE[d.paket];
  return { name: d.paketName ?? k.name, inhalt: d.paketInhalt ?? k.inhalt, wochen: d.wochen ?? k.wochen, nicht: d.nichtEnthalten ?? NICHT_ENTHALTEN[d.paket] };
}

export function angebot(d: AngebotDaten): string {
  const p = paketFuer(d);
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
${d.anmerkungen?.trim() ? `<h2>Anmerkungen</h2>${absaetze(d.anmerkungen)}` : ""}
<h2>So läuft es ab</h2>
<ul>${
  d.zahlweg === "stripe"
    ? "<li>Zahlungsplan, individuell vereinbart: 50 % bei Auftrag, Sie zahlen direkt online nach der Annahme (Karte oder SEPA-Lastschrift über Stripe). Wir beginnen nach Zahlungseingang mit Konzept und Entwurf.</li><li>50 % nach Ihrer Abnahme der fertigen Website. Diesen Betrag und die monatliche Betreuung ziehen wir mit der hinterlegten Zahlungsart ein. Rechnungen erhalten Sie per E-Mail.</li>"
    : "<li>Zahlungsplan, individuell vereinbart: 50 % bei Auftrag, 50 % nach Ihrer Abnahme der fertigen Website, per Überweisung. Wir beginnen nach Zahlungseingang mit Konzept und Entwurf.</li><li>Betreuung per SEPA-Lastschrift, monatlich.</li>"
}
<li>Livegang ${p.wochen <= 4 ? "30 Tage" : `${p.wochen} Wochen`} nach Erhalt Ihrer Inhalte. Klappt das nicht, ist ein Monat Betreuung kostenlos.</li>
<li>Beim Livegang: Lighthouse ≥ 95 und Barrierefreiheit nach WCAG 2.2 AA, sonst bessern wir kostenlos nach.</li>
<li>Die Domain läuft auf Ihren Namen. Nach 12 Monaten gehören Ihnen Inhalte und Code.</li>
<li>Website, Formulare und Kundendaten liegen in Deutschland (Hetzner).</li></ul>
<div class="box"><b>Allgemeine Geschäftsbedingungen</b><br>Es gelten unsere AGB für Unternehmer, Version ${esc(d.agbVersion ?? AGB_VERSION)}, abrufbar unter <span class="mono">${esc(AGB_URL)}</span>. Dieses Angebot richtet sich nur an Unternehmer (§ 14 BGB). Mit der Annahme bestätigen Sie, dass Sie für Ihren Betrieb handeln und nicht als Verbraucher.</div>
<div class="box"><b>Annehmen</b><br><span class="leise">Sie nehmen dieses Angebot in Ihrem Kundenportal an (Link in unserer E-Mail). ${d.zahlweg === "stripe" ? "Danach zahlen Sie die Anzahlung direkt online." : "Danach bekommen Sie die Rechnung über die Anzahlung."} Anlage: Leistungsbeschreibung.</span></div>
${fuss()}</div>
${leistungsbeschreibung(d)}`,
  });
}

/** Anlage zum Angebot: was geschuldet ist, was nicht, wann abgenommen wird, was der Kunde beiträgt. */
function leistungsbeschreibung(d: AngebotDaten): string {
  const p = paketFuer(d);
  const extra = (d.positionen ?? []).slice(1).map((x) => x.text);
  const mitKi = extra.some((t) => /modul|assistent|ki|angebotsentwurf|doku|chat/i.test(t)) || d.paket === "L";
  return `<div class="seite">${kopf()}
<p class="leise mono">ANLAGE 1 ZUM ANGEBOT ${esc(d.nummer)}</p>
<h1>Leistungsbeschreibung</h1>
<h2>Enthalten</h2><ul>${[...p.inhalt, ...extra].map((i) => `<li>${esc(i)}</li>`).join("")}</ul>
<h2>Nicht enthalten</h2><p>${esc(p.nicht.join(", "))}. Größere Vorhaben bieten wir gern gesondert an.</p>
<h2>Abnahme</h2>
<p>Wenn die Website fertig ist, stellen wir sie Ihnen bereit und bitten im Kundenportal um Abnahme. Sie haben ${ABNAHME_FRIST_TAGE} Tage Zeit: abnehmen, unter Vorbehalt mit Mängeln abnehmen oder mit Begründung verweigern. Melden Sie sich in der Frist nicht und nennen keinen Mangel, gilt die Website als abgenommen (§ 640 Abs. 2 BGB). Mängel beheben wir in angemessener Frist.</p>
<p>Abnahmekriterien: Seiten und Funktionen wie oben, Formulare kommen an, Darstellung auf Handy und Computer, Lighthouse ≥ 95, technische Barrierefreiheit nach WCAG 2.2 AA, Rechtstexte eingebunden.</p>
<h2>Ihre Mitwirkung</h2>
<ul><li>Texte, Fotos und Logo laden Sie im Kundenportal hoch. Die 30-Tage-Zusage zum Livegang beginnt mit Erhalt der Inhalte.</li>
<li>Bestehende Domain: Sie bleiben Inhaber. Sie ändern nach unserer Anleitung zwei Einträge (oder geben uns den Auth-Code); E-Mail und andere Dienste bleiben unberührt. Das alte Webhosting kündigen Sie erst nach unserer Nachricht.</li>
<li>Rechte an Texten, Fotos und Logo, auch an Inhalten der bisherigen Website.</li>
<li>Barrierefreiheit: Wir schulden die technische Umsetzung. Für Inhalte, die Sie später selbst einstellen (z. B. Bildbeschreibungen), sind Sie verantwortlich.</li></ul>
${mitKi ? "<h2>Bausteine mit KI</h2><p>Geschuldet ist die vereinbarte Funktion des Ablaufs, nicht die inhaltliche Richtigkeit jeder einzelnen KI-Ausgabe. Was nach außen geht, prüft und gibt ein Mensch in Ihrem Betrieb frei.</p>" : ""}
<h2>Datenschutz</h2><p>Für Hosting und Formulare verarbeiten wir personenbezogene Daten in Ihrem Auftrag. Dazu schließen wir vor dem Livegang einen Vertrag zur Auftragsverarbeitung (Art. 28 DSGVO). Server in Deutschland.</p>
${fuss()}</div>`;
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
<p class="ki-hinweis">Hinweis: Dieser Bericht wurde mit Unterstützung von KI erstellt und von Nexova geprüft (Art. 50 KI-Verordnung). Grundlage ist eine automatische Prüfung der öffentlich erreichbaren Startseite am ${esc(d.datum)}.</p>
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
<div class="box">Aufnahme nur mit Einwilligung. In Nexova OS vor dem Start bestätigen lassen.</div>${fuss()}</div>`,
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
<p class="ki-hinweis">Dieses Protokoll wurde aus der Gesprächsaufnahme mit Unterstützung von KI erstellt und von Nexova geprüft. Die Aufnahme wird nach Freigabe gelöscht.</p>
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
${d.positionen.map((p) => `<tr><td>${esc(p.text)}</td><td class="zahl">${p.netto < 0 ? "− " + euro(-p.netto) : euro(p.netto)}</td></tr>`).join("")}
<tr><td>Summe netto</td><td class="zahl">${euro(netto)}</td></tr>
<tr><td>Umsatzsteuer 19 %</td><td class="zahl">${euro(ust)}</td></tr>
<tr><td><b>Rechnungsbetrag</b></td><td class="zahl"><b>${euro(netto + ust)}</b></td></tr>
</tbody></table>
<p>${d.art === "betreuung" ? "Der Betrag wird wie vereinbart eingezogen." : "Bitte überweisen Sie den Betrag"} ${d.art === "betreuung" ? "" : `bis zum <b class="mono">${esc(d.zahlbarBis ?? datumDe(new Date(Date.now() + d.zahlungszielTage * 864e5)))}</b> auf das unten genannte Konto. Verwendungszweck: <span class="mono">${esc(d.nummer)}</span>.`}</p>
<p class="leise">${d.art === "anzahlung" ? "Anzahlungsrechnung: Die Leistung ist noch nicht erbracht. Die Umsatzsteuer entsteht mit Vereinnahmung der Anzahlung." : `Leistungszeitpunkt: ${esc(d.leistung ?? d.datum)}.`} Die elektronische Rechnung (E-Rechnung) erhalten Sie über unser Buchhaltungssystem.</p>
</div>${fuss()}</div>`,
  });
}

export function auftragsbestaetigung(d: AuftragDaten): string {
  const p = PAKETE[d.paket];
  const am = new Date(d.annahme.am).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" });
  return druckSeite({
    titel: `Auftragsbestätigung ${d.nummer}`,
    extraCss: dinCss,
    inhalt: `<div class="seite din">${falzmarken}${kopf()}${anschriftfeld(d.an)}
<div class="infoblock">Auftragsbestätigung<br><b class="mono">${esc(d.nummer)}</b><br><br>Zu Angebot<br><b class="mono">${esc(d.angebotNummer)}</b><br><br>Datum<br><b class="mono">${esc(d.datum)}</b></div>
<div class="briefkoerper"><h1>Auftragsbestätigung: ${esc(p.name)}</h1>
<p>vielen Dank für Ihren Auftrag. Hiermit bestätigen wir den Vertrag zu unserem Angebot ${esc(d.angebotNummer)}.</p>
<table><thead><tr><th>Leistung</th><th class="zahl">Einmalig netto</th><th class="zahl">Monatlich netto</th></tr></thead><tbody>
${d.positionen.map((x) => `<tr><td>${esc(x.text)}</td><td class="zahl">${x.einmalig ? euro(x.einmalig) : "–"}</td><td class="zahl">${x.monatlich ? euro(x.monatlich) : "–"}</td></tr>`).join("")}
<tr><td><b>Summe netto</b></td><td class="zahl"><b>${euro(d.einmalig)}</b></td><td class="zahl"><b>${euro(d.monatlich)}</b></td></tr>
</tbody></table>
<div class="box"><b>Annahme</b><br>Angenommen von ${esc(d.annahme.name)} am ${esc(am)} Uhr im Kundenportal.<br>Grundlage: unsere AGB für Unternehmer, Version ${esc(d.annahme.agbVersion)}.${d.annahme.unternehmer ? " Bestätigt: Der Auftrag wird für den Betrieb erteilt, nicht als Verbraucher (§ 14 BGB)." : ""}</div>
<h2>Wie es weitergeht</h2><ul>
<li>${d.zahlweg === "stripe" ? "Anzahlung 50 % online im Kundenportal." : "Rechnung über die Anzahlung von 50 % kommt per E-Mail."} Wir beginnen nach Zahlungseingang.</li>
<li>Danach laden Sie Texte, Fotos und Logo im Kundenportal hoch.</li>
<li>Die restlichen 50 % werden nach Ihrer Abnahme der fertigen Website fällig.</li></ul>
</div>${fuss()}</div>`,
  });
}

export function abnahmeprotokoll(d: AbnahmeDaten): string {
  const erklaerung =
    d.ergebnis === "abgenommen"
      ? `Abgenommen ohne Vorbehalt von ${esc(d.name ?? "")} am ${esc(d.am)}.`
      : d.ergebnis === "vorbehalt"
        ? `Abgenommen unter Vorbehalt der unten genannten Mängel von ${esc(d.name ?? "")} am ${esc(d.am)}.`
        : `Gilt als abgenommen am ${esc(d.am)}: Die Abnahmefrist bis ${esc(d.frist ?? "")} ist abgelaufen, ohne dass ein Mangel genannt wurde (§ 640 Abs. 2 BGB).`;
  return druckSeite({
    titel: `Abnahmeprotokoll ${d.projekt}`,
    inhalt: `<div class="seite">${kopf()}<p class="leise mono">ABNAHMEPROTOKOLL · ${esc(d.datum)}</p>
<h1>Abnahme: ${esc(d.projekt)}</h1>
<p>${esc(d.an.name)}${d.domain ? ` · <span class="mono">${esc(d.domain)}</span>` : ""}</p>
<div class="box"><b>Erklärung</b><br>${erklaerung}</div>
${d.maengel?.trim() ? `<h2>Genannte Mängel</h2>${absaetze(d.maengel)}<p class="leise">Wir beheben die Mängel in angemessener Frist und melden uns mit einem Termin.</p>` : ""}
<h2>Geprüft vor der Bereitstellung</h2>
<table><thead><tr><th>Prüfpunkt</th><th style="width:22mm">Ergebnis</th><th>Detail</th></tr></thead><tbody>
${d.pruefung.map((x) => `<tr><td>${esc(x.name)}</td><td><span class="ampel ${x.ok ? "gruen" : "rot"}">${x.ok ? "OK" : "OFFEN"}</span></td><td>${esc(x.detail)}</td></tr>`).join("")}
</tbody></table>
<p class="leise">Mit der Abnahme wird die Schlusszahlung fällig und die Gewährleistungsfrist beginnt.</p>
${fuss()}</div>`,
  });
}

export function monatsreport(d: MonatsreportDaten): string {
  const verfuegbar = d.erreichbar.pruefungen ? (100 * (1 - d.erreichbar.ausfaelle / d.erreichbar.pruefungen)).toLocaleString("de-DE", { maximumFractionDigits: 2 }) : null;
  return druckSeite({
    titel: `Monatsreport ${d.monat}`,
    inhalt: `<div class="seite">${kopf()}<p class="leise mono">MONATSREPORT · ${esc(d.monat.toUpperCase())}</p>
<h1>${esc(d.an.name)}</h1>${d.domain ? `<p class="mono">${esc(d.domain)}</p>` : ""}
<table><thead><tr><th>Kennzahl</th><th class="zahl">${esc(d.monat)}</th><th class="zahl">Vormonat</th></tr></thead><tbody>
<tr><td>Anfragen über das Formular</td><td class="zahl">${d.anfragen}</td><td class="zahl">${d.anfragenVormonat}</td></tr>
<tr><td>Erreichbarkeit der Website</td><td class="zahl">${verfuegbar ? `${verfuegbar} %` : "–"}</td><td class="zahl"></td></tr>
</tbody></table>
${d.hinweise.length ? `<h2>Gut zu wissen</h2><ul>${d.hinweise.map((h) => `<li>${esc(h)}</li>`).join("")}</ul>` : ""}
<p class="leise">Anrufe über „Klick zum Anruf“ zählen wir, sobald die Messung eingerichtet ist. Alle Anfragen sehen Sie jederzeit in Ihrem Kundenportal.</p>
${fuss()}</div>`,
  });
}

export type UmzugsanleitungDaten = { an: Anschrift; datum: string; domain: string; ip: string; anbieter: string | null; mailAnbieter: string | null; mitMail: boolean; cloudflare: boolean };

export function umzugsanleitung(d: UmzugsanleitungDaten): string {
  const wo = d.anbieter ?? "Ihrem Domain-Anbieter";
  return druckSeite({
    titel: `Anleitung Domain-Umstellung ${d.domain}`,
    inhalt: `<div class="seite">${kopf()}<p class="leise mono">ANLEITUNG · ${esc(d.datum)}</p>
<h1>So erscheint Ihre neue Website unter ${esc(d.domain)}</h1>
<p>Sie bleiben Inhaber Ihrer Domain. Es ändern sich nur zwei Einträge, die festlegen, wo die Website liegt.${d.mitMail ? ` Ihre E-Mail${d.mailAnbieter ? ` (${esc(d.mailAnbieter)})` : ""} bleibt davon unberührt.` : ""}</p>
<h2>1. Bei ${esc(wo)} anmelden</h2>
<p>Dort zu „Domains“, dann bei <b class="mono">${esc(d.domain)}</b> zu „DNS“ oder „DNS-Einstellungen“.</p>
<h2>2. Diese zwei Einträge ändern</h2>
<table><thead><tr><th>Typ</th><th>Name / Host</th><th>Wert / Ziel</th></tr></thead><tbody>
<tr><td class="mono">A</td><td class="mono">@ (leer bzw. ${esc(d.domain)})</td><td class="mono">${esc(d.ip)}</td></tr>
<tr><td class="mono">A</td><td class="mono">www</td><td class="mono">${esc(d.ip)}</td></tr>
</tbody></table>
<p class="leise">Gibt es für „www“ einen CNAME-Eintrag, diesen löschen und den A-Eintrag oben anlegen. Gibt es AAAA-Einträge für @ oder www, diese löschen.${d.cloudflare ? " Bei Cloudflare: Proxy-Status auf „Nur DNS“ (graue Wolke) stellen." : ""}</p>
<div class="box"><b>Bitte nicht ändern</b><br>MX-, TXT-, SRV- und alle anderen Einträge bleiben, wie sie sind. Sie sorgen für Ihre E-Mail und für Bestätigungen bei Google oder Microsoft.</div>
<h2>3. Fertig</h2>
<p>Die Umstellung greift meist innerhalb einer Stunde, spätestens nach 24 Stunden. Wir prüfen das automatisch und melden uns, sobald Ihre neue Seite erscheint. Das Zertifikat für die sichere Verbindung (https) richten wir ein.</p>
<div class="box"><b>Altes Paket erst später kündigen</b><br>Bitte kündigen Sie Ihr bisheriges Webhosting erst nach unserer Nachricht und dann nur das Webhosting, nicht die Domain und nicht Ihre E-Mail-Postfächer.</div>
<p>Lieber gemeinsam? Rufen Sie uns an: ${esc(marke.absender.telefon)}. Wir machen das in 10 Minuten am Telefon mit Ihnen.</p>
${fuss()}</div>`,
  });
}
