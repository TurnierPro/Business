"""Erzeugt den PDF-Monats-/Quartalsbericht für den Steuerberater (reportlab)."""

from __future__ import annotations

from datetime import datetime
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

import config

# ── Markenfarben ────────────────────────────────────────────────────────
GRUEN = colors.HexColor("#1E7D4E")
GRUEN_HELL = colors.HexColor("#E8F3EC")
DUNKEL = colors.HexColor("#1D1D1F")
GRAU = colors.HexColor("#6E6E73")
LINIE = colors.HexColor("#D2D2D7")
ROT = colors.HexColor("#C4241C")


def _euro(betrag: float) -> str:
    s = f"{betrag:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return f"{s} €"


def _styles():
    base = getSampleStyleSheet()
    styles = {
        "titel": ParagraphStyle(
            "titel", parent=base["Title"], fontName="Helvetica-Bold",
            fontSize=20, textColor=DUNKEL, spaceAfter=2, leading=24,
        ),
        "sub": ParagraphStyle(
            "sub", parent=base["Normal"], fontName="Helvetica",
            fontSize=10.5, textColor=GRAU, spaceAfter=2,
        ),
        "h2": ParagraphStyle(
            "h2", parent=base["Heading2"], fontName="Helvetica-Bold",
            fontSize=12.5, textColor=GRUEN, spaceBefore=16, spaceAfter=6,
        ),
        "normal": ParagraphStyle(
            "normal", parent=base["Normal"], fontName="Helvetica",
            fontSize=9.5, textColor=DUNKEL, leading=13,
        ),
        "klein": ParagraphStyle(
            "klein", parent=base["Normal"], fontName="Helvetica",
            fontSize=8.5, textColor=GRAU, leading=11,
        ),
        "zelle": ParagraphStyle(
            "zelle", parent=base["Normal"], fontName="Helvetica",
            fontSize=8.5, textColor=DUNKEL, leading=11,
        ),
    }
    return styles


def _uebersicht_tabelle(
    zeilen: list[list[str]], fett: int, rot_wenn_negativ: float,
    grau: tuple[int, ...] = (),
) -> Table:
    """Kompakter Kennzahlen-Block; Zeile `fett` ist die hervorgehobene Summenzeile,
    `grau` sind untergeordnete 'davon …'-Zeilen."""
    tab = Table(zeilen, colWidths=[110 * mm, 60 * mm])
    stil = [
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("TEXTCOLOR", (0, 0), (0, -1), DUNKEL),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LINEBELOW", (0, 0), (-1, -2), 0.4, LINIE),
        ("FONTNAME", (0, fett), (-1, fett), "Helvetica-Bold"),
        ("BACKGROUND", (0, fett), (-1, fett), GRUEN_HELL),
        ("TOPPADDING", (0, fett), (-1, fett), 8),
        ("BOTTOMPADDING", (0, fett), (-1, fett), 8),
    ]
    for g in grau:
        stil += [
            ("TEXTCOLOR", (0, g), (-1, g), GRAU),
            ("FONTSIZE", (0, g), (-1, g), 9),
        ]
    if rot_wenn_negativ < 0:
        stil.append(("TEXTCOLOR", (1, fett), (1, fett), ROT))
    tab.setStyle(TableStyle(stil))
    return tab


def _geldfluss_tabelle(analyse: dict) -> Table:
    belege = analyse.get("belege") or []
    durch_ein = sum(
        b["betrag_brutto"] for b in belege
        if b.get("typ") == "Ausgangsrechnung" and config.ist_durchlaufend(b)
    )
    durch_aus = sum(
        b["betrag_brutto"] for b in belege
        if b.get("typ") != "Ausgangsrechnung" and config.ist_durchlaufend(b)
    )

    zeilen = [["Eingegangen (Einnahmen)", _euro(analyse["einnahmen_gesamt"])]]
    grau: list[int] = []
    if durch_ein:
        grau.append(len(zeilen))
        zeilen.append(
            ["    davon durchlaufend (Startgelder/Camp-Gebühren der Vereine)",
             _euro(durch_ein)]
        )
    zeilen.append(["Rausgegangen (Ausgaben)", _euro(analyse["ausgaben_gesamt"])])
    if durch_aus:
        grau.append(len(zeilen))
        zeilen.append(
            ["    davon Auszahlungen an Vereine (durchlaufend)",
             _euro(durch_aus)]
        )
    zeilen.append(["Ergebnis (Einnahmen − Ausgaben)", _euro(analyse["ergebnis"])])
    fett = len(zeilen) - 1
    rot = analyse["ergebnis"]

    if durch_ein or durch_aus:
        echt = (analyse["einnahmen_gesamt"] - durch_ein) - (
            analyse["ausgaben_gesamt"] - durch_aus
        )
        zeilen.append(["Echtes Ergebnis (ohne durchlaufende Posten)", _euro(echt)])
        fett = len(zeilen) - 1
        rot = echt

    return _uebersicht_tabelle(zeilen, fett=fett, rot_wenn_negativ=rot, grau=tuple(grau))


