import fs from "node:fs";
import path from "node:path";
import { druckSeite, esc, fuss, kopf, datumDe } from "../src/lib/docs/basis";
import { htmlZuPdf } from "../src/lib/docs/render";
import { marke } from "../src/lib/marke";
import { ABNAHME_FRIST_TAGE } from "../src/lib/recht";

// Erzeugt „Nexova OS: Ablauf, Datenstruktur, Konnektoren“ als PDF zum Durchsprechen und Challengen.
// Aufruf: npx tsx scripts/ablauf-pdf.ts [Zieldatei]

const t = marke.hell;
const ziel = process.argv[2] ?? path.join("docs", "nexova-os-ablauf.pdf");

const tabelle = (kopfzeile: string[], zeilen: string[][], breiten?: string[]) =>
  `<table>${breiten ? `<colgroup>${breiten.map((b) => `<col style="width:${b}">`).join("")}</colgroup>` : ""}<thead><tr>${kopfzeile.map((k) => `<th>${esc(k)}</th>`).join("")}</tr></thead><tbody>${zeilen
    .map((z) => `<tr>${z.map((x) => `<td>${x}</td>`).join("")}</tr>`)
    .join("")}</tbody></table>`;

const frage = (fragen: string[]) => `<div class="box frage"><b>Zum Challengen</b><ul>${fragen.map((f) => `<li>${esc(f)}</li>`).join("")}</ul></div>`;
const M = `<span class="mensch">Mensch</span>`;
const A = `<span class="auto">automatisch</span>`;

