#!/bin/bash
# Baut die eigenständige TurnierPro.app + eine TurnierPro.dmg zum Weitergeben.
# Doppelklick oder im Terminal ausführen. Baut für die Architektur DIESES Macs
# (Apple Silicon ODER Intel) — für die jeweils andere auf einem solchen Mac erneut ausführen.

cd "$(dirname "$0")" || exit 1
echo "── TurnierPro App-Build ─────────────────────────────────────"

# Umgebung sicherstellen
if [ ! -d ".venv" ]; then
  python3 -m venv .venv || { echo "Python 3 nicht gefunden."; read -r; exit 1; }
fi
# shellcheck disable=SC1091
source .venv/bin/activate
python -m pip install --quiet --upgrade pip
python -m pip install --quiet -r requirements.txt pyinstaller

ARCH="$(uname -m)"
echo "Baue für Architektur: $ARCH"

# Build (Zwischendateien lokal in /tmp, damit iCloud nicht bremst)
WORK="/tmp/turnierpro_build"
rm -rf "$WORK" dist
pyinstaller turnierpro.spec --noconfirm --clean --workpath "$WORK" --distpath dist || {
  echo "Build fehlgeschlagen."; read -r; exit 1;
}

# DMG (Image-Datei) mit „In Programme ziehen"-Shortcut erzeugen
DMG="dist/TurnierPro-$ARCH.dmg"
STAGE="/tmp/turnierpro_dmg"
rm -f "$DMG"; rm -rf "$STAGE"; mkdir -p "$STAGE"
cp -R "dist/TurnierPro.app" "$STAGE/"
ln -s /Applications "$STAGE/Programme"
hdiutil create -volname "TurnierPro" -srcfolder "$STAGE" \
  -ov -format UDZO "$DMG" >/dev/null && echo "✓ Fertig: $DMG"
rm -rf "$STAGE"

echo ""
echo "Weitergeben: die Datei '$DMG'."
echo "Beim Kunden: DMG öffnen, TurnierPro.app in 'Programme' ziehen,"
echo "beim 1. Start Rechtsklick → Öffnen (unsignierte App)."
echo "─────────────────────────────────────────────────────────────"
read -r -p "Enter zum Schließen…"
