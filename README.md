# Nexova OS

Das Betriebssystem von Nexova Consulting: Leads finden, Briefe, Online-Check und Demo, Vor-Ort-Termin, Angebot, Zahlung, Website-Bau, Livegang und Überwachung. Alles läuft automatisch, und **nichts geht raus, bevor Max oder Daniel es freigegeben haben**.

## Aufbau der Oberfläche

Links sechs Bereiche, oben die Reiter des Bereichs:

| Bereich | Reiter |
|---|---|
| **Zu tun** | Übersicht (nur was jetzt dran ist), Freigaben, Aufgaben |
| **Leads** | Alle Betriebe (Filter, Suche, nächster Schritt), Pipeline |
| **Projekte** | Projekte (Lieferschritte, Zeiten, Domain-Umzug), Tickets |
| **Finanzen** | Übersicht (Soll und Ist), Plan und Soll, Kennzahlen |
| **Logs** | Protokoll, Versendet, Simulator-Postfach, Technik und Agenten |
| **Stammdaten** | Katalog (Pakete, KI-Module, Zusatzleistungen), Soll-Umsätze, Benutzer und Sicherheit, Unterlagen, Datenschutz |

Ein Betrieb hat die Reiter Überblick, Aktivitäten, Unterlagen und Post, Daten.

**PDFs:** Jedes Dokument wird vor dem Erzeugen automatisch umbrochen (Folgeseiten mit Kopf und Fußzeile, Tabellen und Listen zeilenweise) und geprüft. Ragt etwas in die Fußzeile, über den Rand oder ist eine Seite verrutscht, entsteht kein PDF, und die Qualitätskontrolle blockiert die Freigabe. Stresstest: `tests/pdf.test.ts`.

**Kundenportal-Zugang:** persönlicher Link in jeder Mail (kein Passwort). Verloren? Unter `/portal` per E-Mail neu anfordern (die Mail geht über die Freigabe). Weitergeleitet? Beim Betrieb unter Daten „Link erneuern“, der alte ist sofort gesperrt.

## Der Ablauf

| # | Schritt | Automatisch | Freigabe durch euch |
|---|---|---|---|
| 1 | Wochenlauf findet Betriebe (Mo 6 Uhr) | Research, Score, Sperrlisten-Abgleich | – |
| 2 | Lead einstufen | – | **Daniel: „Interessant“** |
| 3 | Online-Check, Demo-Website, Gesprächsleitfaden, Akquise-Brief | alles | – |
| 4 | Brief an den Betrieb | Druck und Versand | **Brief freigeben** |
| 5 | Besuch vor Ort, Aufnahme am Handy (nur mit Einwilligung) | Abschrift, Protokoll, Maßnahmenplan, Angebot, Mail | **Angebot freigeben** |
| 6 | Kunde nimmt online an (Name, Unternehmer-Bestätigung, AGB-Version) | Auftragsbestätigung, Anzahlung (Stripe oder Rechnung über 50 %) | **Auftragsbestätigung und Rechnung freigeben** (über 10.000 €: beide) |
| 7 | Zahlung kommt | Projekt, Start-Mail mit Portal-Link | **Start-Mail freigeben** |
| 8 | Kunde lädt Texte, Fotos, BFSG-Angaben hoch, bei bestehender Domain mit Auftrag zum Umzug | Seite bauen, 10 Qualitätsprüfungen, BFSG-Hinweis; DNS-Bestandsaufnahme, alte Seite sichern, Weiterleitungen | – |
| 9 | Livegang | Betreuung startet; bei bestehender Domain Anleitung zur Umstellung, sonst Bitte um Abnahme (14 Tage Frist) | **Livegang und Mail freigeben** |
| 9a | Domain zeigt auf uns (Prüfung alle 15 Minuten) | Hinweis zur Kündigung des alten Webhostings, Bitte um Abnahme | **beide Mails freigeben** |
| 10 | Abnahme im Portal (oder Frist abgelaufen) | Abnahmeprotokoll, Schlusszahlung bzw. Schlussrechnung minus Anzahlung | **Protokoll und Schlusszahlung freigeben** |
| 11 | Laufende Betreuung | Monatsreport, Mahnstufen, Kündigung und Vertragsende | **jede Mail freigeben** |
| 12 | Überwachung | Erreichbarkeit, Backups, Probe-Rücksicherung, Löschfristen, Tagesbericht | – |

