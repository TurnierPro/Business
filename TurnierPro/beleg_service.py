"""Speichert hochgeladene Belege in den passenden Monatsordner.

Ausgaben  → 01_Rechnungen/<Jahr>/01_erhaltene/Q../MM_Monat/  (Eingangsrechnungen)
Einnahmen → 01_Rechnungen/<Jahr>/02_gestellte/Q../MM_Monat/  (Ausgangsrechnungen)
"""

from __future__ import annotations

from pathlib import Path

from werkzeug.utils import secure_filename

import config

ERLAUBTE_ENDUNGEN = {".pdf", ".png", ".jpg", ".jpeg", ".webp", ".heic", ".txt"}


def _sicherer_name(dateiname: str) -> str:
    name = secure_filename(dateiname or "")
    if not name:
        name = "Beleg.pdf"
    if Path(name).suffix.lower() not in ERLAUBTE_ENDUNGEN:
        raise ValueError(
            "Dateityp nicht erlaubt. Erlaubt: PDF, PNG, JPG, WEBP, HEIC, TXT."
        )
    return name


def speichere_beleg(jahr: int, typ: str, monat: int, dateiname: str, daten: bytes) -> dict:
    if typ not in ("ausgaben", "einnahmen"):
        raise ValueError("typ muss 'ausgaben' oder 'einnahmen' sein.")
    if not (1 <= int(monat) <= 12):
        raise ValueError("monat muss zwischen 1 und 12 liegen.")
    if not daten:
        raise ValueError("Leere Datei.")

    name = _sicherer_name(dateiname)

    if typ == "ausgaben":
        ordner = config.eingangsrechnungen_ordner(jahr, int(monat), anlegen=True)
    else:
        ordner = config.ausgangsrechnungen_ordner(jahr, int(monat), anlegen=True)

    # Inhalts-Deduplizierung: existiert im Ordner bereits eine Datei mit
    # exakt gleichem Inhalt, nichts erneut ablegen (egal unter welchem Namen).
    import hashlib

    neu_hash = hashlib.sha256(daten).digest()
    for vorhanden in ordner.iterdir():
        if not vorhanden.is_file():
            continue
        try:
            if vorhanden.stat().st_size == len(daten) and \
                    hashlib.sha256(vorhanden.read_bytes()).digest() == neu_hash:
                return {"datei": vorhanden.name, "ordner": str(ordner), "neu": False}
        except Exception:
            continue

    # Zweite Stufe: gleicher Name und gleiche Groesse, aber anderer Hash.
    # Genau so kam die IONOS-Rechnung vom 15.08. zweimal in den Ordner --
    # der Anbieter erzeugt das PDF bei jedem Versand neu, dabei aendert sich
    # nur die interne PDF-Kennung im Trailer (120 von 36.259 Bytes). Inhaltlich
    # ist es dieselbe Rechnung.
    import re as _re

    stamm_ohne_zaehler = _re.sub(r"_\d+$", "", Path(name).stem)
    for vorhanden in ordner.iterdir():
        if not vorhanden.is_file() or vorhanden.suffix.lower() != Path(name).suffix.lower():
            continue
        if _re.sub(r"_\d+$", "", vorhanden.stem) != stamm_ohne_zaehler:
            continue
        try:
            if vorhanden.stat().st_size == len(daten):
                return {"datei": vorhanden.name, "ordner": str(ordner), "neu": False,
                        "grund": "gleiche Rechnung, nur neu erzeugtes PDF"}
        except Exception:
            continue

    ziel = ordner / name
    stamm, endung = Path(name).stem, Path(name).suffix
    i = 1
    while ziel.exists():
        ziel = ordner / f"{stamm}_{i}{endung}"
        i += 1
    ziel.write_bytes(daten)

    return {"datei": ziel.name, "ordner": str(ordner), "neu": True}