// Bild: Kanäle → Nachrichten → Betrieb/Aufgabe → Entwurf → Qualitätskontrolle → Freigabe → Versand
function bildNachrichten(): string {
  const box = (x: number, y: number, w: number, h: number, titel: string, unter: string, hervor = false) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2" fill="${hervor ? t.akzent : t.flaeche}" fill-opacity="${hervor ? 0.18 : 1}" stroke="${hervor ? t.akzent : t.linie}" stroke-width="0.8"/>` +
    `<text x="${x + w / 2}" y="${y + h / 2 - 1}" text-anchor="middle" font-size="9" font-weight="600" fill="${t.text}">${esc(titel)}</text>` +
    `<text x="${x + w / 2}" y="${y + h / 2 + 10}" text-anchor="middle" font-size="7" fill="${t.textLeise}">${esc(unter)}</text>`;
  const pfeil = (x1: number, y1: number, x2: number, y2: number) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${t.textLeise}" stroke-width="0.8" marker-end="url(#spitze)"/>`;
  const kanaele = ["E-Mail", "WhatsApp", "Telefon", "Portal", "Formular"];
  return `<svg viewBox="0 0 560 250" width="100%" xmlns="http://www.w3.org/2000/svg" font-family="Archivo, sans-serif">
<defs><marker id="spitze" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="${t.textLeise}"/></marker></defs>
${kanaele.map((k, i) => box(0, 8 + i * 46, 86, 34, k, i === 1 ? "Meta Cloud API" : i === 2 ? "Anlage, später Bot" : i === 0 ? "Outlook, Gmail" : i === 3 ? "Kundenportal" : "Kunden-Website")).join("")}
${kanaele.map((_, i) => pfeil(88, 25 + i * 46, 128, 125)).join("")}
${box(130, 100, 100, 50, "Nachrichten", "eine Tabelle, alle Kanäle", true)}
${pfeil(232, 125, 262, 125)}
${box(264, 100, 94, 50, "Zuordnung", "Betrieb, Kontakt, Aufgabe")}
${pfeil(311, 152, 311, 186)}
${box(264, 188, 94, 46, "Entwurf", "KI oder Bot, nie direkt")}
${pfeil(360, 211, 392, 211)}
${box(394, 188, 76, 46, "Prüfung", "Qualitätskontrolle")}
${pfeil(432, 186, 432, 152)}
${box(394, 100, 76, 50, "Freigabe", "durch Menschen", true)}
${pfeil(472, 125, 492, 125)}
${box(494, 100, 66, 50, "Versand", "Postausgang")}
<text x="311" y="40" text-anchor="middle" font-size="7.5" fill="${t.textLeise}">unbekannter Absender:</text>
<text x="311" y="51" text-anchor="middle" font-size="7.5" fill="${t.textLeise}">„Zu tun“ → Betrieb wählen</text>
${pfeil(311, 56, 311, 98)}
</svg>`;
}

const schritte: string[][] = [
  ["1", "Leads finden", `${A}: Wochenlauf sucht Betriebe im Raum Karlsruhe/Stuttgart, bewertet sie (Score) und speichert die Datenquelle (Art. 14 DSGVO).`, "Daniel stuft ein: „Interessant“ oder nicht"],
  ["2", "Online-Check, Demo, Brief", `${A}: Website-Check, Demo-Website (Zugangscode, nicht in Google, Löschung nach 60 Tagen), Akquise-Brief mit Hinweis auf Widerspruchsrecht.`, "Brief freigeben. Versand erst nach dem Notartermin"],
  ["3", "Besuch vor Ort", `${A}: 7 Tage nach dem Brief erscheint der Besuch unter „Zu tun“. Aufnahme nur mit Einwilligung, danach Transkription, Protokoll und Angebotsentwurf.`, "Daniel besucht, Einwilligung einholen"],
  ["4", "Angebot", `${A}: Angebot aus Katalog (Paket, Module, Zusätze), Preise und Leistungen werden eingefroren. Mail mit Link ins Kundenportal.`, "Angebot prüfen und freigeben"],
  ["5", "Auftrag und Anzahlung", `${A}: Annahme im Portal, Auftragsbestätigung, Anzahlungsrechnung (50 %). Arbeitsbeginn nach Zahlungseingang.`, "Rechnung freigeben; über 10.000 € brutto zwei Personen"],
  ["6", "Inhalte und Domain", `${A}: Start-Mail mit Upload-Link. Hat der Kunde schon eine Domain: Bestandsaufnahme, Anleitung zur Umstellung, Prüfung, Zertifikat.`, "Start-Mail und Anleitung freigeben"],
  ["7", "Bau und Prüfung", `${A}: Bau-Agent erstellt die Seite, Qualitätsprüfung (Ladezeit, Barrierefreiheit, Rechtstexte, Links).`, "Max prüft und gibt den Livegang frei"],
  ["8", "Abnahme und Schluss", `${A}: Bitte um Abnahme im Portal. Ohne Mängelanzeige gilt sie nach ${ABNAHME_FRIST_TAGE} Tagen als erteilt (§ 640 Abs. 2 BGB). Dann Schlussrechnung und Betreuungs-Abo.`, "Schlusszahlung und Abo freigeben"],
  ["9", "Betreuung", `${A}: Tickets mit Zeitkontingent, Monatsreport, Betreuungsrechnungen, Zahlungserinnerung und Mahnstufen, Kündigung und Vertragsende.`, "Jede Mail an den Kunden freigeben"],
];

const datenmodell: string[][] = [
  ["Betrieb", "Das Unternehmen (Lead, Interessent, Kunde) mit Status, Score, Zuständigem, Datenquelle", "Mittelpunkt: fast alles hängt hier dran"],
  ["Kontakt", "Ansprechpartner je Betrieb mit Rolle, Telefon, E-Mail", "Betrieb 1 : n Kontakte"],
  ["Nachricht (neu)", "Jede Nachricht über jeden Kanal: Kanal, Richtung, Absender, Inhalt, externe ID, Status", "Betrieb 1 : n; optional Kontakt, Ticket, Postausgang"],
  ["Aktivität", "Notiz, Anruf, Termin, Aufgabe mit Fälligkeit und Zuständigem", "Betrieb 1 : n; optional Projekt, Ticket"],
  ["Termin", "Gespräch vor Ort: Aufnahme (befristet), Transkript, Protokoll", "Betrieb 1 : n"],
  ["Angebot", "Paket, Positionen, eingefrorener Leistungsumfang, Status bis zur Anzahlung", "Betrieb 1 : n; wird zum Projekt"],
  ["Projekt", "Lieferung mit Checkliste, Inhalten, Domain, Abnahme, Betreuung", "Betrieb 1 : n; Projekt 1 : n Aufgaben, Zeiten"],
  ["Rechnung", "Nummer, Art (Anzahlung, Schluss, Betreuung), Beträge, Mahnstufe", "Betrieb und Projekt"],
  ["Ticket", "Änderungswunsch, Fehler oder Frage aus der Betreuung", "Betrieb 1 : n; Zeiten buchen"],
  ["Dokument", "PDF-Quelle (Brief, Angebot, Protokoll, Rechnung …); nach Versand eingefroren", "Betrieb, Projekt; Anhang im Postausgang"],
  ["Postausgang", "Alles, was rausgeht: Kanal, Text, Anhänge, Prüfergebnis, Freigaben", "die einzige Tür nach draußen"],
  ["Katalog, Soll-Werte", "Pakete, Module, Zusätze, Ziele je Monat (in den Stammdaten pflegbar)", "Vorgabe für Angebote und Finanzen"],
  ["Protokoll", "Wer hat wann was getan (Nachweis nach Art. 5 Abs. 2 DSGVO)", "3 Jahre"],
];

const konnektoren: string[][] = [
  ["E-Mail senden", "Microsoft 365 (Outlook), Google Workspace (Gmail), SMTP, Resend", "fertig, Simulator bis Zugangsdaten gesetzt"],
  ["E-Mail empfangen", "Outlook- oder Gmail-Auslöser in n8n → /api/v1/nachrichten", "Schnittstelle fertig, n8n-Ablauf einrichten"],
  ["WhatsApp", "WhatsApp Business Cloud API (Meta), Webhook mit Signaturprüfung", "fertig, nur Antworten im 24-Stunden-Fenster"],
  ["Telefon", "Telefonanlage (z. B. sipgate) → n8n → /api/v1/nachrichten", "Schnittstelle fertig"],
  ["Zahlungen", "Stripe (Anzahlung online, SEPA-Lastschrift für Betreuung)", "fertig, Testmodus möglich"],
  ["Buchhaltung", "lexoffice, sevDesk oder DATEV (mit Steuerberater klären)", "vorbereitet"],
  ["E-Signatur", "Docuseal (selbst betrieben)", "vorbereitet"],
  ["Briefversand", "Druck- und Versanddienst mit Sitz in Deutschland", "Anbieter offen"],
  ["KI", "Claude (Anthropic): Entwürfe, Protokolle, zweite Prüfung", "fertig, Simulator ohne Schlüssel"],
  ["Kalender", "Kalender-Abo (ICS) für Outlook, Google, Apple", "fertig"],
  ["Alles andere", "REST-Schnittstelle /api/v1 mit Schlüsseln und Rechten; n8n als Verbindungsstück", "fertig"],
];

const offen: string[][] = [
  ["Portal-Zugangsmails", "Darf die Mail „Ihr Zugang zum Kundenportal“ ohne Freigabe raus? Sie enthält nur einen Link an eine bereits bekannte Adresse.", "Bisher: Freigabe nötig"],
  ["Erster Mail-Weg", "Outlook (Microsoft 365) oder Gmail (Google Workspace) als Firmenpostfach?", "Entscheidung vor der Gründung"],
  ["Antwortentwürfe", "Sollen Entwürfe bei jeder Kundenmail automatisch entstehen, oder nur auf Knopfdruck?", "Bisher: automatisch bei bekanntem Absender"],
  ["WhatsApp", "Eigene Nummer für WhatsApp Business? Wer schaut wann rein (Wochenende)?", "offen"],
  ["Telefon- und WhatsApp-Bot", "Laut Business Case nicht vor Herbst 2027 (AI Act Art. 50, § 201 StGB, Haftung). Bleibt das so?", "Datenstruktur ist vorbereitet"],
  ["Zahlung", "Anzahlung per Stripe (Karte, SEPA) oder nur Überweisung?", "offen"],
  ["Name", "Markenrecherche „Nexova“ beim DPMA und EUIPO (es gibt eine Nexova AG in Basel)", "vor dem ersten Brief"],
  ["Aufbewahrung", "Nachrichten an Kunden: 6 Jahre als Handelsbrief oder kürzer? Mit Steuerberater klären.", "offen"],
];

function inhalt(): string {
  return `<div class="seite">${kopf()}<div class="fluss">
<p class="leise mono klein">Stand ${datumDe()} · Arbeitsfassung zum Durchsprechen</p>
<h1>Nexova OS: Ablauf, Daten, Anschlüsse</h1>
<p>Dieses Papier beschreibt, wie ein Betrieb vom ersten Fund bis zur laufenden Betreuung durch Nexova OS geht, welche Daten dabei entstehen und wie das System an Werkzeuge wie Outlook, Gmail, WhatsApp oder eine Telefonanlage angeschlossen wird. Es soll Widerspruch erzeugen: Jeder Abschnitt endet mit Fragen.</p>
<div class="box"><b>Die eine Regel</b><br>Nichts geht an Kunden, bevor ein Mensch es gesehen und freigegeben hat. Davor prüft immer eine Qualitätskontrolle (Regeln und KI). Das gilt für Briefe, Mails, WhatsApp, Rechnungen, Zahlungen und den Livegang. Technisch gibt es genau eine Tür nach draußen: den Postausgang.</div>

<h2>1. Der Ablauf in neun Schritten</h2>
${tabelle(["", "Schritt", "Was das System tut", "Was ein Mensch tut"], schritte, ["6%", "18%", "50%", "26%"])}
${frage([
  "Ist der Besuch 7 Tage nach dem Brief richtig, oder lieber anrufen (nur mit mutmaßlicher Einwilligung)?",
  "Reicht eine Freigabe für Angebote bis 10.000 € brutto, oder soll jedes Angebot von beiden gesehen werden?",
  "Wer ist Vertretung, wenn Daniel oder Max eine Woche ausfällt? Freigaben bleiben sonst liegen.",
])}

<h2>2. Wer entscheidet was</h2>
${tabelle(["Entscheidung", "Wer", "Woran man es sieht"], [
  ["Lead einstufen", "Daniel (Vertrieb)", "„Zu tun“ → Leads einstufen"],
  ["Brief, Angebot, Mails an Kunden", "wer zuständig ist", "„Zu tun“ → Freigeben, mit Vorschau"],
  ["Rechnungen über 10.000 € brutto", "beide, nacheinander", "Freigabe zeigt „1 von 2“"],
  ["Livegang", "Max (Technik)", "Freigabe mit Website-Vorschau"],
  ["Zahlung einziehen (Stripe)", "wer zuständig ist", "Freigabe „Zahlung“"],
  ["Löschung, Auskunft, Datenpanne", "Admin", "Stammdaten → Datenschutz"],
], ["38%", "24%", "38%"])}
<p>Die Qualitätskontrolle blockiert, wenn etwas fehlt oder falsch ist (keine gültige Adresse, Anhang fehlt, PDF-Layout nicht sauber, Website-Prüfung nicht bestanden, WhatsApp ohne vorherige Kundennachricht). Hinweise (z. B. eine Zahl, die nicht in den Daten steht) muss der Mensch lesen, darf aber freigeben.</p>

<h2>3. Nachrichten: die Grundlage für Bots</h2>
<p>Alle Kanäle schreiben in dieselbe Tabelle <b>Nachrichten</b>. Ein späterer WhatsApp- oder Telefon-Bot ist damit nur ein weiterer Absender: Er liefert Nachrichten ein und darf Antworten <b>entwerfen</b>, nie selbst senden.</p>
${bildNachrichten()}
${tabelle(["Feld", "Bedeutung"], [
  ["kanal", "mail, whatsapp, telefon, portal, formular"],
  ["richtung", "ein (vom Kunden) oder aus (von uns, nach Freigabe)"],
  ["betrieb, kontakt, ticket", "Zuordnung; automatisch über E-Mail-Adresse oder Telefonnummer"],
  ["absender, empfänger", "E-Mail-Adresse oder Telefonnummer im Format +49…"],
  ["externe ID", "Kennung beim Fremddienst; dieselbe Nachricht wird nie doppelt gespeichert"],
  ["inhalt, betreff, dauer", "Text, bei Telefon Zusammenfassung und Gesprächsdauer"],
  ["status", "neu, erledigt oder nicht zugeordnet (nach 90 Tagen gelöscht)"],
], ["30%", "70%"])}
<p>Was beim Eingang passiert: Nachricht speichern → Betrieb erkennen → Aufgabe für den Zuständigen (bei Anruf: Rückruf heute) → bei Mail und WhatsApp ein Antwortentwurf im Postausgang → Prüfung → Freigabe → Versand → die Antwort steht im Verlauf des Betriebs.</p>
<h3>Regeln für einen Bot</h3>
<ul>
<li>Er muss sich als KI zu erkennen geben (AI Act Art. 50, ab August 2026).</li>
<li>Keine Aufzeichnung von Telefonaten ohne ausdrückliche Einwilligung (§ 201 StGB). Gespeichert wird nur eine Zusammenfassung.</li>
<li>Kein Erstkontakt per WhatsApp, Mail oder Anruf (§ 7 UWG). WhatsApp nur als Antwort innerhalb von 24 Stunden.</li>
<li>Keine Preise, Termine oder Zusagen, die nicht in den Daten stehen. Alles Unklare: „Wir melden uns.“</li>
</ul>
${frage([
  "Soll ein Bot einfache Fragen (Öffnungszeiten, Status des Projekts) ohne Freigabe beantworten dürfen? Das wäre eine bewusste Ausnahme von der Grundregel.",
  "Wie schnell müssen wir antworten? Daraus folgt, wie oft jemand die Freigaben ansehen muss.",
  "Welche Kanäle nutzen eure Kunden wirklich: Telefon, WhatsApp oder Mail?",
])}

<h2>4. Datenstruktur</h2>
<p>Der Betrieb ist der Mittelpunkt. Alles andere hängt an ihm. Wird ein Betrieb gelöscht, verschwinden seine Daten mit, außer Rechnungen und Handelsbriefen, die wir aufbewahren müssen.</p>
${tabelle(["Objekt", "Was drinsteht", "Beziehung"], datenmodell, ["20%", "52%", "28%"])}
<p>Insgesamt 36 Tabellen in PostgreSQL. Jede Änderung am Aufbau läuft über eine Migration, die mit dem Code gespeichert wird. Für den Weiterverkauf an andere Firmen sind Pakete, Module und Zusatzleistungen pflegbare Stammdaten, keine festen Werte im Code.</p>
${frage([
  "Fehlt ein Objekt, das ihr im Alltag braucht (z. B. Partner, Lieferanten, Material)?",
  "Mehrere Standorte je Betrieb: nötig oder nicht?",
  "Für den Verkauf an andere Firmen: eine Installation je Kunde (einfacher, sicherer) oder eine gemeinsame (günstiger)?",
])}

<h2>5. Anschlüsse (Konnektoren)</h2>
<p>Jeder Fremddienst hat einen Adapter mit Simulator. Ohne Zugangsdaten läuft der Simulator, und nichts verlässt das System. Zugangsdaten stehen nur in der Umgebung des Servers und im Passwortmanager. Übersicht und Anleitungen in Nexova OS unter <b>Stammdaten → Konnektoren</b>, dort auch der Knopf „Testmail an mich“.</p>
${tabelle(["Zweck", "Womit", "Stand"], konnektoren, ["22%", "50%", "28%"])}
<h3>E-Mail im bekannten Design</h3>
<p>Jede Mail geht in zwei Fassungen raus: im Nexova-Design (hell, Logo, Signatur mit Pflichtangaben nach § 35a GmbHG) und als reiner Text. Das Design ist für Outlook, Gmail und Apple Mail gebaut (Tabellen, keine Skripte, keine Grafiken, die blockiert werden). Bei Microsoft 365 liegt die Mail danach auch in Outlook unter „Gesendete Elemente“. In der Freigabe sieht man die Mail genau so, wie sie ankommt.</p>
${frage([
  "Antworten der Kunden: ins gemeinsame Postfach (hallo@…) oder an den Zuständigen?",
  "Soll Nexova OS Mails auch aus dem persönlichen Postfach von Daniel oder Max senden?",
])}

<h2>6. Offene Entscheidungen</h2>
${tabelle(["Thema", "Frage", "Stand"], offen, ["20%", "56%", "24%"])}
<p class="leise klein">Rechtliche Aussagen in diesem Papier sind Arbeitsannahmen und ersetzen keine Beratung. Vor dem Start mit Anwalt (UWG, AI Act, Datenschutz) und Steuerberater (Aufbewahrung, Rechnungen) abstimmen.</p>
</div>${fuss()}</div>`;
}

const css = `.klein{font-size:8.5pt}
.mensch,.auto{display:inline-block;font-family:"IBM Plex Mono",monospace;font-size:7.5pt;padding:0 1.5mm;border:.3mm solid currentColor;border-radius:2px;margin-right:1mm}
.mensch{color:${t.akzent}}.auto{color:${t.textLeise}}
.frage{border-left:1mm solid ${t.akzent}}.frage ul{margin:2mm 0 0}
svg{display:block;margin:2mm 0 5mm;break-inside:avoid}
td{font-size:9.5pt}`;

async function main() {
  const pdf = await htmlZuPdf(druckSeite({ titel: "Nexova OS: Ablauf, Daten, Anschlüsse", inhalt: inhalt(), extraCss: css }));
  fs.mkdirSync(path.dirname(ziel), { recursive: true });
  fs.writeFileSync(ziel, pdf);
  console.log(`${ziel} (${Math.round(pdf.length / 1024)} KB)`);
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