def _steuern_tabelle(analyse: dict) -> Table:
    zahllast = analyse["vereinnahmte_umsatzsteuer"] - analyse["vorsteuer"]
    zahllast_label = (
        "USt-Zahllast — ans Finanzamt zu zahlen"
        if zahllast >= 0
        else "USt-Überhang — Erstattung vom Finanzamt"
    )
    zeilen = [
        ["Vereinnahmte Umsatzsteuer (in den Einnahmen)", _euro(analyse["vereinnahmte_umsatzsteuer"])],
        ["Abziehbare Vorsteuer (in den Ausgaben)", _euro(analyse["vorsteuer"])],
        [zahllast_label, _euro(abs(zahllast)) if zahllast < 0 else _euro(zahllast)],
    ]
    return _uebersicht_tabelle(zeilen, fett=2, rot_wenn_negativ=0)


def _tabelle(
    kopf: list[str], zeilen: list[list], breiten: list[float], styles,
    summe: list | None = None,
) -> Table:
    daten = [[Paragraph(f"<b>{h}</b>", styles["zelle"]) for h in kopf]]
    for z in zeilen:
        daten.append([Paragraph(str(c), styles["zelle"]) for c in z])
    if summe:
        daten.append([Paragraph(f"<b>{c}</b>", styles["zelle"]) for c in summe])
    stil = [
        ("BACKGROUND", (0, 0), (-1, 0), GRUEN),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTSIZE", (0, 0), (-1, -1), 8.5),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("LINEBELOW", (0, 1), (-1, -1), 0.4, LINIE),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#FAFAFA")]),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]
    if summe:
        stil += [
            ("BACKGROUND", (0, -1), (-1, -1), GRUEN_HELL),
            ("LINEABOVE", (0, -1), (-1, -1), 0.8, GRUEN),
        ]
    tab = Table(daten, colWidths=breiten, repeatRows=1)
    tab.setStyle(TableStyle(stil))
    return tab


def _kopf_fuss(canvas, doc):
    canvas.saveState()
    breite, hoehe = A4
    # Kopf-Balken
    canvas.setFillColor(GRUEN)
    canvas.rect(0, hoehe - 8 * mm, breite, 8 * mm, fill=1, stroke=0)
    # Fußzeile
    canvas.setFillColor(GRAU)
    canvas.setFont("Helvetica", 7.5)
    canvas.drawString(
        20 * mm, 10 * mm,
        f"{config.FIRMENNAME} · Erstellt am {datetime.now():%d.%m.%Y %H:%M} · TurnierPro Steuer-Cockpit",
    )
    canvas.drawRightString(breite - 20 * mm, 10 * mm, f"Seite {doc.page}")
    canvas.restoreState()


def erstelle_bericht(
    titel: str, zeitraum: str, monate: list[dict], ziel: Path
) -> Path:
    """monate: Liste von {'label': str, 'analyse': dict}."""
    styles = _styles()
    doc = SimpleDocTemplate(
        str(ziel), pagesize=A4,
        leftMargin=20 * mm, rightMargin=20 * mm,
        topMargin=22 * mm, bottomMargin=18 * mm,
        title=titel,
    )
    e = []
    e.append(Paragraph("TurnierPro — Steuerbericht", styles["titel"]))
    e.append(Paragraph(f"{config.FIRMENNAME}", styles["sub"]))
    e.append(Paragraph(f"Zeitraum: {zeitraum}", styles["sub"]))
    e.append(Spacer(1, 6))

    for eintrag in monate:
        analyse = eintrag["analyse"]
        e.append(Paragraph(eintrag["label"], styles["h2"]))
        e.append(Paragraph("Einnahmen & Ausgaben", styles["h2"]))
        e.append(_geldfluss_tabelle(analyse))
        e.append(Paragraph("Steuern (Umsatzsteuer)", styles["h2"]))
        e.append(_steuern_tabelle(analyse))

        if analyse.get("fehlende_belege"):
            e.append(Paragraph("Fehlende Belege", styles["h2"]))
            for f in analyse["fehlende_belege"]:
                e.append(Paragraph(f"• {f}", styles["normal"]))
        if analyse.get("hinweise"):
            e.append(Paragraph("Hinweise", styles["h2"]))
            for h in analyse["hinweise"]:
                e.append(Paragraph(f"• {h}", styles["normal"]))

        belege = analyse.get("belege") or []
        einnahmen = [b for b in belege if b.get("typ") == "Ausgangsrechnung"]
        ausgaben = [b for b in belege if b.get("typ") != "Ausgangsrechnung"]
        for titel, gruppe in (
            ("Einnahmen im Detail — was kam rein", einnahmen),
            ("Ausgaben im Detail — was ging raus", ausgaben),
        ):
            if not gruppe:
                continue
            e.append(Paragraph(titel, styles["h2"]))
            zeilen = [
                [
                    b["datum"], b["aussteller"][:60],
                    _euro(b["betrag_brutto"]),
                    _euro(b["umsatzsteuer"]) if b.get("umsatzsteuer") else "–",
                ]
                for b in gruppe
            ]
            summe = [
                "", "Summe",
                _euro(sum(b["betrag_brutto"] for b in gruppe)),
                _euro(sum(b.get("umsatzsteuer") or 0 for b in gruppe)),
            ]
            e.append(
                _tabelle(
                    ["Datum", "Aussteller / Empfänger", "Brutto", "USt"],
                    zeilen,
                    [22 * mm, 92 * mm, 28 * mm, 28 * mm],
                    styles,
                    summe=summe,
                )
            )
        e.append(Spacer(1, 8))

    doc.build(e, onFirstPage=_kopf_fuss, onLaterPages=_kopf_fuss)
    return ziel
