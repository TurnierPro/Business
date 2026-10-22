// Datenschutz-Dokumentation als Code: Verzeichnis der Verarbeitungstätigkeiten (Art. 30 Abs. 1),
// technische und organisatorische Maßnahmen (Art. 32) und Dienstleister. Keine Rechtsberatung:
// vor dem ersten Kunden mit Anwalt bzw. externem Datenschutzberater abstimmen.

export type Verarbeitung = { name: string; zweck: string; rechtsgrundlage: string; betroffene: string; daten: string; empfaenger: string; drittland: string; loeschung: string };

export const VERARBEITUNGEN: Verarbeitung[] = [
  { name: "Akquise per Brief", zweck: "Information über unser Angebot an Handwerksbetriebe", rechtsgrundlage: "Art. 6 Abs. 1 lit. f DSGVO (Direktwerbung), Hinweis nach Art. 14 und 21", betroffene: "Inhaber und Ansprechpartner von Betrieben", daten: "Name, Geschäftsanschrift, Telefon, Website, öffentliche Angaben, Quelle", empfaenger: "Briefdienst (AV)", drittland: "nein", loeschung: "6 Monate ohne Reaktion, Sperrliste bei Widerspruch" },
  { name: "Vertrieb und Angebot", zweck: "Termin, Protokoll, Angebot", rechtsgrundlage: "Art. 6 Abs. 1 lit. b (vorvertraglich); Aufnahme: Einwilligung lit. a", betroffene: "Ansprechpartner der Betriebe", daten: "Kontaktdaten, Gesprächsinhalte, Aufnahme (nur mit Einwilligung)", empfaenger: "Transkription (eigener Server); KI (Anthropic, AV) nur wenn eingerichtet", drittland: "Anthropic: USA (Standardvertragsklauseln bzw. Data Privacy Framework prüfen)", loeschung: "Aufnahme nach Versand, spätestens 30 Tage; Angebot ohne Auftrag nach 1 Jahr" },
  { name: "Kundenverwaltung und Lieferung", zweck: "Vertrag erfüllen: Website, Betreuung, Tickets, Kundenportal", rechtsgrundlage: "Art. 6 Abs. 1 lit. b", betroffene: "Kunden und ihre Ansprechpartner", daten: "Stammdaten, Inhalte, Fotos, Tickets, Zeiten, Kommunikation", empfaenger: "Hetzner (Hosting, AV), E-Mail-Dienst (AV)", drittland: "nein (Resend: prüfen)", loeschung: "nach Vertragsende sperren, Löschung nach Ablauf der Aufbewahrungspflichten" },
  { name: "Kommunikation über Kanäle (E-Mail, WhatsApp, Telefon)", zweck: "Anfragen von Interessenten und Kunden annehmen, zuordnen, beantworten; Rückrufe", rechtsgrundlage: "Art. 6 Abs. 1 lit. b (Vertrag, vorvertraglich) und lit. f (Anfrage beantworten)", betroffene: "Kunden, Interessenten, deren Ansprechpartner", daten: "Name, E-Mail-Adresse, Telefonnummer, Nachrichteninhalt, bei Telefon Dauer und Zusammenfassung (keine Aufnahme ohne Einwilligung, § 201 StGB)", empfaenger: "E-Mail-Dienst (Microsoft, Google oder SMTP-Anbieter, AV), Meta (WhatsApp Business, AV), Telefonanlage (AV), KI für Antwortentwürfe (AV)", drittland: "Meta, Microsoft, Google: USA möglich (Data Privacy Framework, Standardvertragsklauseln)", loeschung: "mit dem Betrieb; ohne Zuordnung nach 90 Tagen; versendete Geschäftsmails 6 Jahre" },
  { name: "Zahlungen und Buchhaltung", zweck: "Rechnungen, Zahlungseingang, Mahnwesen, Steuern", rechtsgrundlage: "Art. 6 Abs. 1 lit. b und c (§ 147 AO, § 257 HGB)", betroffene: "Kunden", daten: "Rechnungsdaten, Zahlungsart (bei Stripe nur Verweis)", empfaenger: "Stripe (eigene Verantwortung für Zahlungsdaten), Steuerberater (Berufsgeheimnis, kein AV)", drittland: "Stripe: EU-Gesellschaft, Übermittlung in die USA möglich", loeschung: "8 Jahre (Belege), 6 Jahre (Handelsbriefe)" },
  { name: "Benutzerkonten und Protokoll", zweck: "Zugang, Sicherheit, Nachweis", rechtsgrundlage: "Art. 6 Abs. 1 lit. f und Art. 32", betroffene: "Gründer, später Mitarbeitende", daten: "Name, E-Mail, Passwort-Hash, Anmeldungen, Änderungen, gekürzte IP bei Fehlversuchen", empfaenger: "keine", drittland: "nein", loeschung: "Protokoll 3 Jahre, Fehlversuche 30 Tage" },
  { name: "Betroffenenrechte und Datenpannen", zweck: "Pflichten aus Art. 12–22 und 33/34 erfüllen", rechtsgrundlage: "Art. 6 Abs. 1 lit. c", betroffene: "Anfragende Personen", daten: "Anfrage, Antwort, Nachweise", empfaenger: "ggf. Aufsichtsbehörde (LfDI Baden-Württemberg)", drittland: "nein", loeschung: "3 Jahre nach Abschluss" },
];

