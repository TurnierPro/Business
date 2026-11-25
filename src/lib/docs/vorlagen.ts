import { marke } from "../marke";
import { NICHT_ENTHALTEN, PAKETE, PaketKey, euro, UST } from "../pakete";
import { ABNAHME_FRIST_TAGE, AENDERUNG_STUNDENSATZ, AGB_URL, AGB_VERSION, DATENPANNE_MELDUNG_STUNDEN, ERSTATTUNG_WOCHEN, ERSTE_RATE_FAELLIG_TAGE, PILOT_BINDUNG_MONATE, UNTERAUFTRAG_WIDERSPRUCH_TAGE, VORABANKUENDIGUNG_TAGE, HAFTUNG_JE_FALL, HAFTUNG_JE_JAHR, KUENDIGUNG_MONATE_VOR_ENDE, LAUFZEIT_MONATE, VERFUEGBARKEIT_PROZENT, VERLAENGERUNG_MONATE } from "../recht";
import { laufzeitSumme } from "../katalog";
import { ANGEBOT_VORLAGE, fuelle, type AngebotVorlage } from "../angebot-vorlage";
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

// Alle Druckvorlagen. Jede Vorlage bekommt nur Daten und liefert fertiges HTML im Levarex-Design.

export type BriefDaten = { an: Anschrift; betreff: string; text: string; datum: string; demoUrl?: string; qr?: string; quelle?: string };
export type AngebotDaten = {
  vorlage?: AngebotVorlage;
  an: Anschrift;
  nummer: string;
  datum: string;
  paket: PaketKey;
  einleitung: string;
  einmalig: number;
  monatlich: number;
  positionen?: { text: string; einmalig: number; monatlich: number; hinweis?: string }[];
  zahlweg?: "ueberweisung";
  anmerkungen?: string;
  agbVersion?: string;
  // Beim Erstellen eingefroren (ältere Angebote haben das noch nicht, dann gilt der Katalog)
  paketName?: string;
  paketInhalt?: string[];
  nichtEnthalten?: string[];
  wochen?: number;
  paketProblem?: string;
  // Gebuchte Module und Zusatzmodule mit Problem und fünf Punkten, eingefroren
  bausteine?: { name: string; problem?: string; punkte: string[] }[];
  mitKi?: boolean;
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
  /** aufnahme = Audio, mitschrift = Text (z. B. Meeting-Zusammenfassung aus Claude) */
  quelle?: "aufnahme" | "mitschrift";
  /** Ziele oder Probleme fehlen (keine KI-Auswertung): darf so nicht raus */
  unvollstaendig?: boolean;
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
  annahme: { name: string; am: string; agbVersion: string; unternehmer: boolean; kanal?: "tablet" | "portal" };
  zahlweg: "ueberweisung";
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
  return { name: d.paketName ?? k?.name ?? d.paket, problem: d.paketProblem ?? k?.problem, inhalt: d.paketInhalt ?? k?.inhalt ?? [], wochen: d.wochen ?? k?.wochen ?? 6, nicht: d.nichtEnthalten ?? NICHT_ENTHALTEN[d.paket] ?? [] };
}

/** „22.11.2026“ → Date (12 Uhr, damit keine Zeitzone den Tag verschiebt). Unlesbar: heute. */
function ausDatumDe(s: string): Date {
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s?.trim() ?? "");
  return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 12) : new Date();
}

export function angebot(d: AngebotDaten): string {
  const p = paketFuer(d);
  const ust = Math.round(d.einmalig * UST);
  // Vorlage aus dem Angebot (eingefroren); ältere Angebote ohne Vorlage nutzen die aktuelle
  const v = d.vorlage ?? ANGEBOT_VORLAGE;
  const platz = { wochen: String(p.wochen), erste_rate_tage: String(ERSTE_RATE_FAELLIG_TAGE), stundensatz: euro(AENDERUNG_STUNDENSATZ), laufzeit: String(LAUFZEIT_MONATE) };
  return druckSeite({
    titel: `Angebot ${d.nummer}`,
    extraCss: dinCss,
    inhalt: `<div class="seite din">${falzmarken}${kopf()}${anschriftfeld(d.an)}
<div class="infoblock">Angebot<br><b class="mono">${esc(d.nummer)}</b><br><br>Datum<br><b class="mono">${esc(d.datum)}</b><br><br>Gültig bis<br><b class="mono">${esc(datumDe(new Date(ausDatumDe(d.datum).getTime() + v.gueltigTage * 864e5)))}</b></div>
<div class="briefkoerper"><h1>Angebot: ${esc(p.name)}${d.bausteine?.length ? ` und ${d.bausteine.length === 1 ? "ein weiterer Baustein" : `${d.bausteine.length} weitere Bausteine`}` : ""}</h1>${absaetze(d.einleitung)}
<div class="box"><b>Ihre zwei Zahlen</b><br>Einmalig <b class="mono">${euro(d.einmalig)}</b> netto · Monatsbeitrag <b class="mono">${euro(d.monatlich)}</b> netto<br><span class="leise">Gesamt über ${LAUFZEIT_MONATE} Monate ${euro(laufzeitSumme(d.einmalig, d.monatlich).gesamt)} netto, im Schnitt ${euro(laufzeitSumme(d.einmalig, d.monatlich).schnitt)} im Monat. Details auf der nächsten Seite.</span></div>
<p>Die Leistungsbeschreibung mit allen Bausteinen finden Sie in Anlage 1.</p>
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
<tr><td>Gesamt über ${LAUFZEIT_MONATE} Monate, netto</td><td class="zahl" colspan="2">${euro(laufzeitSumme(d.einmalig, d.monatlich).gesamt)} · Ø ${euro(laufzeitSumme(d.einmalig, d.monatlich).schnitt)} im Monat</td></tr>
</tbody></table>
<p class="leise" style="font-size:8.5pt">Der Monatsbeitrag bezahlt Hosting, Wartung, Sicherheit, Rechtstexte und Änderungen im vereinbarten Umfang. Laufzeit ${LAUFZEIT_MONATE} Monate ab Livegang, danach jeweils ${VERLAENGERUNG_MONATE} Monate; Kündigung ${KUENDIGUNG_MONATE_VOR_ENDE} Monate vor Ende in Textform. Später gebuchte Module laufen ${LAUFZEIT_MONATE} Monate ab ihrem Livegang.</p>
${d.anmerkungen?.trim() ? `<h2>Anmerkungen</h2>${absaetze(d.anmerkungen)}` : ""}
<h2>So läuft es ab</h2>
<ul>${v.ablauf.map((x) => `<li>${esc(fuelle(x, platz))}</li>`).join("")}</ul>
<div class="box"><b>Allgemeine Geschäftsbedingungen</b><br>Es gelten unsere AGB für Unternehmer, Version ${esc(d.agbVersion ?? AGB_VERSION)}, abrufbar unter <span class="mono">${esc(AGB_URL)}</span>. Dieses Angebot richtet sich nur an Unternehmer (§ 14 BGB). Mit der Annahme bestätigen Sie, dass Sie für Ihren Betrieb handeln und nicht als Verbraucher.</div>
<div class="box"><b>Unterschreiben</b><br><span class="leise">${esc(fuelle(v.unterschreiben, platz))}</span></div>
${fuss()}</div>
${leistungsbeschreibung(d)}`,
  });
}

