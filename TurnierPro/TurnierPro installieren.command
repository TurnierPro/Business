#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
#  TurnierPro — Installation mit einem Doppelklick (auf jedem Mac einmal).
#
#  Richtet auf diesem Mac alles ein:
#    1. Python-Umgebung (außerhalb von iCloud, damit der Start schnell bleibt)
#    2. den Hintergrunddienst (Server + Automatik, startet mit dem Mac)
#    3. das Programm "TurnierPro" in /Applications
#    4. räumt die alte "TurnierPro Finanzen"-App auf (Daten bleiben erhalten)
#    5. öffnet das Programm einmal zur Kontrolle
#
#  Läuft beliebig oft, ohne Schaden anzurichten: Vorhandenes wird aktualisiert.
# ═══════════════════════════════════════════════════════════════════════════

set -u
APP_DIR="$(cd "$(dirname "$0")" && pwd)"
VENV="$HOME/Library/Application Support/TurnierPro/venv"
ZIEL_APP="/Applications/TurnierPro.app"
DIENST="de.turnierpro.app"
AGENT="$HOME/Library/LaunchAgents/$DIENST.plist"
LOG="$HOME/Library/Logs/TurnierPro.log"
ALT_DIENST="de.turnierpro.finanzen"

echo "── TurnierPro · Installation ──────────────────────────────────"
echo "Programmordner: $APP_DIR"
echo "Daten (geteilt): $(dirname "$APP_DIR")/TurnierPro Daten"
echo ""

abbruch() { echo ""; echo "❌ $1"; echo ""; echo "Fenster kann geschlossen werden."; read -r; exit 1; }

# ── 1. Python finden ──────────────────────────────────────────────────────
PYBIN=""
for kandidat in \
  /Library/Frameworks/Python.framework/Versions/3.14/bin/python3 \
  /Library/Frameworks/Python.framework/Versions/Current/bin/python3 \
  /opt/homebrew/bin/python3 \
  /usr/bin/python3
do
  [ -x "$kandidat" ] && { PYBIN="$kandidat"; break; }
done
[ -n "$PYBIN" ] || abbruch "Python 3 wurde nicht gefunden. Bitte von python.org installieren (Version 3.11 oder neuer) und dieses Skript erneut starten."
echo "① Python: $("$PYBIN" -V 2>&1) ($PYBIN)"

# ── 2. Virtuelle Umgebung ─────────────────────────────────────────────────
mkdir -p "$(dirname "$VENV")"
# Projektordner merken, damit das Programm ihn findet, egal wo er liegt.
echo "$APP_DIR" > "$(dirname "$VENV")/projektordner"
if [ ! -x "$VENV/bin/python" ]; then
  echo "② Lege Python-Umgebung an (einmalig, dauert kurz) …"
  "$PYBIN" -m venv "$VENV" || abbruch "Die Python-Umgebung konnte nicht angelegt werden."
else
  echo "② Python-Umgebung ist vorhanden."
fi
echo "   Installiere/aktualisiere die Pakete …"
"$VENV/bin/python" -m pip install --quiet --upgrade pip
"$VENV/bin/python" -m pip install --quiet -r "$APP_DIR/requirements.txt" \
  || abbruch "Die Pakete konnten nicht installiert werden (Internetverbindung?)."
"$VENV/bin/python" -m pip install --quiet pywebview \
  || abbruch "Das Programmfenster (pywebview) konnte nicht installiert werden."
"$VENV/bin/python" -c "import flask, anthropic, stripe, openpyxl, reportlab, dotenv, webview" \
  || abbruch "Die Installation ist unvollständig."
echo "   ✓ Pakete vollständig"

# ── 3. Hintergrunddienst (Server + Automatik) ───────────────────────────
echo "③ Richte den Hintergrunddienst ein …"
mkdir -p "$HOME/Library/LaunchAgents"
# Alte Finanz-App abmelden: ihr Dienst belegt sonst Port 8000. Einstellungen und
# Belege bleiben, die neue App übernimmt sie beim ersten Start.
launchctl bootout "gui/$(id -u)/$ALT_DIENST" 2>/dev/null
rm -f "$HOME/Library/LaunchAgents/$ALT_DIENST.plist"
launchctl bootout "gui/$(id -u)/$DIENST" 2>/dev/null
# Alte, von Hand gestartete Server-Instanzen beenden – sonst ist Port 8000 belegt.
for pid in $(lsof -tiTCP:8000 -sTCP:LISTEN 2>/dev/null); do kill "$pid" 2>/dev/null; done
sleep 1
sed -e "s|__APP_DIR__|$APP_DIR|g" -e "s|__PY__|$VENV/bin/python|g" -e "s|__LOG__|$LOG|g" \
  "$APP_DIR/starter/$DIENST.plist" > "$AGENT"
