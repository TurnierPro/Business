# TurnierPro-App – Hinweise für Claude

- Max lernt programmieren. Erkläre jeden Schritt kurz und in einfachen Worten, auf Deutsch.
- Code, Kommentare und Oberfläche auf Deutsch (Bezeichner wie `verein`, `aufgabe`, `speichere`).
- Name immer „TurnierPro“ (zusammen, großes T und P). Du-Form in allen Texten.
- Aufbau: Flask-Server in `TurnierPro/app.py`, Oberfläche ohne Build-Schritt in `TurnierPro/static/js/*.js` (ES-Module) und `static/css/app.css`.
- Geteilte Daten (Vertrieb, Aufgaben, Projekte, Team …) nur über `speicher.py`/`geteilt.py` schreiben. Neue Bereiche in `SAMMLUNGEN` eintragen. Nie eine gemeinsame Datei von beiden Macs beschreiben lassen: jeder Mac schreibt nur in seine eigene Journaldatei.
- Zugangsdaten (API-Schlüssel, Passwörter) nur lokal über `config.speichere_einstellungen` (pro Mac), nie in den geteilten Ordner und nie ins Repository.
- Automatik (Belege ablegen, Monatsabschluss, alles mit Mailversand) nur ausführen, wenn `geteilt.ist_automatik_mac()` bzw. `darf_automatik_laufen()` zustimmt.
- Die `Finanzübersicht_JAHR.xlsx` wird nur gelesen.
- Design: Markenfarben Primärgrün `#1E7B4B`, Waldgrün `#1B5E3A`, Mintgrau `#E5EEE8`; Überschriften und Zahlen in Montserrat. Ein grüner Hauptknopf (`knopf haupt`) pro Ansicht, Status immer mit Wort (`pille`). Logo nur als Originaldatei `static/img/logo.png`, nie nachbauen, immer auf hellem Grund. Gedrucktes und Exporte immer hell.
- Sicherheit: ändernde Anfragen brauchen den Kopf `X-TurnierPro: 1` (macht `api()` in `kern.js`), keine Inline-Skripte (CSP), Nutzertexte immer mit `esc()` ausgeben. Server lauscht nur auf 127.0.0.1.
- Keine erfundenen Zahlen in der Oberfläche: Diagramme nur mit echten Daten, sonst ein leerer Zustand mit Hinweis.
- Vor dem Commit: `python -m pytest -q tests` (aus dem Repository-Ordner) und die Oberfläche einmal im Browser prüfen.
