"""Erzeugt die monatliche Provisions-Aufstellung als PDF-Beleg.

Für den Steuerberater: dokumentiert, dass bei Camps/Turnieren nur die 3 %
Provision Erlös von TurnierPro sind und der Rest ein durchlaufender Posten
(Weiterleitung an den Veranstalter) ist.
"""

from __future__ import annotations

from datetime import datetime
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

import config

GRUEN = colors.HexColor("#1E7D4E")
GRUEN_HELL = colors.HexColor("#E8F3EC")
DUNKEL = colors.HexColor("#1D1D1F")
GRAU = colors.HexColor("#6E6E73")
LINIE = colors.HexColor("#D2D2D7")


def _euro(b: float) -> str:
    s = f"{b:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return f"{s} €"


def _kopf_fuss(canvas, doc):
    canvas.saveState()
    breite, hoehe = A4
    canvas.setFillColor(GRUEN)
    canvas.rect(0, hoehe - 8 * mm, breite, 8 * mm, fill=1, stroke=0)
    canvas.setFillColor(GRAU)
    canvas.setFont("Helvetica", 7.5)
    canvas.drawString(20 * mm, 10 * mm,
                      f"{config.FIRMENNAME} · Erstellt am {datetime.now():%d.%m.%Y %H:%M} · Provisions-Aufstellung")
    canvas.drawRightString(breite - 20 * mm, 10 * mm, f"Seite {doc.page}")
    canvas.restoreState()


def erstelle_zahlungsbelege(jahr: int, monat: int, zahlungen: list[dict], ziel: Path) -> Path:
    """Erzeugt eine monatliche Zahlungsbeleg-Liste (alle Stripe-Einzelzahlungen) als PDF."""
    base = getSampleStyleSheet()
    titel = ParagraphStyle("t", parent=base["Title"], fontName="Helvetica-Bold",
                           fontSize=18, textColor=DUNKEL, spaceAfter=2, leading=22)
    sub = ParagraphStyle("s", parent=base["Normal"], fontName="Helvetica",
                         fontSize=10, textColor=GRAU, spaceAfter=2)
    zelle = ParagraphStyle("z", parent=base["Normal"], fontName="Helvetica",
                           fontSize=8, textColor=DUNKEL, leading=10)
    monatsname = config.MONATSNAMEN[monat]
    doc = SimpleDocTemplate(str(ziel), pagesize=A4, leftMargin=16 * mm, rightMargin=16 * mm,
                            topMargin=22 * mm, bottomMargin=18 * mm,
                            title=f"Zahlungsbelege {monatsname} {jahr}")
    e = [Paragraph("Stripe-Zahlungsbelege", titel),
         Paragraph(config.FIRMENNAME, sub),
         Paragraph(f"Zeitraum: {monatsname} {jahr} · {len(zahlungen)} Zahlungen", sub),
         Spacer(1, 6)]
    if not zahlungen:
        e.append(Paragraph("Keine Zahlungen in diesem Monat.", sub))
        doc.build(e, onFirstPage=_kopf_fuss, onLaterPages=_kopf_fuss)
        return ziel

    kopf = ["Datum", "Beleg-Nr.", "Art", "Beschreibung", "Betrag"]
    daten = [[Paragraph(f"<b>{h}</b>", zelle) for h in kopf]]
    summe = 0.0
    for z in zahlungen:
        summe += z.get("betrag", 0)
        daten.append([
            Paragraph(z.get("datum", ""), zelle),
            Paragraph(str(z.get("beleg_nr", "")), zelle),
            Paragraph(z.get("art", ""), zelle),
            Paragraph((z.get("beschreibung", "") or "")[:52], zelle),
            Paragraph(_euro(z.get("betrag", 0)), zelle),
        ])
    tab = Table(daten, colWidths=[22 * mm, 26 * mm, 20 * mm, 78 * mm, 26 * mm], repeatRows=1)
    tab.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), GRUEN),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("ALIGN", (4, 0), (4, -1), "RIGHT"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("LINEBELOW", (0, 1), (-1, -1), 0.4, LINIE),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#FAFAFA")]),
    ]))
    e.append(tab)
    e.append(Spacer(1, 8))
    st = Table([["Summe Zahlungseingänge", _euro(summe)]], colWidths=[146 * mm, 26 * mm])
    st.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("ALIGN", (1, 0), (1, 0), "RIGHT"),
        ("BACKGROUND", (0, 0), (-1, 0), GRUEN_HELL),
        ("TOPPADDING", (0, 0), (-1, -1), 7), ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    e.append(st)
    doc.build(e, onFirstPage=_kopf_fuss, onLaterPages=_kopf_fuss)
    return ziel


