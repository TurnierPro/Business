#!/bin/bash
# Levarex OS auf dem Mac starten: Doppelklick auf diese Datei.
# Beim ersten Mal dauert es ein paar Minuten (Bibliotheken und Chromium werden geladen).

cd "$(dirname "$0")" || exit 1
echo "Levarex OS wird gestartet ..."

if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "Node.js fehlt. Bitte die LTS-Version von nodejs.org installieren und danach erneut doppelklicken."
  open "https://nodejs.org/de/download"
  read -r -p "Enter drücken zum Schließen."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Erster Start: Bibliotheken werden installiert ..."
  npm install || { read -r -p "Installation fehlgeschlagen. Enter drücken zum Schließen."; exit 1; }
  echo "Chromium für die PDFs wird geladen ..."
  npx playwright-core install chromium
fi

# Läuft noch eine alte Levarex OS (oder etwas anderes) auf Port 3000? Dann startet die neue nicht.
ALT=$(lsof -ti :3000 2>/dev/null)
if [ -n "$ALT" ]; then
  echo ""
  echo "Auf http://localhost:3000 läuft noch ein Programm (vermutlich die alte Levarex OS)."
  read -r -p "Beenden und neu starten? (j/n) " ANTWORT
  if [ "$ANTWORT" = "j" ] || [ "$ANTWORT" = "J" ]; then
    echo "$ALT" | xargs kill 2>/dev/null
    sleep 2
  else
    echo "Abgebrochen. Die laufende Version bleibt unter http://localhost:3000 erreichbar."
    read -r -p "Enter drücken zum Schließen."
    exit 0
  fi
fi

# Neu bauen, wenn sich der Code geändert hat
STAND=$(find src brand drizzle package.json -type f -newer .next/BUILD_ID 2>/dev/null | head -1)
if [ ! -f .next/BUILD_ID ] || [ -n "$STAND" ]; then
  echo "Levarex OS wird gebaut ..."
  npm run build || { read -r -p "Bauen fehlgeschlagen. Enter drücken zum Schließen."; exit 1; }
fi

( until curl -s -o /dev/null http://localhost:3000/api/gesundheit; do sleep 1; done; open "http://localhost:3000" ) &

echo ""
echo "Levarex OS läuft unter http://localhost:3000"
echo "Zum Beenden dieses Fenster schließen oder ctrl+c drücken."
echo ""
npm start