export type Massnahme = { bereich: string; massnahme: string; umgesetzt: boolean };

export const TOMS: Massnahme[] = [
  { bereich: "Zugang", massnahme: "Anmeldung mit Passwort (mind. 12 Zeichen, scrypt-Hash), Start-Passwort muss geändert werden", umgesetzt: true },
  { bereich: "Zugang", massnahme: "Zwei-Faktor-Anmeldung (TOTP), Geheimnis verschlüsselt gespeichert, jeder Code nur einmal gültig", umgesetzt: true },
  { bereich: "Zugang", massnahme: "Sperre nach 5 Fehlversuchen je Konto bzw. 20 je Netz (15 Minuten), gleiche Antwortzeit bei unbekannten Konten", umgesetzt: true },
  { bereich: "Zugang", massnahme: "Sitzungen 14 Tage, nur per HTTPS, nicht für Skripte lesbar; Passwortwechsel beendet alle anderen Sitzungen; „überall abmelden“", umgesetzt: true },
  { bereich: "Berechtigung", massnahme: "Rollen (Admin, Vertrieb, Technik, Nur lesen); Benutzer und Schlüssel nur durch Admin", umgesetzt: true },
  { bereich: "Berechtigung", massnahme: "Kundenportal nur über geheime Links (192 Bit Zufall), Kunden sehen nur eigene, freigegebene Unterlagen", umgesetzt: true },
  { bereich: "Berechtigung", massnahme: "Schnittstelle nur mit Schlüssel (gespeichert als Hash) und einzelnen Rechten, widerrufbar", umgesetzt: true },
  { bereich: "Weitergabe", massnahme: "Nichts verlässt das System ohne Qualitätskontrolle und menschliche Freigabe (Postausgang)", umgesetzt: true },
  { bereich: "Weitergabe", massnahme: "Verschlüsselte Übertragung (HTTPS, HSTS); Backups außerhalb des Servers nur verschlüsselt (AES-256-GCM)", umgesetzt: true },
  { bereich: "Weitergabe", massnahme: "Portal-Links werden nicht als Referrer an fremde Seiten weitergegeben", umgesetzt: true },
  { bereich: "Eingabe", massnahme: "Änderungsprotokoll: wer hat wann was getan", umgesetzt: true },
  { bereich: "Schutz der Anwendung", massnahme: "Content-Security-Policy mit Nonce, Schutz vor Einbettung (Clickjacking), nosniff, Permissions-Policy", umgesetzt: true },
  { bereich: "Schutz der Anwendung", massnahme: "Abrufe nach außen nur zu öffentlichen Adressen (Schutz vor SSRF), nur interne Weiterleitungen", umgesetzt: true },
  { bereich: "Schutz der Anwendung", massnahme: "Uploads: echter Dateityp geprüft (Fotos, PDF), Größen begrenzt; Spam-Falle und Mengenbegrenzung bei Formularen", umgesetzt: true },
  { bereich: "Schutz der Anwendung", massnahme: "Abhängigkeiten ohne bekannte Schwachstellen (npm audit), automatische Sicherheitstests vor jedem Commit", umgesetzt: true },
  { bereich: "Verfügbarkeit", massnahme: "Tägliches Backup, wöchentliche Probe-Rücksicherung, Überwachung alle 10 Minuten, Push bei Fehlern", umgesetzt: true },
  { bereich: "Trennung", massnahme: "Kundendaten je Betrieb getrennt; Testdaten nur im Simulator; Demos ohne Cookies und ohne Indexierung", umgesetzt: true },
  { bereich: "Datensparsamkeit", massnahme: "Automatische Löschfristen (siehe Löschkonzept); IP-Adressen nur gekürzt; keine Tracking-Cookies", umgesetzt: true },
  { bereich: "Organisation", massnahme: "Server in Deutschland (Hetzner, ISO 27001), Festplattenverschlüsselung und Firewall auf dem Server", umgesetzt: false },
  { bereich: "Organisation", massnahme: "AV-Verträge mit allen Dienstleistern abgeschlossen und abgelegt (Unterlagen)", umgesetzt: false },
  { bereich: "Organisation", massnahme: "Verpflichtung auf Vertraulichkeit für alle mit Zugang (auch Aushilfen)", umgesetzt: false },
  { bereich: "Organisation", massnahme: "Geräte: Festplattenverschlüsselung, Bildschirmsperre, Updates, Passwortmanager; keine Firmendaten auf Arbeitgeber-Geräten", umgesetzt: false },
  { bereich: "Organisation", massnahme: "Externer Penetrationstest vor dem Verkauf als Produkt", umgesetzt: false },
];