def erstelle_provisionsbeleg(jahr: int, monat: int, positionen: list[dict], ziel: Path) -> Path:
    base = getSampleStyleSheet()
    titel = ParagraphStyle("t", parent=base["Title"], fontName="Helvetica-Bold",
                           fontSize=18, textColor=DUNKEL, spaceAfter=2, leading=22)
    sub = ParagraphStyle("s", parent=base["Normal"], fontName="Helvetica",
                         fontSize=10, textColor=GRAU, spaceAfter=2)
    h2 = ParagraphStyle("h2", parent=base["Heading2"], fontName="Helvetica-Bold",
                        fontSize=12, textColor=GRUEN, spaceBefore=14, spaceAfter=6)
    zelle = ParagraphStyle("z", parent=base["Normal"], fontName="Helvetica",
                           fontSize=8.5, textColor=DUNKEL, leading=11)
    hinweis = ParagraphStyle("hw", parent=base["Normal"], fontName="Helvetica",
                             fontSize=8.5, textColor=GRAU, leading=12)

    monatsname = config.MONATSNAMEN[monat]
    doc = SimpleDocTemplate(str(ziel), pagesize=A4, leftMargin=20 * mm, rightMargin=20 * mm,
                            topMargin=22 * mm, bottomMargin=18 * mm,
                            title=f"Provisions-Aufstellung {monatsname} {jahr}")
    e = []
    e.append(Paragraph("Provisions-Aufstellung", titel))
    e.append(Paragraph(config.FIRMENNAME, sub))
    e.append(Paragraph(f"Zeitraum: {monatsname} {jahr}", sub))
    e.append(Spacer(1, 4))

    if not positionen:
        e.append(Paragraph("In diesem Monat gab es keine Camp- oder Turnier-Zahlungen.", hinweis))
        doc.build(e, onFirstPage=_kopf_fuss, onLaterPages=_kopf_fuss)
        return ziel

    brutto = sum(p["brutto"] for p in positionen)
    provision = sum(p["provision"] for p in positionen)
    durchlauf = round(brutto - provision, 2)

    # Detailtabelle
    kopf = ["Datum", "Art", "Veranstaltung", "Teilnehmer", "Brutto", "Satz", "Provision"]
    daten = [[Paragraph(f"<b>{h}</b>", zelle) for h in kopf]]
    for p in positionen:
        daten.append([
            Paragraph(p["datum"], zelle),
            Paragraph(p["art"], zelle),
            Paragraph(p["veranstaltung"][:34], zelle),
            Paragraph(p["teilnehmer"][:26], zelle),
            Paragraph(_euro(p["brutto"]), zelle),
            Paragraph(f"{p['satz'] * 100:.0f} %", zelle),
            Paragraph(_euro(p["provision"]), zelle),
        ])
    tab = Table(daten, colWidths=[20 * mm, 15 * mm, 42 * mm, 34 * mm, 22 * mm, 12 * mm, 22 * mm], repeatRows=1)
    tab.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), GRUEN),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTSIZE", (0, 0), (-1, -1), 8.5),
        ("ALIGN", (4, 0), (6, -1), "RIGHT"),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("LINEBELOW", (0, 1), (-1, -1), 0.4, LINIE),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#FAFAFA")]),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    e.append(tab)

    provision_netto = round(provision / 1.19, 2)
    provision_ust = round(provision - provision_netto, 2)

    # Zusammenfassung
    e.append(Paragraph("Zusammenfassung", h2))
    zus = [
        ["Brutto vereinnahmt (Camps/Turniere)", _euro(brutto)],
        ["durchlaufend an Veranstalter (kein Erlös)", _euro(durchlauf)],
        ["Provision TurnierPro brutto (inkl. USt)", _euro(provision)],
        ["  darin enthaltene Umsatzsteuer (19 %)", _euro(provision_ust)],
        ["Provision netto (Erlös)", _euro(provision_netto)],
    ]
    zt = Table(zus, colWidths=[120 * mm, 47 * mm])
    zt.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LINEBELOW", (0, 0), (-1, -2), 0.4, LINIE),
        ("FONTNAME", (0, 2), (-1, 2), "Helvetica-Bold"),
        ("TEXTCOLOR", (0, 3), (-1, 3), GRAU),
        ("FONTNAME", (0, 4), (-1, 4), "Helvetica-Bold"),
        ("BACKGROUND", (0, 4), (-1, 4), GRUEN_HELL),
        ("TEXTCOLOR", (0, 4), (-1, 4), colors.HexColor("#065F46")),
    ]))
    e.append(zt)

    e.append(Spacer(1, 10))
    e.append(Paragraph(
        "Hinweis: Bei Camp- und Turnierzahlungen vereinnahmt TurnierPro den vollen Betrag "
        "über Stripe und leitet ihn abzüglich der Vermittlungsprovision an den jeweiligen "
        "Veranstalter weiter. Erlös von TurnierPro ist ausschließlich die ausgewiesene "
        "Provision; diese versteht sich brutto und enthält 19 % Umsatzsteuer. Der "
        "durchlaufende Anteil ist ein Weiterleitungsposten und kein Umsatz.",
        hinweis))

    doc.build(e, onFirstPage=_kopf_fuss, onLaterPages=_kopf_fuss)
    return ziel
