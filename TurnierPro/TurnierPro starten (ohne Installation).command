#!/bin/bash
# TurnierPro — Doppelklick zum Starten (ohne Installation, z. B. zum Ausprobieren).
# Legt beim ersten Start automatisch die Umgebung an und installiert alles.

cd "$(dirname "$0")" || exit 1

echo "── TurnierPro ─────────────────────────────────────────────"

# Virtuelle Umgebung. Sie liegt bewusst außerhalb von iCloud – dort muss macOS
# beim Kaltstart erst jedes Paket herunterladen, das dauerte rund drei Minuten.
VENV="$HOME/Library/Application Support/TurnierPro/venv"
if [ ! -d "$VENV" ]; then
  echo "Erstelle virtuelle Umgebung (einmalig) …"
  mkdir -p "$(dirname "$VENV")"
  python3 -m venv "$VENV" || { echo "Python 3 nicht gefunden."; read -r; exit 1; }
fi

# shellcheck disable=SC1091
source "$VENV/bin/activate"

# Abhängigkeiten sicherstellen
if ! python -c "import flask, anthropic, reportlab, stripe, openpyxl, dotenv" 2>/dev/null; then
  echo "Installiere Abhängigkeiten (einmalig) …"
  python -m pip install --quiet --upgrade pip
  python -m pip install --quiet -r requirements.txt
fi

echo "Starte Server … das Browserfenster öffnet sich automatisch."
echo "Zum Beenden dieses Fenster schließen oder Strg+C drücken."
echo "───────────────────────────────────────────────────────────"
python app.py
