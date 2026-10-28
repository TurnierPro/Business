"""Baut das ZIP-Belegpaket für den Steuerberater."""

from __future__ import annotations

import zipfile
from pathlib import Path

import config


def _fuege_hinzu(zf: zipfile.ZipFile, quelle: Path, zielname: str) -> None:
    if quelle and quelle.is_file():
        zf.write(quelle, zielname)


def baue_monatspaket(jahr: int, monat: int, bericht_pdf: Path | None, ziel: Path) -> Path:
    """Erzeugt ein ZIP mit Bericht, Kontoauszug und allen Rechnungen des Monats."""
    monatsname = config.MONATSNAMEN[monat]
    with zipfile.ZipFile(ziel, "w", zipfile.ZIP_DEFLATED) as zf:
        if bericht_pdf and bericht_pdf.is_file():
            _fuege_hinzu(zf, bericht_pdf, f"00_Bericht_{jahr}-{monat:02d}.pdf")

        konto = config.kontoauszug_pfad(monat)
        _fuege_hinzu(zf, konto, f"01_Kontoauszug/{konto.name}") if konto else None

        for p in config.pdfs_im_ordner(config.eingangsrechnungen_ordner(jahr, monat)):
            _fuege_hinzu(zf, p, f"02_Eingangsrechnungen/{p.name}")

        for p in config.pdfs_im_ordner(config.ausgangsrechnungen_ordner(jahr, monat)):
            _fuege_hinzu(zf, p, f"03_Ausgangsrechnungen/{p.name}")
    return ziel


def baue_quartalspaket(jahr: int, quartal: int, bericht_pdf: Path | None, ziel: Path) -> Path:
    erster = (quartal - 1) * 3 + 1
    with zipfile.ZipFile(ziel, "w", zipfile.ZIP_DEFLATED) as zf:
        if bericht_pdf and bericht_pdf.is_file():
            _fuege_hinzu(zf, bericht_pdf, f"00_Bericht_{jahr}-Q{quartal}.pdf")
        for monat in range(erster, erster + 3):
            mn = f"{monat:02d}_{config.MONATSNAMEN[monat]}"
            konto = config.kontoauszug_pfad(monat)
            if konto:
                _fuege_hinzu(zf, konto, f"{mn}/01_Kontoauszug/{konto.name}")
            for p in config.pdfs_im_ordner(config.eingangsrechnungen_ordner(jahr, monat)):
                _fuege_hinzu(zf, p, f"{mn}/02_Eingangsrechnungen/{p.name}")
            for p in config.pdfs_im_ordner(config.ausgangsrechnungen_ordner(jahr, monat)):
                _fuege_hinzu(zf, p, f"{mn}/03_Ausgangsrechnungen/{p.name}")
    return ziel