## CRM: Aufgaben, Pipeline, Tickets, Zeiten

- **Aufgaben:** deine fälligen Aufgaben und Termine (auch auf „Heute“ und als Kalender-Abo). Viele legt Nexova OS selbst an (Besuch, Angebot nachfassen, Inhalte nachfassen) und schließt sie, wenn es weitergeht.
- **Pipeline:** alle Betriebe nach Stufe, mit Wert, Prognose und Warnung bei Chancen, die zu lange liegen.
- **Betriebe:** Ansprechpartner, Aktivitäten (Notiz, Anruf, Termin, Aufgabe), Zuständig, Schlagworte, Tickets; Import und Export als CSV.
- **Projekte:** Lieferschritte je Paket (teils automatisch abgehakt) und Zeiterfassung mit Ziel aus dem Business Case.
- **Tickets:** Wünsche und Fehler aus dem Kundenportal oder per Telefon, Zeit gegen das Monatskontingent, Antwort über den Postausgang.
- **Kennzahlen:** die Messgrößen aus dem Business Case und der Vertriebstrichter.
- **Einstellungen:** Benutzer und Rollen, Zwei-Faktor-Anmeldung, Kalender-Abo, API-Schlüssel, CSV-Import.

Vergleich mit Salesforce, HubSpot, Pipedrive, MOCO, awork und HERO sowie der Weg zum verkaufbaren Produkt: [`docs/crm-funktionen.md`](docs/crm-funktionen.md).

## Sicherheit und Datenschutz

Prüfbericht mit Penetrationstest, Datenschutz-Checkliste für die Gründung und Server-Härtung: [`docs/sicherheit-datenschutz.md`](docs/sicherheit-datenschutz.md). Im Menü unter **Datenschutz**: Verzeichnis, Maßnahmen, Dienstleister, Löschkonzept, Datenpannen (72 h) und Anfragen von Betroffenen (1 Monat).

## Bestehende Websites umziehen

