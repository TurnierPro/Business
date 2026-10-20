import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// PDF-Qualität: Jede Dokumentart muss sauber gesetzt sein, auch mit sehr langen Inhalten.
// htmlZuPdf wirft, sobald etwas in die Fußzeile ragt, über den Rand läuft oder abgeschnitten wird.
process.env.DATABASE_URL = "memory://";
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "nexova-pdf-"));

const { dokumentHtml, htmlZuPdf } = await import("../src/lib/docs/render");
const { druckSeite } = await import("../src/lib/docs/basis");

const seiten = (pdf: Buffer) => (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
const an = { name: "Sanitär- und Heizungsbau Müller-Lüdenscheidt GmbH & Co. KG", anrede: "Frau", inhaber: "Dr. Maria-Theresia Müller-Lüdenscheidt", strasse: "Hauptstraße 123a, Hinterhaus", plz: "76131", ort: "Karlsruhe-Durlach" };
const lang = (n: number) => Array.from({ length: n }, (_, i) => `Absatz ${i + 1}: Wir bauen Ihre Website so, dass Kunden Sie finden, anrufen und Anfragen mit Fotos schicken. Das spart Anfahrten und Rückfragen.`).join("\n\n");
const positionen = (n: number) => Array.from({ length: n }, (_, i) => ({ text: `Modul ${i + 1}: Ein sehr langer Positionstext mit vielen Wörtern, der in der Tabelle umbrechen muss, ohne etwas zu überdecken`, einmalig: 49000 + i * 1000, monatlich: 3900, hinweis: i % 2 ? "zzgl. Gebühren Dritter" : undefined }));

const FAELLE: [string, string, unknown][] = [
  ["Angebot normal", "angebot", { an, nummer: "A-2026-0001", datum: "20.10.2026", paket: "M", einleitung: "vielen Dank für das Gespräch.", einmalig: 490000, monatlich: 19900, positionen: positionen(2), zahlweg: "stripe" }],
  ["Angebot sehr lang", "angebot", { an, nummer: "A-2026-0002", datum: "20.10.2026", paket: "L", einleitung: lang(4), einmalig: 2490000, monatlich: 99000, positionen: positionen(22), zahlweg: "ueberweisung", anmerkungen: lang(12) }],
  ["Rechnung mit 40 Positionen", "rechnung", { an, nummer: "2026-0001", datum: "20.10.2026", art: "schluss", positionen: Array.from({ length: 40 }, (_, i) => ({ text: `Leistung ${i + 1} mit ausführlicher Beschreibung für den Leistungsnachweis`, netto: 12345 })), zahlungszielTage: 14, zahlbarBis: "03.11.2026", leistung: "Abnahme am 20.10.2026" }],
  ["Brief lang", "brief", { an, betreff: "Ein sehr langer Betreff, der in zwei Zeilen umbrechen kann, ohne den Text darunter zu überdecken", text: lang(9), datum: "20.10.2026", quelle: "Impressum https://www.sanitaer-und-heizungsbau-mueller-luedenscheidt.example/impressum, abgerufen am 20.10.2026" }],
  ["Protokoll lang", "protokoll", { an, datum: "20.10.2026", ziele: Array(12).fill("Mehr Anfragen mit Fotos und weniger Rückfragen am Telefon"), probleme: Array(12).fill("Anfragen kommen über Telefon, Mail und WhatsApp durcheinander"), empfehlung: { paket: "M", begruendung: lang(2) }, offeneFragen: Array(10).fill("Wer liefert die Fotos?"), massnahmen: Array.from({ length: 30 }, (_, i) => ({ was: `Maßnahme ${i + 1}: Texte, Fotos und Logo im Kundenportal hochladen`, wann: "nach Auftrag", wer: "Kunde" })) }],
  ["Auftragsbestätigung", "auftragsbestaetigung", { an, nummer: "AB-2026-0001", angebotNummer: "A-2026-0001", datum: "20.10.2026", paket: "L", positionen: positionen(25), einmalig: 2490000, monatlich: 99000, annahme: { name: "Dr. Maria-Theresia Müller-Lüdenscheidt", am: new Date().toISOString(), agbVersion: "Entwurf 10/2026", unternehmer: true }, zahlweg: "stripe" }],
  ["Abnahmeprotokoll mit vielen Mängeln", "abnahmeprotokoll", { an, datum: "20.10.2026", projekt: "M – Anfragen + Bewerbungen", domain: "sanitaer-und-heizungsbau-mueller-luedenscheidt.example", ergebnis: "vorbehalt", name: "Maria Müller", am: "20.10.2026", maengel: lang(8), pruefung: Array.from({ length: 10 }, (_, i) => ({ name: `Prüfung ${i + 1}`, ok: true, detail: "Alle Seiten geprüft und in Ordnung, Ladezeit unter einer Sekunde" })) }],
  ["Monatsreport", "monatsreport", { an, monat: "September 2026", domain: "mueller.example", anfragen: 12, anfragenVormonat: 9, erreichbar: { pruefungen: 4320, ausfaelle: 1 }, hinweise: Array(6).fill("3 Anfragen mehr als im Vormonat.") }],
  ["Umzugsanleitung", "umzugsanleitung", { an, datum: "20.10.2026", domain: "sanitaer-und-heizungsbau-mueller-luedenscheidt.example", ip: "203.0.113.10", anbieter: "IONOS", mailAnbieter: "Microsoft 365", mitMail: true, cloudflare: true }],
  ["Online-Check", "check_report", { an, website: "https://www.sanitaer-und-heizungsbau-mueller-luedenscheidt.example", datum: "20.10.2026", punkte: Array.from({ length: 14 }, (_, i) => ({ name: `Punkt ${i + 1}`, ampel: "gelb", befund: "Die Seite lädt auf dem Handy langsam und hat kein Anfrageformular mit Foto-Upload." })), prioritaeten: ["Website fürs Handy", "Anfrageformular", "Google-Profil"] }],
  ["Gesprächsleitfaden", "leitfaden", { an, datum: "20.10.2026", fragen: Array(25).fill("Wie kommen heute Anfragen bei Ihnen an, und wer kümmert sich darum?"), hinweise: Array(6).fill("Keine Website gefunden.") }],
];

for (const [name, art, daten] of FAELLE) {
  test(`PDF sauber: ${name}`, async () => {
    const pdf = await htmlZuPdf(dokumentHtml({ art, daten }));
    assert.ok(pdf.length > 5000, "PDF hat Inhalt");
    assert.ok(seiten(pdf) >= 1);
  });
}

test("Lange Inhalte bekommen Folgeseiten statt überzulaufen", async () => {
  const normal = await htmlZuPdf(dokumentHtml({ art: "angebot", daten: FAELLE[0][2] }));
  const lang = await htmlZuPdf(dokumentHtml({ art: "angebot", daten: FAELLE[1][2] }));
  assert.ok(seiten(lang) > seiten(normal), `${seiten(lang)} Seiten statt ${seiten(normal)}`);
});

test("Layout-Prüfung erkennt Fehler: kein PDF bei überlaufendem Inhalt", async () => {
  const kaputt = druckSeite({ titel: "Test", inhalt: `<div class="seite"><div style="height:400mm">Ein Block, der sich nicht teilen lässt</div><div class="fuss"><div>Fußzeile</div></div></div>` });
  await assert.rejects(() => htmlZuPdf(kaputt), /PDF-Layout nicht sauber/);
  const breit = druckSeite({ titel: "Test", inhalt: `<div class="seite"><p style="white-space:nowrap">${"Sehr breit ".repeat(40)}</p><div class="fuss"><div>Fußzeile</div></div></div>` });
  await assert.rejects(() => htmlZuPdf(breit), /rechten Rand/);
});
