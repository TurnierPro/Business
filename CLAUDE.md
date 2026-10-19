# Stelax OS – Hinweise für Claude

- Max lernt programmieren. Erkläre jeden Schritt kurz und in einfachen Worten, auf Deutsch.
- Code, Kommentare und Oberfläche auf Deutsch (Bezeichner wie `betrieb`, `freigeben`, `postausgang`).
- Grundregel: Nichts verlässt das System ohne Freigabe im Postausgang (`src/lib/ablauf/postausgang.ts`). Kein neuer Versandweg an dieser Tür vorbei.
- Jeder Fremddienst bekommt einen Adapter in `src/lib/adapters/` mit Simulator; echt nur, wenn die Zugangsdaten gesetzt sind. In `dienste.ts` eintragen.
- Design: dunkles Markenthema aus `brand/tokens.json` und `src/app/globals.css`; ein Messing-Knopf (`knopf haupt`) pro Ansicht; Status immer mit Wort. Gedrucktes immer hell.
- Rechtliche Festwerte (AGB-Version, Basiszins, Fristen) nur in `src/lib/recht.ts`; Pflichtangaben § 35a aus `brand/tokens.json`.
- Texte für Kunden folgen `brand/stimme.md`. Keine Preise, Zahlen oder Zusagen, die nicht in den Daten stehen.
- Schemaänderung: `src/lib/db/schema.ts` ändern, dann `npm run db:generate`, Migration mit committen.
- Vor dem Commit: `npm run typecheck` und `npm test` (Tests brauchen Chromium, ggf. `CHROMIUM_PATH` setzen).
