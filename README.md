# Stelax OS

Das Betriebssystem von Stelax Consulting: Leads finden, Briefe, Online-Check und Demo, Vor-Ort-Termin, Angebot, Zahlung, Website-Bau, Livegang und Überwachung. Alles läuft automatisch, und **nichts geht raus, bevor Max oder Daniel es freigegeben haben**.

## Der Ablauf

| # | Schritt | Automatisch | Freigabe durch euch |
|---|---|---|---|
| 1 | Wochenlauf findet Betriebe (Mo 6 Uhr) | Research, Score, Sperrlisten-Abgleich | – |
| 2 | Lead einstufen | – | **Daniel: „Interessant“** |
| 3 | Online-Check, Demo-Website, Gesprächsleitfaden, Akquise-Brief | alles | – |
| 4 | Brief an den Betrieb | Druck und Versand | **Brief freigeben** |
| 5 | Besuch vor Ort, Aufnahme am Handy (nur mit Einwilligung) | Abschrift, Protokoll, Maßnahmenplan, Angebot, Mail | **Angebot freigeben** |
| 6 | Kunde nimmt online an | Rechnung über 50 % | **Rechnung freigeben** (über 10.000 €: beide) |
| 7 | Zahlung kommt | Projekt, Start-Mail mit Portal-Link | **Start-Mail freigeben** |
| 8 | Kunde lädt Texte und Fotos hoch | Seite bauen, 10 Qualitätsprüfungen | – |
| 9 | Livegang | Schlussrechnung, Betreuung startet | **Livegang freigeben** |
| 10 | Überwachung | Erreichbarkeit, Backups, Probe-Rücksicherung, Tagesbericht | – |

## Finanzen

Unter **Finanzen**: Umsatz, Ausgaben, Ergebnis, offene Forderungen, Umsatzsteuer-Zahllast (Ist-Versteuerung) und Steuerrücklage je Monat, Quartal oder Jahr, mit Plan-Ist-Vergleich gegen die Fixkosten aus dem Business Case. Belege mit dem Handy fotografieren, der Beleg-Agent liest sie aus, ihr prüft. Bericht als PDF und CSV für den Steuerberater; zu jedem Quartalsanfang bereitet der Steuerberater-Agent die Mail vor. Das ist eine Steuerungsübersicht, keine Bilanz: Jahresabschluss und Buchhaltung bleiben beim Steuerberater.

## Agenten

Jeder Bereich hat einen Agenten, der die Arbeit vorbereitet (Übersicht unter **System → Agenten**). Alles, was nach draußen geht, läuft danach durch die **Qualitätskontrolle** (Regeln plus KI-Prüfer) und wartet dann auf eure Freigabe. Ohne bestandene oder gelesene Prüfung lässt sich nichts freigeben; bei „blockiert“ erst beheben.

## Beispieldaten

Auf der leeren Startseite (oder unter System) „Beispieldaten laden“: 16 erfundene Betriebe in allen Phasen, Ausgaben mit Belegen, Rechnungen, Erinnerungen und ein Bericht an den Steuerberater. Unter System wieder entfernen.

## Lokal starten (zum Lernen und Testen)

**Am Mac am einfachsten:** Node.js (LTS) von nodejs.org installieren, dann `Stelax OS starten.command` doppelklicken. Beim ersten Mal fragt macOS nach: Rechtsklick auf die Datei → „Öffnen“ → „Öffnen“.

Oder von Hand, Voraussetzung Node.js 22:

```bash
npm install
npx playwright-core install chromium   # einmalig, für die PDFs
npm run dev
```

Dann <http://localhost:3000> öffnen. Beim ersten Start werden die Konten `max@stelax.de` und `daniel@stelax.de` angelegt, das Start-Passwort steht auf der Anmeldeseite. Danach unter **System** ändern.

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
| E-Mail | `SMTP_*` | Modul 2 |
| Briefdienst | `BRIEFDIENST_API_KEY` + `AKQUISE_FREIGESCHALTET=ja` | nach Notartermin |
| Whisper | `WHISPER_URL` | Modul 9 |
| Docuseal, Stripe, lexoffice | `DOCUSEAL_*`, `STRIPE_SECRET_KEY`, `LEXOFFICE_API_KEY` | Modul 10 |
| Push aufs Handy | `NTFY_URL` | Modul 12 |
| Backup extern | `BACKUP_ZIEL` | Modul 3 |

## Auf den Server (Hetzner + Coolify)

Coolify baut aus diesem Repo mit `Dockerfile` bzw. `docker-compose.yml` (App + PostgreSQL). In Coolify mindestens setzen: `BASE_URL`, `SESSION_SECRET`, `POSTGRES_PASSWORD`, `STELAX_START_PASSWORT`. Details im Betriebshandbuch: [`docs/betrieb.md`](docs/betrieb.md).

## Aufbau

```
brand/            Marke als Code: tokens.json (Farben, Schriften, Absender), stimme.md (Tonalität für alle KI-Texte)
drizzle/          Datenbank-Migrationen (mit `npm run db:generate` aus dem Schema erzeugt)
src/lib/db/       Datenbank und Schema
src/lib/ablauf/   Der Geschäftsablauf: akquise, verkauf, lieferung, postausgang, betrieb (Backups usw.)
src/lib/adapters/ Anbindungen an Fremddienste, jeweils mit Simulator
src/lib/docs/     Druckvorlagen im Stelax-Design und PDF-Erzeugung
src/lib/sites/    Website-Generator (Branchenvorlagen) und Qualitätsprüfung
src/lib/jobs/     Hintergrund-Jobs und Zeitplan
src/app/          Oberfläche (Next.js)
tests/            Ablauf-Test
```

## Offene Punkte

- Zwei-Faktor-Anmeldung vor dem ersten echten Kunden
- Lighthouse und axe-core in die Qualitätsprüfung (Modul 8/11)
- Echte Adapter für Briefdienst, Docuseal, Stripe, lexoffice (Simulatoren laufen)
- Masterprompt aus `04_Lead-Flow_Masterprompt.md` in `brand/research-prompt.md` übernehmen
- Logo-Reinzeichnung aus `logo.py` statt der gezeichneten Wortmarke in `src/lib/docs/logo.ts`
- Absenderdaten in `brand/tokens.json` nach der Gründung eintragen
