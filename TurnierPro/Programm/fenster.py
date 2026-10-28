"""TurnierPro — eigenes Programmfenster.

Der Server läuft dauerhaft als Hintergrunddienst (LaunchAgent
de.turnierpro.app), damit Belegablage und Monatsabschluss am 3. auch
ohne geöffnetes Fenster laufen. Dieses Programm zeigt nur das Fenster an;
läuft der Dienst nicht, wird er angestoßen bzw. der Server selbst gestartet.

Der Installer kopiert diese Datei ins App-Paket (Contents/Resources): Das per
Doppelklick gestartete Programm darf nicht ohne Weiteres aus iCloud Drive lesen
("Operation not permitted"). Den Projektordner reicht der Starter als
TP_APP_DIR herein – er wird nur für den Notfall-Serverstart gebraucht.
"""

from __future__ import annotations

import os
import socket
import subprocess
import sys
import time
from pathlib import Path

PORT = 8000
URL = f"http://127.0.0.1:{PORT}"
DIENST = "de.turnierpro.app"
HIER = Path(__file__).resolve().parent
APP_DIR = Path(os.environ.get("TP_APP_DIR") or HIER)
LOG = Path.home() / "Library/Logs/TurnierPro.log"


def _laeuft() -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(("127.0.0.1", PORT)) == 0


def _warte(sekunden: float) -> bool:
    ende = time.monotonic() + sekunden
    while time.monotonic() < ende:
        if _laeuft():
            return True
        time.sleep(0.3)
    return False


def _server_sicherstellen() -> bool:
    if _laeuft():
        return True
    # Erst den Hintergrunddienst anstoßen …
    subprocess.run(["/bin/launchctl", "kickstart", f"gui/{os.getuid()}/{DIENST}"],
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if _warte(10):
        return True
    # … und falls es den Dienst nicht gibt, den Server selbst starten.
    with open(LOG, "a") as log:
        subprocess.Popen([sys.executable, "-u", str(APP_DIR / "app.py")], cwd=APP_DIR,
                         env={**os.environ, "TP_KEIN_BROWSER": "1"},
                         stdout=log, stderr=log, start_new_session=True)
    return _warte(60)


def _dock_icon() -> None:
    try:
        from AppKit import NSApplication, NSImage

        kandidaten = [HIER / "appicon.icns", APP_DIR / "static" / "img" / "appicon.icns"]
        datei = next((k for k in kandidaten if k.is_file()), None)
        if datei is None:
            return
        bild = NSImage.alloc().initWithContentsOfFile_(str(datei))
        if bild:
            NSApplication.sharedApplication().setApplicationIconImage_(bild)
    except Exception:
        pass


def main() -> None:
    import webview

    if not _server_sicherstellen():
        subprocess.run(["/usr/bin/osascript", "-e",
                        'display dialog "Der TurnierPro-Server startet nicht. Details stehen in '
                        '~/Library/Logs/TurnierPro.log" with title "TurnierPro" '
                        'buttons {"OK"} with icon caution'])
        return
    webview.settings["ALLOW_DOWNLOADS"] = True  # Bericht, Belegpaket, Exporte
    webview.create_window("TurnierPro", URL,
                          width=1440, height=920, min_size=(1000, 680))
    webview.start(_dock_icon)


if __name__ == "__main__":
    main()