# Intel-Mac: ohne "arch -arm64" starten
[ "$(sysctl -n hw.optional.arm64 2>/dev/null)" = "1" ] || sed -i '' -e '/\/usr\/bin\/arch</d' -e '/>-arm64</d' "$AGENT"
launchctl bootstrap "gui/$(id -u)" "$AGENT" || abbruch "Der Hintergrunddienst konnte nicht gestartet werden."
for _ in $(seq 1 60); do
  /usr/bin/nc -z 127.0.0.1 8000 >/dev/null 2>&1 && break
  sleep 1
done
/usr/bin/nc -z 127.0.0.1 8000 >/dev/null 2>&1 || abbruch "Der Server ist nicht hochgekommen. Details: $LOG"
echo "   ✓ Server läuft dauerhaft im Hintergrund (auch nach Neustart)"

# ── 4. Programm in /Applications anlegen ─────────────────────────────────
echo "④ Lege \"TurnierPro\" in /Applications an …"
rm -rf "$ZIEL_APP" "/Applications/TurnierPro Finanzen.app" "/Applications/TurnierPro Dashboard.app"
mkdir -p "$ZIEL_APP/Contents/MacOS" "$ZIEL_APP/Contents/Resources" || abbruch "Kein Schreibrecht für /Applications."
cp "$APP_DIR/starter/Info.plist"      "$ZIEL_APP/Contents/Info.plist"
cp "$APP_DIR/starter/starte-turnierpro" "$ZIEL_APP/Contents/MacOS/starte-turnierpro"
cp "$APP_DIR/static/img/appicon.icns" "$ZIEL_APP/Contents/Resources/appicon.icns"
cp "$APP_DIR/fenster.py"              "$ZIEL_APP/Contents/Resources/fenster.py"   # kein iCloud-Zugriff nötig
chmod +x "$ZIEL_APP/Contents/MacOS/starte-turnierpro"
# Eigener Interpreter im Paket → das Fenster erscheint im Dock als TurnierPro, nicht als Python.
PYAPP="$("$VENV/bin/python" -c 'import sys,os; print(os.path.join(sys.base_prefix,"Resources/Python.app/Contents/MacOS/Python"))')"
if [ -x "$PYAPP" ]; then
  cp "$PYAPP" "$ZIEL_APP/Contents/MacOS/TurnierPro"
  # Kopie neu (lokal) signieren – mit der Original-Signatur beendet macOS sie sofort.
  codesign --force -s - "$ZIEL_APP/Contents/MacOS/TurnierPro" 2>/dev/null
fi
xattr -dr com.apple.quarantine "$ZIEL_APP" 2>/dev/null
touch "$ZIEL_APP"
echo "   ✓ Programm angelegt"
# Im Dock dauerhaft anheften (statt Python.app), falls noch nicht vorhanden
if ! defaults read com.apple.dock persistent-apps 2>/dev/null | grep -q "/Applications/TurnierPro.app"; then
  defaults write com.apple.dock persistent-apps -array-add "<dict><key>tile-data</key><dict><key>file-data</key><dict><key>_CFURLString</key><string>$ZIEL_APP</string><key>_CFURLStringType</key><integer>0</integer></dict></dict></dict>"
  killall Dock
fi
open -a "$ZIEL_APP"

cat <<HINWEIS

── Fertig ─────────────────────────────────────────────────────
Ab jetzt: "TurnierPro" über das Dock, Launchpad oder Spotlight
(⌘+Leertaste) starten. Ein altes Symbol "TurnierPro Finanzen"
im Dock kannst du herausziehen, es wird nicht mehr gebraucht.

Beim ersten Start fragt die App, wer an diesem Mac arbeitet.

Protokoll bei Problemen: $LOG

Dieses Fenster kann geschlossen werden.
HINWEIS
read -r
