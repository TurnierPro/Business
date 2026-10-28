"""Durchsucht die Finanz-Ordner und meldet, welche Unterlagen pro Monat da sind.

Das ist die schnelle, kostenlose Vorprüfung (ohne API): existiert ein
Kontoauszug? Liegen Ein-/Ausgangsrechnungen vor?
"""

from __future__ import annotations

from pathlib import Path

import config


def _datei_info(pfad: Path) -> dict:
    stat = pfad.stat()
    return {
        "name": pfad.name,
        "groesse_kb": round(stat.st_size / 1024, 1),
        "pfad": str(pfad),
    }


def scan_monat(jahr: int, monat: int) -> dict:
    """Liefert eine Übersicht der vorhandenen Unterlagen für einen Monat."""
    kontoauszug = config.kontoauszug_pfad(monat)
    eingang = config.pdfs_im_ordner(config.eingangsrechnungen_ordner(jahr, monat))
    ausgang = config.pdfs_im_ordner(config.ausgangsrechnungen_ordner(jahr, monat))

    return {
        "jahr": jahr,
        "monat": monat,
        "monatsname": config.MONATSNAMEN[monat],
        "quartal": config.quartal_fuer_monat(monat),
        "kontoauszug": _datei_info(kontoauszug) if kontoauszug else None,
        "eingangsrechnungen": [_datei_info(p) for p in eingang],
        "ausgangsrechnungen": [_datei_info(p) for p in ausgang],
        "anzahl_eingang": len(eingang),
        "anzahl_ausgang": len(ausgang),
    }


def scan_quartal(jahr: int, quartal: int) -> list[dict]:
    """Übersicht für alle drei Monate eines Quartals."""
    erster = (quartal - 1) * 3 + 1
    return [scan_monat(jahr, m) for m in range(erster, erster + 3)]


def checkliste(monatsscan: dict) -> list[dict]:
    """Erzeugt die Steuerberater-Checkliste aus einem Monatsscan."""
    return [
        {
            "aufgabe": "Kontoauszug Geschäftskonto (Monatsauszug)",
            "erledigt": monatsscan["kontoauszug"] is not None,
            "hinweis": "PDF im Ordner 02_Kontoauszüge ablegen"
            if monatsscan["kontoauszug"] is None
            else monatsscan["kontoauszug"]["name"],
        },
        {
            "aufgabe": "Eingangsrechnungen (erhaltene Belege)",
            "erledigt": monatsscan["anzahl_eingang"] > 0,
            "hinweis": f"{monatsscan['anzahl_eingang']} Datei(en) im Ordner 01_erhaltene",
        },
        {
            "aufgabe": "Ausgangsrechnungen (gestellte Rechnungen)",
            "erledigt": monatsscan["anzahl_ausgang"] > 0,
            "hinweis": f"{monatsscan['anzahl_ausgang']} Datei(en) im Ordner 02_gestellte"
            + (" — ggf. per Stripe abrufen" if monatsscan["anzahl_ausgang"] == 0 else ""),
        },
    ]
