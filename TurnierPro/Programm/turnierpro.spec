# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller-Build für die TurnierPro-App (macOS .app, für build_app.command)."""

from PyInstaller.utils.hooks import collect_all

import os as _os
datas = [("templates", "templates"), ("static", "static")]
# Fest eingebaute Keys mitliefern, falls vorhanden
if _os.path.exists("app_defaults.json"):
    datas.append(("app_defaults.json", "."))
binaries = []
hiddenimports = []

# Abhängigkeiten mit Datendateien/Untermodulen vollständig einsammeln
for _mod in ("anthropic", "stripe", "reportlab", "openpyxl", "pydantic",
             "certifi", "httpx", "httpcore", "flask", "werkzeug", "jinja2", "rumps"):
    d, b, h = collect_all(_mod)
    datas += d
    binaries += b
    hiddenimports += h

a = Analysis(
    ["app.py"],
    pathex=[],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    runtime_hooks=[],
    excludes=["tkinter", "matplotlib", "numpy.tests"],
    noarchive=False,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz, a.scripts, [], exclude_binaries=True,
    name="TurnierPro", console=False,
    disable_windowed_traceback=False, argv_emulation=False,
)
coll = COLLECT(exe, a.binaries, a.datas, name="TurnierPro")

app = BUNDLE(
    coll,
    name="TurnierPro.app",
    icon="static/appicon.icns" if __import__("os").path.exists("static/appicon.icns") else None,
    bundle_identifier="com.turnierpro.cockpit",
    info_plist={
        "CFBundleName": "TurnierPro",
        "CFBundleDisplayName": "TurnierPro",
        "CFBundleShortVersionString": "1.0.0",
        "CFBundleVersion": "1.0.0",
        "NSHumanReadableCopyright": "© TurnierPro UG (haftungsbeschränkt)",
        "NSHighResolutionCapable": True,
        "LSMinimumSystemVersion": "12.0",
        # Menüleisten-Programm: lebt oben in der Leiste, kein Dock-Symbol nötig.
        "LSUIElement": True,
    },
)
