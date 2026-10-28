# TurnierPro · Unternehmens-App

Eine App für alles, was bei TurnierPro intern anfällt. Sie läuft lokal auf jedem
Mac, und beide Macs arbeiten über einen geteilten iCloud-Ordner mit denselben
Daten.

| Bereich | Was er kann | Herkunft |
|---|---|---|
| **Start** | Begrüßung, Heute dran, meine Aufgaben, Umsatzziel, Monatsabschluss-Status, Kalender der Turniere und Camps | Artefakt |
| **Vertrieb** | Vereine, Kontakte (Anruf, Mail, WhatsApp …), Pipeline, Wiedervorlagen, Auswertungen nach Zeitraum, Team und Bundesland | Artefakt |
| **Aufgaben** | zuweisen, Fälligkeit, Wiederholung (täglich bis jährlich), Priorität | Artefakt |
| **Projekte** | Tafel *Idee → Geplant → In Arbeit → Erledigt* mit Ziehen und Ablegen, Kommentare | Artefakt |
| **Finanzen** | Jahresübersicht, Einnahmen, Ausgaben, GuV aus der `Finanzübersicht_JAHR.xlsx` | Finanz-App |
| **Monatsabschluss** | Belege aus Postfach, Stripe und Qonto holen, KI-Prüfung, Bericht + Belegpaket + Mail-Entwurf für den Steuerberater | Finanz-App |
| **Einstellungen** | Ich/Team, Datenordner, Zugänge, Automatik, Import aus dem Artefakt, Export (PDF, Excel, Sicherung) | neu |

Einrichtung auf den Macs: siehe [`TurnierPro/Programm/ANLEITUNG.txt`](TurnierPro/Programm/ANLEITUNG.txt).

## Wie zwei Macs zusammenarbeiten

```
02_Finanzen/  (geteilter iCloud-Ordner)
├── 03_TurnierPro App/   sichtbar nur „TurnierPro installieren.command“,
│   └── Programm/        der Code (gleiche Version für beide)
├── 04_TurnierPro App - Daten/   (Name frei, muss „Daten“ enthalten)
│   ├── journal/<mac>.jsonl   jede Änderung als Zeile, je Mac eine eigene Datei
│   ├── geraete/<mac>.json    welcher Mac zuletzt aktiv war
│   └── cache/                KI-Prüfungen (geteilt, damit nichts doppelt kostet)
├── 01_Rechnungen/, 02_Kontoauszüge/
└── Finanzübersicht_JAHR.xlsx
```

* Jeder Mac schreibt nur in **seine eigene** Journaldatei. iCloud muss nie zwei
  Versionen derselben Datei zusammenführen, darum gibt es keine Konfliktkopien.
* Beim Lesen werden die Zeilen aller Macs nach Zeit sortiert und angewendet
  (`TurnierPro/Programm/speicher.py`). Ändern zwei Leute verschiedene Felder desselben
  Vereins, bleiben beide Änderungen erhalten. Beim selben Feld gewinnt die
  spätere.
* Die Oberfläche fragt alle 4 Sekunden nach, ob sich etwas geändert hat. Was der
  andere Mac schreibt, erscheint also, sobald iCloud die Datei übertragen hat.
* Zugangsdaten bleiben pro Mac in `~/Library/Application Support/TurnierPro`.
* Die Automatik (Belege ablegen, Monatsabschluss) läuft nur auf dem Mac, der in
  *Einstellungen › Automatik* festgelegt ist.

## Aufbau des Codes

```
TurnierPro/
├── TurnierPro installieren.command   einziger sichtbarer Eintrag für Max und Felix
└── Programm/
├── app.py               Flask-Server (localhost:8000), alle Schnittstellen
├── speicher.py          geteilter Speicher (Journal pro Mac)
├── geteilt.py           Zugriff auf den Speicher, Automatik-Mac
├── config.py            Pfade: Programm, lokal (pro Mac), geteilt
├── import_service.py    Import: Artefakt-Excel, Termine, Website-Besuche, Sicherung
├── export_service.py    Export: Excel, PDF, Sicherung
├── excel_service.py …   Finanzen: Excel lesen, Stripe, Qonto, Mail, KI-Prüfung, Bericht
├── templates/index.html Grundgerüst der Oberfläche
└── static/
    ├── css/app.css      Design (Markenfarben, Montserrat, Bausteine)
    ├── js/              kern, stammdaten, start, vertrieb, aufgaben, projekte,
    │                    finanzen, einstellungen, app
    ├── fonts/           Montserrat (SIL Open Font License)
    └── img/             Original-Logo und App-Symbol
tests/                   pytest: Speicher, Import/Export, Server
```

## Entwickeln und testen

```bash
cd TurnierPro/Programm
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt pytest
```

```bash
TP_DATEN_DIR=/tmp/tp-daten TP_LOKAL_DIR=/tmp/tp-lokal TP_KEINE_AUTOMATIK=1 .venv/bin/python app.py
```

```bash
cd ../.. && TurnierPro/Programm/.venv/bin/python -m pytest -q tests
```

Umgebungsvariablen für Tests und Entwicklung: `TP_DATEN_DIR` (geteilter
Ordner), `TP_LOKAL_DIR` (statt Application Support), `FINANZEN_ROOT`
(Finanzordner), `TP_KEINE_AUTOMATIK=1`, `TP_KEIN_BROWSER=1`.