export type Dienstleister = { name: string; wofuer: string; av: boolean; sitz: string; aktivWenn: string };

export const DIENSTLEISTER: Dienstleister[] = [
  { name: "Hetzner Online GmbH", wofuer: "Server, Backups (Storage Box)", av: true, sitz: "Deutschland", aktivWenn: "immer" },
  { name: "Anthropic", wofuer: "KI für Entwürfe, Protokolle, Qualitätskontrolle", av: true, sitz: "USA (Drittland: Standardvertragsklauseln, Data Privacy Framework prüfen)", aktivWenn: "ANTHROPIC_API_KEY" },
  { name: "Microsoft Ireland (Microsoft 365)", wofuer: "Versand von E-Mails über Outlook", av: true, sitz: "Irland (EU-Datengrenze; Übermittlung in die USA möglich)", aktivWenn: "MS_CLIENT_ID" },
  { name: "Google Cloud EMEA (Google Workspace)", wofuer: "Versand von E-Mails über Gmail", av: true, sitz: "Irland (Übermittlung in die USA möglich)", aktivWenn: "GOOGLE_CLIENT_EMAIL" },
  { name: "Meta Platforms Ireland (WhatsApp Business)", wofuer: "WhatsApp-Nachrichten empfangen und beantworten", av: true, sitz: "Irland (Übermittlung in die USA möglich)", aktivWenn: "WHATSAPP_TOKEN" },
  { name: "Resend", wofuer: "Versand von E-Mails", av: true, sitz: "USA (Drittland prüfen; Alternative: deutscher SMTP-Anbieter)", aktivWenn: "RESEND_API_KEY" },
  { name: "Stripe Payments Europe", wofuer: "Zahlungen, Rechnungen, Abos", av: false, sitz: "Irland (eigene Verantwortung für Zahlungsdaten)", aktivWenn: "STRIPE_SECRET_KEY" },
  { name: "Briefdienst (noch offen)", wofuer: "Druck und Versand der Akquise-Briefe", av: true, sitz: "Deutschland (bei Auswahl darauf achten)", aktivWenn: "BRIEFDIENST_API_KEY" },
  { name: "ntfy", wofuer: "Push-Meldungen aufs Handy (ohne Kundendaten)", av: false, sitz: "selbst betrieben empfohlen", aktivWenn: "NTFY_URL" },
  { name: "Steuerberater", wofuer: "Buchhaltung, Steuern", av: false, sitz: "Deutschland (Berufsgeheimnis, eigene Verantwortung)", aktivWenn: "STEUERBERATER_EMAIL" },
];

/** Datenschutzbeauftragter: Pflicht ab 20 Personen, die ständig personenbezogene Daten automatisiert verarbeiten (§ 38 BDSG). */
export const DSB_HINWEIS = "Kein Datenschutzbeauftragter nötig, solange weniger als 20 Personen ständig mit personenbezogenen Daten arbeiten und keine Datenschutz-Folgenabschätzung vorgeschrieben ist (§ 38 BDSG). Entscheidung schriftlich festhalten und bei Wachstum prüfen.";