Hat ein Betrieb schon eine Domain, bleibt er Inhaber, und seine E-Mail läuft unverändert weiter. Standard: Er ändert nach unserer Anleitung zwei A-Einträge (oder wir machen es am Telefon gemeinsam). Alternativ holen wir die Domain mit seinem Auth-Code zu uns. Nexova OS prüft vorher alle DNS-Einträge (E-Mail, Nachweise, Risiken), sichert die alte Seite, leitet alte Adressen weiter, merkt die Umstellung selbst und sagt dem Kunden erst dann, dass er das alte Webhosting kündigen kann. Einrichtung auf dem Server: [`docs/betrieb.md`](docs/betrieb.md#kunden-domains-umzug-bestehender-websites).

## Unterlagen und Pflichten

Unter **Unterlagen** stehen alle 125 Punkte aus dem Bericht „Dokumente für die Nexova GmbH“ (`docs/unterlagen-bericht.md`), nach Etappen bis zum 30.11.2028, mit Status, Notiz und abgelegter Datei, dazu Fristen und offene Entscheidungen. Rechtliche Festwerte (AGB-Version, Basiszins, Abnahmefrist, Zahlungsziel) stehen an einer Stelle: `src/lib/recht.ts`. Pflichtangaben nach § 35a GmbHG kommen aus `brand/tokens.json` und stehen in jeder Fußzeile und jeder Mail-Signatur. Beim Betrieb: Datenauskunft (Art. 15) und Löschung (Art. 17; Rechnungen und Vertragsunterlagen bleiben). Unter System: Entwurf des Verzeichnisses als Auftragsverarbeiter. Keine Rechtsberatung: Texte und Werte prüfen Anwalt und Steuerberater.

## Finanzen

Unter **Finanzen**: Umsatz, Ausgaben, Ergebnis, offene Forderungen, Umsatzsteuer-Zahllast (Ist-Versteuerung) und Steuerrücklage je Monat, Quartal oder Jahr, mit Plan-Ist-Vergleich gegen die Fixkosten aus dem Business Case. Belege mit dem Handy fotografieren, der Beleg-Agent liest sie aus, ihr prüft. Bericht als PDF und CSV für den Steuerberater; zu jedem Quartalsanfang bereitet der Steuerberater-Agent die Mail vor. Das ist eine Steuerungsübersicht, keine Bilanz: Jahresabschluss und Buchhaltung bleiben beim Steuerberater.

## Angebot vor Ort und Zahlung über Stripe

Beim Betrieb **„Angebot erstellen“**: Paket, Entlastungs-Module und Zusatzleistungen gemeinsam mit dem Kunden auswählen, der Preis rechnet live mit (Paket L: 3 Module inklusive; Modul 2 günstiger mit Modul 1; Hinweis, wenn ein Modul einen Prozess-Check braucht). Danach Qualitätskontrolle und eure Freigabe, dann geht das Angebot an den Kunden.

Der Kunde nimmt im Portal an und landet direkt bei **Stripe** für die Anzahlung (Karte oder SEPA). Stripe schickt die Rechnung und speichert die Zahlungsart. Beim Livegang kommt der **Start der Betreuung**, nach der Abnahme die **Schlusszahlung** als eigener Eintrag in die Freigabe; erst nach eurem Klick zieht Stripe ein. Es gibt keine doppelten Rechnungen: Mit Stripe erstellt Nexova OS keine eigenen Rechnungen (umschaltbar mit `ZAHLUNGSWEG=ueberweisung`).

Vor dem Echtbetrieb mit dem Steuerberater klären: Rechnungsangaben in Stripe (Steuernummer, Anschrift, Leistungsdatum) und E-Rechnungspflicht ab 2027/2028.

## Kundenportal

Jeder Kunde bekommt mit dem Angebot einen geheimen Link zu seinem Portal (`/portal/k/…`). Dort sieht er abgehakt, wo sein Projekt steht (Gespräch, Angebot, Annahme, Anzahlung, Inhalte, Bau und Prüfung, Livegang, Betreuung), was gerade von ihm gebraucht wird (Angebot annehmen, Inhalte hochladen, Rechnung bezahlen), seine Unterlagen, Rechnungen und die fertige Website. **Sichtbar ist nur, was durch Qualitätskontrolle und Freigabe gegangen und verschickt ist.** In Nexova OS öffnet „Kundenportal ansehen“ beim Betrieb die Ansicht des Kunden.

## Agenten

Jeder Bereich hat einen Agenten, der die Arbeit vorbereitet (Übersicht unter **System → Agenten**). Alles, was nach draußen geht, läuft danach durch die **Qualitätskontrolle** (Regeln plus KI-Prüfer) und wartet dann auf eure Freigabe. Ohne bestandene oder gelesene Prüfung lässt sich nichts freigeben; bei „blockiert“ erst beheben.

## Beispieldaten

Auf der leeren Startseite (oder unter System) „Beispieldaten laden“: 16 erfundene Betriebe in allen Phasen, Ausgaben mit Belegen, Rechnungen, Erinnerungen und ein Bericht an den Steuerberater. Unter System wieder entfernen.

## Lokal starten (zum Lernen und Testen)

**Am Mac am einfachsten:** Node.js (LTS) von nodejs.org installieren, dann `Nexova OS starten.command` doppelklicken. Beim ersten Mal fragt macOS nach: Rechtsklick auf die Datei → „Öffnen“ → „Öffnen“.

Oder von Hand, Voraussetzung Node.js 22:

```bash
npm install
npx playwright-core install chromium   # einmalig, für die PDFs
npm run dev
```

Dann <http://localhost:3000> öffnen. Beim ersten Start werden die Konten `max@nexova.de` und `daniel@nexova.de` angelegt, das Start-Passwort steht auf der Anmeldeseite. Danach unter **System** ändern.

Ohne weitere Einstellungen läuft alles mit **Simulatoren**: Mails und Briefe landen unter **Simulator**, nichts verlässt den Rechner. Die Daten liegen im Ordner `data/` (nicht im Git).

## Tests

```bash
npm test
```

Spielt den ganzen Ablauf von Lead bis Livegang durch und prüft die Sicherheitsregeln: kein Versand ohne Freigabe, Sperrliste, zwei Freigaben über 10.000 €, keine Mail ohne Adresse, Backup und Rücksicherung.

## Dienste anbinden

Jeder Dienst hat einen Simulator und wird „echt“, sobald seine Zugangsdaten gesetzt sind. Welche Variablen das sind, steht in `.env.example`. Unter **System → Dienste** siehst du jederzeit, was echt ist und was simuliert wird.

| Dienst | Variable | Wann |
|---|---|---|
| Claude | `ANTHROPIC_API_KEY` | nach Klärung EU-Verarbeitung + AV-Vertrag |
| E-Mail | `RESEND_API_KEY`, `MAIL_FROM`, `MAIL_ANTWORT_AN` (oder `SMTP_*`) | Modul 2 |
| Briefdienst | `BRIEFDIENST_API_KEY` + `AKQUISE_FREIGESCHALTET=ja` | nach Notartermin |
| Whisper | `WHISPER_URL` | Modul 9 |
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_STEUERSATZ_ID` | Modul 10 |
| Docuseal, lexoffice | `DOCUSEAL_*`, `LEXOFFICE_API_KEY` | Modul 10 |
| Push aufs Handy | `NTFY_URL` | Modul 12 |
| Backup extern | `BACKUP_ZIEL` | Modul 3 |

## Auf den Server (Hetzner + Coolify)

Coolify baut aus diesem Repo mit `Dockerfile` bzw. `docker-compose.yml` (App + PostgreSQL). In Coolify mindestens setzen: `BASE_URL`, `SESSION_SECRET`, `POSTGRES_PASSWORD`, `NEXOVA_START_PASSWORT`. Details im Betriebshandbuch: [`docs/betrieb.md`](docs/betrieb.md).

## Aufbau

```
brand/            Marke als Code: tokens.json (Farben, Schriften, Absender), stimme.md (Tonalität für alle KI-Texte)
drizzle/          Datenbank-Migrationen (mit `npm run db:generate` aus dem Schema erzeugt)
src/lib/db/       Datenbank und Schema
src/lib/ablauf/   Der Geschäftsablauf: akquise, verkauf, lieferung, postausgang, betrieb (Backups usw.)
src/lib/adapters/ Anbindungen an Fremddienste, jeweils mit Simulator
src/lib/docs/     Druckvorlagen im Nexova-Design und PDF-Erzeugung
src/lib/sites/    Website-Generator (Branchenvorlagen) und Qualitätsprüfung
src/lib/jobs/     Hintergrund-Jobs und Zeitplan
src/app/          Oberfläche (Next.js)
tests/            Ablauf-Test
```

## Offene Punkte

- Zwei-Faktor-Anmeldung für alle Konten einschalten (Einstellungen), bevor echte Kundendaten drin sind
- Workflow-Analyse mit offenen Entscheidungen: [`docs/workflow-analyse.md`](docs/workflow-analyse.md)
- HRB-Nummer nach Eintragung in `brand/tokens.json` (`hrb`), Vornamen der Geschäftsführer prüfen
- Lighthouse und axe-core in die Qualitätsprüfung (Modul 8/11)
- Echte Adapter für Briefdienst, Docuseal, Stripe, lexoffice (Simulatoren laufen)
- Masterprompt aus `04_Lead-Flow_Masterprompt.md` in `brand/research-prompt.md` übernehmen
- Logo-Reinzeichnung aus `logo.py` statt der gezeichneten Wortmarke in `src/lib/docs/logo.ts`
- Absenderdaten in `brand/tokens.json` nach der Gründung eintragen
