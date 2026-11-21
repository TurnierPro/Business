# Etappe 9: Auftrag an Lovable (Entwurf, noch nicht gesendet)

**Status:** wartet auf Maximilians Freigabe. Gesendet wird erst nach seinem OK, weil der Auftrag Lovable-Credits kostet und viel Code entfernt.

## Was im Lovable-Projekt heute steckt (gelesen am 21.11.2026)

Projekt „Levax Company Web Foundation“ (`f881e092-…`), nicht veröffentlicht, zuletzt bearbeitet am 21.11.2026 um 20:49.

- Öffentliche Website: Start, Leistungen, Kosten, Ablauf, Fragen, Impressum, Datenschutz, Barrierefreiheit.
- **Dazu ein komplettes zweites Kundenportal mit Admin-Center:**
  - etwa 50 Bausteine unter `src/components/portal/` (Anmeldung mit Code, Zweiter Faktor, Angebote, Freigaben, Aufgaben, Lexware, Postausgang, Mails);
  - Supabase-Anbindung (`src/integrations/supabase/`) und Server-Dienste (`src/lib/dienst/`);
  - Etappen-Dokumente 3 bis 11 unter `docs/`.

Das überschneidet sich mit Levarex OS (Portal, Admin, Postausgang, Lexware).

**Vor dem Senden zu klären:**
- Soll dieses Portal wirklich raus? Laut Bauplan ja: Website und Portal getrennt, das Portal ist Levarex OS.
- Arbeitet gerade jemand daran? Die letzte Bearbeitung war heute Abend.
- Läuft noch etwas in der Supabase-Datenbank (Frankfurt)? Dann braucht es einen Plan zum Abschalten.

## Auftragstext für Lovable (plan_mode zuerst)

> **Ziel:** Diese Website wird nur noch die öffentliche Seite von Levarex Consulting. Kundenportal und Admin-Center laufen künftig in einem eigenen System („Mein Levarex“ unter https://portal.levarex-consulting.de). **Nichts veröffentlichen.**
>
> 1. **Portal und Admin entfernen:**
>    - alle Routen, Bausteine und Server-Dienste des Portals und Admin-Centers entfernen, also `src/components/portal/*`, Portal-Routen, `src/lib/dienst/*`, sofern nur fürs Portal;
>    - dazu Service-Worker und Offline-Seite des Portals (`public/portal-*`).
>    - Die Supabase-Anbindung nur entfernen, wenn die Website sie danach nicht mehr braucht.
>    - Die Git-Historie bleibt, damit nichts verloren geht.
> 2. **Link „Kundenportal“:** in Kopf und Fuß auf https://portal.levarex-consulting.de, als normaler Link (kein Messing-Knopf; der bleibt beim Haupt-Handlungsaufruf).
> 3. **Kontaktformular:**
>    - Das Formular schickt an eine eigene Server-Route der Website (nicht direkt aus dem Browser).
>    - Diese ruft `POST https://os.levarex-consulting.de/api/v1/nachrichten` auf, mit `Authorization: Bearer <Secret LEVAREX_API_SCHLUESSEL>`.
>    - Inhalt: `{ kanal: "formular", absender: <E-Mail oder Telefon>, name, betreff: "Anfrage über levarex-consulting.de", inhalt: <Nachricht> }`.
>    - Den Schlüssel nur als Lovable-Secret, nie im Browser-Code.
>    - Spam-Schutz mit verstecktem Feld und höchstens 5 Anfragen je Stunde und IP.
>    - Nach dem Absenden der Text: „Danke. Wir melden uns innerhalb von zwei Werktagen.“ Keine Kopie per Mail an die Absenderin oder den Absender.
> 4. **Datenschutzerklärung:** Abschnitt Kontaktformular anpassen (Weiterleitung an das eigene System von Levarex auf einem Server in der EU).
> 5. **Akzeptanzkriterien:**
>    - keine Route unter `/portal`, `/intern`, `/admin` mehr;
>    - Build ohne Fehler;
>    - Formular funktioniert gegen eine Test-Adresse;
>    - keine Cookies, keine Besucherstatistik;
>    - Lighthouse mobil ≥ 95 auf der Startseite.

## Kosten und Ablauf

- **Schätzung:** 1 Planungsnachricht plus 1 Umsetzung plus 1 bis 2 Korrekturen, also etwa 4 bis 8 Credits. Das Entfernen vieler Dateien kann mehr kosten. Den Plan vorher lesen.
- **Danach:** `get_diff` lesen. Prüfen, dass nur Portal und Admin entfernt wurden, die öffentlichen Seiten unverändert sind und kein Schlüssel im Code steht.
- **In Levarex OS:** einen API-Schlüssel nur mit dem Recht „nachrichten“ erzeugen (Name „Website-Formular“). Ihn in Lovable als Secret `LEVAREX_API_SCHLUESSEL` eintragen. Das macht Maximilian selbst, nicht über den Chat.