/** Anlage zum Angebot: was geschuldet ist, was nicht, wann abgenommen wird, was der Kunde beiträgt. */
function leistungsbeschreibung(d: AngebotDaten): string {
  const p = paketFuer(d);
  const extra = d.bausteine ? [] : (d.positionen ?? []).slice(1).map((x) => x.text);
  const mitKi = d.mitKi ?? extra.some((t) => /modul|assistent|ki|marketing|kundenmanagement/i.test(t));
  const baustein = (name: string, problem: string | undefined, punkte: string[]) =>
    `<h3>${esc(name)}</h3>${problem ? `<p><b>Das Problem:</b> ${esc(problem)}</p><p><b>Wir lösen das mit …</b></p>` : ""}<ul>${punkte.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;
  return `<div class="seite">${kopf()}
<p class="leise mono">ANLAGE 1 ZUM ANGEBOT ${esc(d.nummer)}</p>
<h1>Leistungsbeschreibung</h1>
<h2>Enthalten</h2>
${baustein(p.name, p.problem, [...p.inhalt, ...extra])}
${(d.bausteine ?? []).map((b) => baustein(b.name, b.problem, b.punkte)).join("")}
<h2>Nicht enthalten</h2><p>${esc(p.nicht.join(", "))}. Größere Vorhaben bieten wir gern gesondert an.</p>
<h2>Abnahme</h2>
<p>Wenn die Website fertig ist, zeigen wir Ihnen die Fertigstellung an, stellen sie Ihnen als Vorschau bereit und bitten um Abnahme. Online geht sie erst nach der Abnahme. Sie haben ${ABNAHME_FRIST_TAGE} Kalendertage Zeit: abnehmen, unter Vorbehalt mit Mängeln abnehmen oder mit Begründung verweigern. Melden Sie sich in der Frist nicht und nennen keinen Mangel, gilt die Website als abgenommen (§ 640 Abs. 2 BGB). Mängel beheben wir in angemessener Frist.</p>
<p>Abnahmekriterien: Seiten und Funktionen wie oben, Formulare kommen an, Darstellung auf Handy und Computer, Lighthouse ≥ 95, technische Barrierefreiheit nach WCAG 2.2 AA, Rechtstexte eingebunden.</p>
<h2>Ihre Mitwirkung</h2>
<ul><li>Texte, Fotos und Logo schicken Sie uns nach unserer Mitwirkungsliste. Den Eingang der vollständigen Inhalte bestätigen wir binnen 2 Werktagen; damit beginnt die Lieferfrist von ${p.wochen} Wochen.</li>
<li>Bestehende Domain: Sie bleiben Inhaber. Sie ändern nach unserer Anleitung zwei Einträge (oder geben uns den Auth-Code); E-Mail und andere Dienste bleiben unberührt. Das alte Webhosting kündigen Sie erst nach unserer Nachricht.</li>
<li>Rechte an Texten, Fotos und Logo, auch an Inhalten der bisherigen Website.</li>
<li>Barrierefreiheit: Wir schulden die technische Umsetzung. Für Inhalte, die Sie später selbst einstellen (z. B. Bildbeschreibungen), sind Sie verantwortlich.</li></ul>
${mitKi ? "<h2>Bausteine mit KI</h2><p>Geschuldet ist die vereinbarte Funktion des Ablaufs, nicht die inhaltliche Richtigkeit jeder einzelnen KI-Ausgabe. Was nach außen geht, prüft und gibt ein Mensch in Ihrem Betrieb frei.</p>" : ""}
<h2>Datenschutz</h2><p>Für Hosting und Formulare verarbeiten wir personenbezogene Daten in Ihrem Auftrag. Dazu schließen wir vor dem Livegang einen Vertrag zur Auftragsverarbeitung (Art. 28 DSGVO). Wo die Daten liegen, steht in der Liste der Unterauftragsverarbeiter in diesem Vertrag.</p>
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
<p class="ki-hinweis">Hinweis: Dieser Bericht wurde mit Unterstützung von KI erstellt und von Levarex geprüft (Art. 50 KI-Verordnung). Grundlage ist eine automatische Prüfung der öffentlich erreichbaren Startseite am ${esc(d.datum)}.</p>
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
<div class="box">Aufnahme nur mit Einwilligung. In Levarex OS vor dem Start bestätigen lassen.</div>${fuss()}</div>`,
  });
}

export function protokoll(d: ProtokollDaten): string {
  const liste = (l: string[]) => `<ul>${l.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;
  return druckSeite({
    titel: `Gesprächsprotokoll ${d.an.name}`,
    inhalt: `<div class="seite">${kopf()}<p class="leise mono">GESPRÄCH VOR ORT · ${esc(d.datum)}</p>
<h1>Protokoll und Maßnahmenplan</h1><p>${esc(d.an.name)}${d.an.inhaber ? `, ${esc(d.an.inhaber)}` : ""}</p>
${d.ziele.length ? `<h2>Ihre Ziele</h2>${liste(d.ziele)}` : ""}
${d.probleme.length ? `<h2>Was heute bremst</h2>${liste(d.probleme)}` : ""}
<h2>Unsere Empfehlung: ${esc(PAKETE[d.empfehlung.paket].name)}</h2><p>${esc(d.empfehlung.begruendung)}</p>
${fuss()}</div>
<div class="seite">${kopf()}
<h2 style="margin-top:0">Maßnahmenplan</h2>
<table><thead><tr><th>Was</th><th style="width:34mm">Wann</th><th style="width:30mm">Wer</th></tr></thead><tbody>
${d.massnahmen.map((m) => `<tr><td>${esc(m.was)}</td><td>${esc(m.wann)}</td><td>${esc(m.wer)}</td></tr>`).join("")}
</tbody></table>
${d.offeneFragen.length ? `<h2>Noch offen</h2>${liste(d.offeneFragen)}` : ""}
<p class="ki-hinweis">${d.quelle === "mitschrift" ? "Dieses Protokoll wurde aus unserer Gesprächsnotiz mit Unterstützung von KI erstellt und von Levarex geprüft. Die Notiz wird nach Freigabe gelöscht." : "Dieses Protokoll wurde aus der Gesprächsaufnahme mit Unterstützung von KI erstellt und von Levarex geprüft. Die Aufnahme wird nach Freigabe gelöscht."}</p>
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
<div class="box"><b>Annahme</b><br>Angenommen von ${esc(d.annahme.name)} am ${esc(am)} Uhr${d.annahme.kanal === "tablet" ? " mit Unterschrift beim Termin" : d.annahme.kanal === "portal" ? " im Kundenportal" : ""}.<br>Grundlage: unsere AGB für Unternehmer, Version ${esc(d.annahme.agbVersion)}.${d.annahme.unternehmer ? " Bestätigt: Der Auftrag wird für den Betrieb erteilt, nicht als Verbraucher (§ 14 BGB)." : ""}</div>
<h2>Wie es weitergeht</h2><ul>
<li>Mit dieser Bestätigung beginnen wir mit der Ausführung. Die Rechnung über die erste Rate (50 %) kommt per E-Mail, fällig ${ERSTE_RATE_FAELLIG_TAGE} Tage nach Vertragsschluss.</li>
<li>Danach laden Sie Texte, Fotos und Logo im Kundenportal hoch.</li>
<li>Die restlichen 50 % werden beim Livegang nach Ihrer Abnahme fällig.</li></ul>
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

// ---------- Vertragswerk: Rahmenvertrag und Leistungsscheine (Unterschrift auf dem Tablet beim Termin) ----------

export type VertragUnterschrift = { rolle: "kunde" | "levarex"; name: string; funktion?: string | null; bild: string; am: string };
type VertragBasis = { an: Anschrift; nummer: string; angebotNummer: string; datum: string; vertragswerk: string; agbVersion: string; unterschriften?: VertragUnterschrift[] };
export type RahmenvertragDaten = VertragBasis & {
  positionen: { text: string; einmalig: number; monatlich: number }[];
  einmalig: number;
  monatlich: number;
  scheine: { nummer: string; titel: string }[];
};
export type LeistungsscheinDaten = VertragBasis & {
  rahmenNummer: string;
  art: "erstellung" | "betrieb";
  baustein: string;
  problem?: string;
  punkte: string[];
  preis: number; // einmalig (Erstellung) bzw. monatlich (Betrieb), netto in Cent
  wochen?: number;
  aenderungsMinuten?: number;
  // Interne Kalkulation (§ 648 BGB), erscheint nicht im PDF
  kalkulation?: { stunden: number; stundensatz: number };
};

const BILD_OK = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/;

function unterschriftsblock(u: VertragUnterschrift[] | undefined): string {
  const feld = (rolle: "kunde" | "levarex", titel: string) => {
    const x = u?.find((y) => y.rolle === rolle);
    const am = x ? new Date(x.am).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" }) : "";
    return `<div class="unterschrift"><div class="linie">${x && BILD_OK.test(x.bild) ? `<img src="${x.bild}" alt="Unterschrift ${esc(x.name)}">` : ""}</div><div>${esc(titel)}</div><div class="leise">${x ? `${esc(x.name)}${x.funktion ? `, ${esc(x.funktion)}` : ""} · ${esc(am)} Uhr` : "Name, Datum"}</div></div>`;
  };
  return `<div class="unterschriften">${feld("kunde", "Für den Auftraggeber")}${feld("levarex", `Für ${marke.absender.firma}`)}</div>`;
}

const vertragCss = `.unterschriften{display:grid;grid-template-columns:1fr 1fr;gap:12mm;margin-top:10mm;break-inside:avoid}
.unterschrift{font-size:9pt}.unterschrift .linie{height:20mm;border-bottom:.3mm solid ${marke.hell.text};display:flex;align-items:flex-end}
.unterschrift img{max-height:19mm;max-width:100%}
.paragraf{break-inside:avoid}.paragraf h3{margin-top:4mm}`;

function vertragsKopf(d: VertragBasis, art: string): string {
  const a = marke.absender;
  return `<p class="leise mono">${esc(art)} · ${esc(d.nummer)} · ZU ANGEBOT ${esc(d.angebotNummer)}</p>
<p><b>Zwischen</b> ${esc(a.firma)}, Sitz ${esc(a.sitz)}, vertreten durch die Geschäftsführer ${esc(a.geschaeftsfuehrer)} („Levarex“),<br><b>und</b> ${esc(d.an.name)}, ${esc(d.an.strasse ?? "")}, ${esc(d.an.plz ?? "")} ${esc(d.an.ort ?? "")} („Auftraggeber“).</p>`;
}

export function rahmenvertrag(d: RahmenvertragDaten): string {
  const p = (nr: number, titel: string, text: string) => `<div class="paragraf"><h3>§ ${nr} ${esc(titel)}</h3>${text}</div>`;
  return druckSeite({
    titel: `Rahmenvertrag ${d.nummer}`,
    extraCss: vertragCss,
    inhalt: `<div class="seite">${kopf()}<div class="fluss">
<h1>Rahmenvertrag</h1>
${vertragsKopf(d, "RAHMENVERTRAG")}
${p(1, "Gegenstand", `<p>Dieser Rahmenvertrag regelt die Zusammenarbeit. Die einzelnen Leistungen stehen in den Leistungsscheinen; jeder trägt eine eigene Unterschrift:</p><ul>${d.scheine.map((s) => `<li>${esc(s.titel)} (<span class="mono">${esc(s.nummer)}</span>)</li>`).join("")}</ul><p>Bei Widersprüchen gilt der Leistungsschein vor diesem Rahmenvertrag und dieser vor den AGB.</p>`)}
${p(2, "Vergütung", `<table><thead><tr><th>Leistung</th><th class="zahl">Einmalig netto</th><th class="zahl">Monatlich netto</th></tr></thead><tbody>${d.positionen.map((x) => `<tr><td>${esc(x.text)}</td><td class="zahl">${x.einmalig ? euro(x.einmalig) : "–"}</td><td class="zahl">${x.monatlich ? euro(x.monatlich) : "–"}</td></tr>`).join("")}<tr><td><b>Summe netto</b></td><td class="zahl"><b>${euro(d.einmalig)}</b></td><td class="zahl"><b>${euro(d.monatlich)}</b></td></tr></tbody></table>
<p>Alle Preise zuzüglich Umsatzsteuer. Einmalige Preise: 50 % bei Unterschrift, fällig ${ERSTE_RATE_FAELLIG_TAGE} Tage nach Vertragsschluss und nicht vor Arbeitsbeginn; 50 % beim Livegang nach der Abnahme. Keine Ratenzahlung. Monatsbeiträge per SEPA-Lastschrift mit Vorabankündigung 5 Kalendertage vor dem Einzug; bis der Einzug eingerichtet ist, per Überweisung.</p>`)}
${p(3, "Laufzeit und Kündigung", `<p>Leistungen mit Monatsbeitrag laufen ${LAUFZEIT_MONATE} Monate ab dem Livegang des jeweiligen Bausteins und verlängern sich danach um jeweils ${VERLAENGERUNG_MONATE} Monate, wenn nicht ${KUENDIGUNG_MONATE_VOR_ENDE} Monate vor Ende in Textform gekündigt wird. Später gebuchte Module laufen ${LAUFZEIT_MONATE} Monate ab ihrem Livegang. Personal & Bewerbung endet mit dem Webauftritt. Preisanpassungen nur zur Verlängerung nach dem Verbraucherpreisindex, höchstens 10 %, mit Mitteilung 4 Monate vorher und Sonderkündigungsrecht.</p>`)}
${p(4, "Abnahme", `<p>Levarex zeigt die Fertigstellung an und stellt das Ergebnis als Vorschau bereit. Der Auftraggeber hat ${ABNAHME_FRIST_TAGE} Kalendertage Zeit, abzunehmen oder Mängel zu nennen. Nennt er in dieser Frist keinen Mangel, gilt die Leistung als abgenommen (§ 640 Abs. 2 BGB). Der Livegang erfolgt erst nach der Abnahme. Änderungen vor der Abnahme und über das monatliche Kontingent hinaus kosten ${euro(AENDERUNG_STUNDENSATZ)} netto je Stunde, nur nach Freigabe in Textform.</p>`)}
${p(5, "Rechte", `<p>Die Domain gehört dem Auftraggeber; den Auth-Code hält Levarex nie zurück. Texte und Fotos gehören dem Auftraggeber ab Zahlung, Code und Design nach ${LAUFZEIT_MONATE} Monaten. Endet der Vertrag vorzeitig, kann der Auftraggeber Code und Design gegen 50 % der restlichen Webauftritt-Beiträge ablösen.</p>`)}
${p(6, "Service-Level und Haftung", `<p>Verfügbarkeit ${VERFUEGBARKEIT_PROZENT.toLocaleString("de-DE")} % im Monat; bei Unterschreitung Gutschrift von 10 % bzw. 25 % des Monatsbeitrags nach Leistungsschein. Bei leichter Fahrlässigkeit haftet Levarex bis ${euro(HAFTUNG_JE_FALL)} je Fall und ${euro(HAFTUNG_JE_JAHR)} je Vertragsjahr; bei Vorsatz, grober Fahrlässigkeit und Verletzung von Leben, Körper oder Gesundheit unbeschränkt.</p>`)}
${p(7, "Datenschutz", `<p>Soweit Levarex personenbezogene Daten im Auftrag verarbeitet, schließen die Parteien vor dem Livegang einen Vertrag zur Auftragsverarbeitung (Art. 28 DSGVO).</p>`)}
${p(8, "Schlussbestimmungen", `<p>Es gelten die AGB für Unternehmer, Version ${esc(d.agbVersion)}, abrufbar unter <span class="mono">${esc(AGB_URL)}</span>. Der Auftraggeber handelt als Unternehmer (§ 14 BGB). Änderungen bedürfen der Textform.</p>`)}
${unterschriftsblock(d.unterschriften)}
<p class="leise" style="font-size:7.5pt;margin-top:6mm">Fassung: ${esc(d.vertragswerk)}</p>
</div>${fuss()}</div>`,
  });
}

export function leistungsschein(d: LeistungsscheinDaten): string {
  const erstellung = d.art === "erstellung";
  return druckSeite({
    titel: `Leistungsschein ${d.nummer}`,
    extraCss: vertragCss,
    inhalt: `<div class="seite">${kopf()}<div class="fluss">
<h1>Leistungsschein ${erstellung ? "Erstellung" : "Betrieb"}: ${esc(d.baustein)}</h1>
${vertragsKopf(d, erstellung ? "LEISTUNGSSCHEIN ERSTELLUNG" : "LEISTUNGSSCHEIN BETRIEB")}
<p>Zum Rahmenvertrag <span class="mono">${esc(d.rahmenNummer)}</span>. ${erstellung ? "Werkvertrag über die einmalige Erstellung (§ 631 BGB)." : "Laufende Leistungen nach dem Livegang gegen Monatsbeitrag."}</p>
${d.problem ? `<h2>Das Problem</h2><p>${esc(d.problem)}</p>` : ""}
<h2>${erstellung ? "Wir lösen das mit …" : "Laufende Leistungen"}</h2><ul>${d.punkte.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
<h2>Preis</h2>
<p><b class="mono">${euro(d.preis)}</b> netto ${erstellung ? "einmalig, zahlbar je zur Hälfte bei Unterschrift und beim Livegang nach der Abnahme" : "im Monat (Monatsbeitrag), per SEPA-Lastschrift"}.</p>
${erstellung
    ? `<h2>Lieferung und Abnahme</h2><p>${d.wochen ? `Online ${d.wochen} Wochen nach Erhalt der vollständigen Inhalte; den Eingang bestätigt Levarex binnen 2 Werktagen. Klappt das nicht, ist ein Monatsbeitrag kostenlos. ` : ""}Abnahme nach § 4 des Rahmenvertrags (Abnahmefiktion nach ${ABNAHME_FRIST_TAGE} Kalendertagen).</p>`
    : `<h2>Laufzeit</h2><p>${LAUFZEIT_MONATE} Monate ab Livegang, danach jeweils ${VERLAENGERUNG_MONATE} Monate; Kündigung ${KUENDIGUNG_MONATE_VOR_ENDE} Monate vor Ende in Textform.${d.aenderungsMinuten ? ` Enthalten sind ${d.aenderungsMinuten} Minuten Änderungen im Monat; darüber ${euro(AENDERUNG_STUNDENSATZ)} je Stunde nach Freigabe.` : ""} Service-Level nach § 6 des Rahmenvertrags.</p>`}
${unterschriftsblock(d.unterschriften)}
<p class="leise" style="font-size:7.5pt;margin-top:6mm">Fassung: ${esc(d.vertragswerk)}</p>
</div>${fuss()}</div>`,
  });
}

// ---------- SEPA-Lastschriftmandat (Basislastschrift) für die Monatsbeiträge ----------

export type SepaMandatDaten = {
  an: Anschrift;
  nummer: string; // Mandatsreferenz
  datum: string;
  glaeubigerId: string;
  angebotId: number;
  konto: { inhaber: string; iban: string; bic: string | null };
  ort: string | null;
  kanal?: "tablet" | "portal";
  unterschriften?: VertragUnterschrift[];
  ersetztAm?: string;
  ersetztDurch?: string;
};

export function sepaMandat(d: SepaMandatDaten): string {
  const a = marke.absender;
  const u = d.unterschriften?.find((x) => x.rolle === "kunde");
  const am = u ? new Date(u.am).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" }) : "";
  const zeile = (k: string, v: string, mono = false) => `<tr><th style="width:42%">${esc(k)}</th><td${mono ? ' class="mono"' : ""}>${v}</td></tr>`;
  return druckSeite({
    titel: `SEPA-Lastschriftmandat ${d.nummer}`,
    extraCss: vertragCss + `.mandat th{font-weight:400;color:${marke.hell.textLeise};text-align:left}`,
    inhalt: `<div class="seite">${kopf()}<div class="fluss">
<h1>SEPA-Lastschriftmandat</h1>
<p class="leise mono">SEPA-BASISLASTSCHRIFT · WIEDERKEHRENDE ZAHLUNG${d.ersetztAm ? ` · ERSETZT DURCH ${esc(d.ersetztDurch ?? "")}` : ""}</p>
<table class="mandat"><tbody>
${zeile("Zahlungsempfänger", `${esc(a.firma)}, ${esc(a.strasse)}, ${esc(a.ort)}`)}
${zeile("Gläubiger-Identifikationsnummer", d.glaeubigerId ? esc(d.glaeubigerId) : "wird mit der ersten Vorabankündigung mitgeteilt", !!d.glaeubigerId)}
${zeile("Mandatsreferenz", esc(d.nummer), true)}
</tbody></table>
<p>Ich ermächtige / Wir ermächtigen ${esc(a.firma)}, Zahlungen von meinem / unserem Konto mittels Lastschrift einzuziehen. Zugleich weise ich mein / weisen wir unser Kreditinstitut an, die von ${esc(a.firma)} auf mein / unser Konto gezogenen Lastschriften einzulösen.</p>
<p><b>Hinweis:</b> Ich kann / Wir können innerhalb von ${ERSTATTUNG_WOCHEN} Wochen, beginnend mit dem Belastungsdatum, die Erstattung des belasteten Betrages verlangen. Es gelten dabei die mit meinem / unserem Kreditinstitut vereinbarten Bedingungen.</p>
<p>Eingezogen werden die Monatsbeiträge laut Rahmenvertrag und Leistungsscheinen sowie fällige Rechnungen aus diesem Vertrag. Jeden Einzug kündigt ${esc(a.firma)} spätestens ${VORABANKUENDIGUNG_TAGE} Kalendertage vorher mit Betrag und Datum an.</p>
<h2>Zahlungspflichtiger</h2>
<table class="mandat"><tbody>
${zeile("Kontoinhaber", esc(d.konto.inhaber))}
${zeile("Betrieb und Anschrift", `${esc(d.an.name)}, ${esc(d.an.strasse ?? "")}, ${esc(d.an.plz ?? "")} ${esc(d.an.ort ?? "")}`)}
${zeile("IBAN", esc(d.konto.iban.replace(/(.{4})/g, "$1 ").trim()), true)}
${zeile("BIC", d.konto.bic ? esc(d.konto.bic) : "–", true)}
</tbody></table>
<div class="unterschriften" style="grid-template-columns:1fr 1fr">
<div class="unterschrift"><div class="linie" style="align-items:flex-end">${esc(d.ort ?? "")}${d.ort ? ", " : ""}${esc(u ? new Date(u.am).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" }) : d.datum)}</div><div>Ort, Datum</div></div>
<div class="unterschrift"><div class="linie">${u && BILD_OK.test(u.bild) ? `<img src="${u.bild}" alt="Unterschrift ${esc(u.name)}">` : ""}</div><div>Unterschrift Kontoinhaber bzw. Vertretung</div><div class="leise">${u ? `${esc(u.name)} · ${esc(am)} Uhr` : "Name"}</div></div>
</div>
</div>${fuss()}</div>`,
  });
}

// ---------- Vertrag zur Auftragsverarbeitung (Art. 28 DSGVO) ----------

export type AvVertragDaten = VertragBasis & {
  rahmenNummer: string;
  /** Gebuchte Bausteine, aus denen sich die Verarbeitung ergibt */
  bausteine: string[];
  kundenmanagement: boolean;
  /** Unterauftragsverarbeiter zum Zeitpunkt des Vertrags (eingefroren) */
  unterauftrag: { name: string; wofuer: string; sitz: string }[];
};

export function avVertrag(d: AvVertragDaten): string {
  const p = (nr: number, titel: string, text: string) => `<div class="paragraf"><h3>§ ${nr} ${esc(titel)}</h3>${text}</div>`;
  const daten = ["Anfragen über die Website (Name, Telefon, E-Mail, Nachricht, mitgeschickte Fotos)", ...(d.kundenmanagement ? ["Kundendaten im Kundenmanagement (Name, Anschrift, Telefon, E-Mail, Fahrzeuge oder Anlagen, Fälligkeiten, Termine, Angebote, Nachrichten über Telefon, WhatsApp und Website)"] : [])];
  return druckSeite({
    titel: `AV-Vertrag ${d.nummer}`,
    extraCss: vertragCss,
    inhalt: `<div class="seite">${kopf()}<div class="fluss">
<h1>Vertrag zur Auftragsverarbeitung</h1>
${vertragsKopf(d, "AV-VERTRAG NACH ART. 28 DSGVO")}
<p>Der Auftraggeber ist Verantwortlicher, Levarex ist Auftragsverarbeiter. Zum Rahmenvertrag <span class="mono">${esc(d.rahmenNummer)}</span>.</p>
${p(1, "Gegenstand und Dauer", `<p>Levarex verarbeitet personenbezogene Daten im Auftrag, soweit das für diese Bausteine nötig ist: ${d.bausteine.map(esc).join(", ")}. Der Vertrag läuft, solange Levarex für den Auftraggeber Daten verarbeitet.</p>`)}
${p(2, "Art der Daten und Betroffene", `<ul>${daten.map((x) => `<li>${esc(x)}</li>`).join("")}</ul><p>Betroffen sind Kunden, Interessenten und Ansprechpartner des Auftraggebers. Besondere Kategorien (z. B. Gesundheitsdaten) verarbeitet Levarex nicht.</p>`)}
${p(3, "Weisungen", `<p>Levarex verarbeitet die Daten nur auf dokumentierte Weisung des Auftraggebers; Weisungen erteilt er in Textform, auch über das Kundenportal. Hält Levarex eine Weisung für rechtswidrig, sagt Levarex das sofort.</p>`)}
${p(4, "Vertraulichkeit und Sicherheit", `<p>Alle Personen mit Zugang sind zur Vertraulichkeit verpflichtet. Levarex trifft die technischen und organisatorischen Maßnahmen nach Art. 32 DSGVO (Anlage: Liste der Maßnahmen), unter anderem Zwei-Faktor-Anmeldung, verschlüsselte Übertragung, tägliche Sicherung mit 30 Tagen Aufbewahrung, Protokoll aller Zugriffe und Trennung der Daten je Betrieb.</p>`)}
${p(5, "Unterauftragsverarbeiter", `<p>Der Auftraggeber stimmt diesen Unterauftragsverarbeitern zu:</p><table><thead><tr><th>Dienst</th><th>Wofür</th><th>Sitz</th></tr></thead><tbody>${d.unterauftrag.map((u) => `<tr><td>${esc(u.name)}</td><td>${esc(u.wofuer)}</td><td>${esc(u.sitz)}</td></tr>`).join("")}</tbody></table><p>Einen neuen Unterauftragsverarbeiter kündigt Levarex vorher in Textform an; der Auftraggeber kann binnen ${UNTERAUFTRAG_WIDERSPRUCH_TAGE} Tagen widersprechen.</p>`)}
${p(6, "Unterstützung und Meldungen", `<p>Levarex unterstützt den Auftraggeber bei Anfragen von Betroffenen (Auskunft, Berichtigung, Löschung, Datenübertragung) und bei Datenschutz-Folgenabschätzungen. Eine Verletzung des Schutzes personenbezogener Daten meldet Levarex dem Auftraggeber binnen ${DATENPANNE_MELDUNG_STUNDEN} Stunden nach Kenntnis.</p>`)}
${p(7, "Ende des Auftrags", `<p>Nach Ende der Verarbeitung gibt Levarex die Daten auf Wunsch in einem gängigen Format heraus und löscht sie danach, soweit keine gesetzliche Pflicht zur Aufbewahrung besteht. Der Auftraggeber kann seine Daten jederzeit im Kundenportal herunterladen.</p>`)}
${p(8, "Nachweise und Kontrollen", `<p>Levarex stellt alle nötigen Informationen zum Nachweis bereit und ermöglicht Überprüfungen nach Absprache. Es gilt deutsches Recht.</p>`)}
${unterschriftsblock(d.unterschriften)}
<p class="leise" style="font-size:7.5pt;margin-top:6mm">Fassung: ${esc(d.vertragswerk)}</p>
</div>${fuss()}</div>`,
  });
}

// ---------- Pilotvereinbarung Kundenmanagement ----------

export type PilotDaten = VertragBasis & { rahmenNummer: string; regulaer: number; pilot: number };

export function pilotvereinbarung(d: PilotDaten): string {
  const differenz = d.regulaer - d.pilot;
  return druckSeite({
    titel: `Pilotvereinbarung ${d.nummer}`,
    extraCss: vertragCss,
    inhalt: `<div class="seite">${kopf()}<div class="fluss">
<h1>Pilotvereinbarung Kundenmanagement</h1>
${vertragsKopf(d, "PILOTVEREINBARUNG")}
<p>Zum Rahmenvertrag <span class="mono">${esc(d.rahmenNummer)}</span>.</p>
<h2>Pilotpreis</h2>
<p>Der Auftraggeber gehört zu den ersten Betrieben mit dem Kundenmanagement. Die Einrichtung kostet statt <b class="mono">${euro(d.regulaer)}</b> nur <b class="mono">${euro(d.pilot)}</b> netto. Der Monatsbeitrag bleibt unverändert.</p>
<h2>Gegenleistung</h2>
<ul><li>Der Auftraggeber erlaubt Levarex, ihn als Referenz zu nennen (Name, Ort, Gewerk). Zitate und Fotos nur nach seiner Freigabe.</li><li>Levarex misst gemeinsam mit dem Auftraggeber, was das Kundenmanagement bringt (z. B. Termine, nachgefasste Angebote, gesparte Zeit), und darf die Ergebnisse ohne Kundendaten verwenden.</li><li>Jeder Ablauf läuft zuerst eine Testwoche im Entwurfsmodus.</li></ul>
<h2>Vorzeitige Kündigung</h2>
<p>Kündigt der Auftraggeber das Kundenmanagement in den ersten ${PILOT_BINDUNG_MONATE} Monaten ab Livegang ohne wichtigen Grund, zahlt er die Differenz von <b class="mono">${euro(differenz)}</b> netto anteilig nach: je fehlendem Monat bis zum ${PILOT_BINDUNG_MONATE}. Monat 1/${PILOT_BINDUNG_MONATE} der Differenz.</p>
${unterschriftsblock(d.unterschriften)}
<p class="leise" style="font-size:7.5pt;margin-top:6mm">Fassung: ${esc(d.vertragswerk)}</p>
</div>${fuss()}</div>`,
  });
}

// ---------- Vollmacht Domain-Umzug (Textform, erteilt im Kundenportal) ----------

export type DomainVollmachtDaten = { an: Anschrift; nummer: string; datum: string; domain: string; weg: "selbst" | "uebernehmen"; erteiltVon: string; erteiltAm: string; rechteBestaetigt: boolean };

export function domainVollmacht(d: DomainVollmachtDaten): string {
  const a = marke.absender;
  const am = new Date(d.erteiltAm).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" });
  return druckSeite({
    titel: `Vollmacht Domain-Umzug ${d.domain}`,
    extraCss: vertragCss,
    inhalt: `<div class="seite">${kopf()}<div class="fluss">
<h1>Auftrag und Vollmacht: Umzug der Website</h1>
<p class="leise mono">VOLLMACHT · ${esc(d.nummer)} · DOMAIN ${esc(d.domain)}</p>
<p><b>${esc(d.an.name)}</b>, ${esc(d.an.strasse ?? "")}, ${esc(d.an.plz ?? "")} ${esc(d.an.ort ?? "")} („Auftraggeber“) beauftragt ${esc(a.firma)}, die Website unter der Domain <b class="mono">${esc(d.domain)}</b> umzuziehen und dafür die nötigen Einstellungen vorzunehmen bzw. vorzubereiten.</p>
<h2>Umfang</h2>
${d.weg === "uebernehmen"
    ? `<ul><li>Levarex beantragt mit dem Auth-Code des Auftraggebers den Wechsel der Domain-Verwaltung und pflegt danach alle DNS-Einträge.</li><li>Vor dem Wechsel übernimmt Levarex alle bestehenden Einträge, damit E-Mail und Bestätigungen weiterlaufen.</li><li>Den Auth-Code bekommt der Auftraggeber jederzeit auf Wunsch zurück; Levarex hält ihn nie zurück.</li></ul>`
    : `<ul><li>Die Domain bleibt beim bisherigen Anbieter. Der Auftraggeber oder seine IT ändert die Einträge für die Website nach der Anleitung von Levarex; auf Wunsch gemeinsam am Telefon.</li><li>Levarex prüft die bestehenden Einträge und sichert die alte Website für Weiterleitungen.</li></ul>`}
<ul><li>Inhaber der Domain bleibt der Auftraggeber.</li><li>E-Mail-Einträge (MX) und Bestätigungs-Einträge bleiben unverändert.</li><li>Die Vollmacht endet mit dem Umzug oder mit Widerruf in Textform.</li></ul>
${d.rechteBestaetigt ? `<p>Der Auftraggeber hat bestätigt, dass er die übergebenen Texte, Fotos und das Logo verwenden darf.</p>` : ""}
<h2>Erteilt</h2>
<p>Im Kundenportal von ${esc(d.erteiltVon)} am ${esc(am)} Uhr (Textform, § 126b BGB).</p>
</div>${fuss()}</div>`,
  });
}

// ---------- Einwilligung in Fotos und Videos von Mitarbeitenden ----------

export const FOTO_ZWECKE: Record<string, string> = { website: "Website des Betriebs", karriere: "Karriereseite und Stellenanzeigen", social: "Instagram, Facebook und Google-Profil des Betriebs" };
export type FotoEinwilligungDaten = { an: Anschrift; nummer: string; datum: string; person: string; zwecke: string[]; video: boolean; unterschriften?: VertragUnterschrift[]; widerrufenAm?: string; widerrufenVon?: string };

export function fotoEinwilligung(d: FotoEinwilligungDaten): string {
  const a = marke.absender;
  const u = d.unterschriften?.find((x) => x.rolle === "kunde");
  const am = u ? new Date(u.am).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" }) : "";
  return druckSeite({
    titel: `Einwilligung Fotos ${d.person}`,
    extraCss: vertragCss,
    inhalt: `<div class="seite">${kopf()}<div class="fluss">
<h1>Einwilligung in Fotos${d.video ? " und Videos" : ""}</h1>
<p class="leise mono">EINWILLIGUNG · ${esc(d.nummer)}${d.widerrufenAm ? ` · WIDERRUFEN AM ${esc(new Date(d.widerrufenAm).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" }))}` : ""}</p>
<p>Ich, <b>${esc(d.person)}</b>, bin bei <b>${esc(d.an.name)}</b>, ${esc(d.an.ort ?? "")} tätig. Ich willige ein, dass Fotos${d.video ? " und Videos" : ""}, auf denen ich zu erkennen bin, für diese Zwecke verwendet werden:</p>
<ul>${d.zwecke.map((z) => `<li>${esc(FOTO_ZWECKE[z] ?? z)}</li>`).join("")}</ul>
<p>Verantwortlich ist mein Arbeitgeber, ${esc(d.an.name)}. ${esc(a.firma)} erstellt und pflegt die Inhalte in seinem Auftrag.</p>
<h2>Freiwillig und jederzeit widerrufbar</h2>
<p>Die Einwilligung ist freiwillig. Wer nicht einwilligt, hat im Arbeitsverhältnis keinen Nachteil (§ 26 Abs. 2 BDSG). Ich kann sie jederzeit ohne Angabe von Gründen für die Zukunft widerrufen, beim Arbeitgeber oder direkt bei ${esc(a.firma)} (${esc(a.email)}). Nach dem Widerruf werden die Fotos binnen 14 Tagen von der Website und aus den Profilen entfernt; bereits gedruckte Unterlagen und Beiträge Dritter lassen sich nicht zurückholen. Rechtsgrundlage: Art. 6 Abs. 1 lit. a und Art. 7 DSGVO, § 22 KUG.</p>
<div class="unterschriften" style="grid-template-columns:1fr 1fr">
<div class="unterschrift"><div class="linie">${esc(d.an.ort ?? "")}${d.an.ort ? ", " : ""}${esc(u ? new Date(u.am).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" }) : d.datum)}</div><div>Ort, Datum</div></div>
<div class="unterschrift"><div class="linie">${u && BILD_OK.test(u.bild) ? `<img src="${u.bild}" alt="Unterschrift ${esc(u.name)}">` : ""}</div><div>Unterschrift der abgebildeten Person</div><div class="leise">${u ? `${esc(u.name)} · ${esc(am)} Uhr` : "Name"}</div></div>
</div>
</div>${fuss()}</div>`,
  });
}
