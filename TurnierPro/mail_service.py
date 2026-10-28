"""Erzeugt einen fertigen E-Mail-Entwurf (.eml) an den Steuerberater.

Der Entwurf enthält Empfänger, Betreff, eine Zusammenfassung als Text und die
Anhänge (PDF-Bericht + ZIP-Belegpaket). Er wird NICHT versendet — der Nutzer
öffnet die .eml-Datei in seinem Mail-Programm, prüft sie und schickt sie selbst.
"""

from __future__ import annotations

import mimetypes
from email.message import EmailMessage
from pathlib import Path

import config


def _euro(betrag: float) -> str:
    s = f"{betrag:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return f"{s} €"


def _summe(monate_analyse: list[dict]) -> dict:
    ein = sum(m["analyse"]["einnahmen_gesamt"] for m in monate_analyse)
    aus = sum(m["analyse"]["ausgaben_gesamt"] for m in monate_analyse)
    ustv = sum(m["analyse"]["vereinnahmte_umsatzsteuer"] for m in monate_analyse)
    vst = sum(m["analyse"]["vorsteuer"] for m in monate_analyse)
    fehlend = sum(len(m["analyse"].get("fehlende_belege", [])) for m in monate_analyse)
    durch_ein = durch_aus = 0.0
    for m in monate_analyse:
        for b in m["analyse"].get("belege") or []:
            if config.ist_durchlaufend(b):
                if b.get("typ") == "Ausgangsrechnung":
                    durch_ein += b["betrag_brutto"]
                else:
                    durch_aus += b["betrag_brutto"]
    return {
        "einnahmen": round(ein, 2), "ausgaben": round(aus, 2),
        "ergebnis": round(ein - aus, 2), "ust": round(ustv, 2),
        "vorsteuer": round(vst, 2), "zahllast": round(ustv - vst, 2),
        "fehlende": fehlend,
        "durch_ein": round(durch_ein, 2), "durch_aus": round(durch_aus, 2),
        "ergebnis_echt": round((ein - durch_ein) - (aus - durch_aus), 2),
    }


def _text(zeitraum: str, s: dict, bericht_name: str, paket_name: str) -> str:
    zeilen = [
        f"Sehr geehrte Damen und Herren,",
        "",
        f"anbei die Unterlagen für den Zeitraum {zeitraum}.",
        "",
        "Zusammenfassung:",
        f"  Einnahmen:               {_euro(s['einnahmen'])}",
        f"  Ausgaben:                {_euro(s['ausgaben'])}",
        f"  Ergebnis:                {_euro(s['ergebnis'])}",
        f"  Vereinnahmte USt:        {_euro(s['ust'])}",
        f"  Abziehbare Vorsteuer:    {_euro(s['vorsteuer'])}",
        f"  USt-Zahllast:            {_euro(s['zahllast'])}",
    ]
    if s.get("durch_ein") or s.get("durch_aus"):
        zeilen += [
            "",
            "Durchlaufende Posten (eingesammelte und weitergeleitete Gelder,",
            "z. B. Startgelder und Camp-Gebühren — kein Umsatz/Aufwand von TurnierPro):",
            f"  In den Einnahmen enthalten: {_euro(s['durch_ein'])}",
            f"  In den Ausgaben enthalten:  {_euro(s['durch_aus'])}",
            f"  Echtes Ergebnis (ohne durchlaufende Posten): {_euro(s['ergebnis_echt'])}",
        ]
    zeilen += [
        "",
        "Im Anhang:",
        f"  - {bericht_name} (Zusammenfassung als PDF)",
        f"  - {paket_name} (Kontoauszug, Ein- und Ausgangsrechnungen)",
    ]
    if s["fehlende"]:
        zeilen += [
            "",
            f"Hinweis: Zu {s['fehlende']} Kontobewegung(en) liegt derzeit noch kein "
            "Beleg vor (Details im PDF-Bericht).",
        ]
    zeilen += [
        "",
        "Für Rückfragen stehen wir gerne zur Verfügung.",
        "",
        "Mit freundlichen Grüßen",
        config.FIRMENNAME,
    ]
    return "\n".join(zeilen)


def erzeuge_eml(zeitraum: str, monate_analyse: list[dict],
                bericht_pdf: Path, paket_zip: Path, ziel: Path) -> Path:
    s = _summe(monate_analyse)
    msg = EmailMessage()
    if config.ABSENDER_EMAIL:
        msg["From"] = config.ABSENDER_EMAIL
    if config.STEUERBERATER_EMAIL:
        msg["To"] = f"{config.STEUERBERATER_NAME} <{config.STEUERBERATER_EMAIL}>"
    else:
        msg["To"] = config.STEUERBERATER_NAME
    msg["Subject"] = f"{config.FIRMENNAME} — Unterlagen {zeitraum}"
    msg.set_content(_text(zeitraum, s, bericht_pdf.name, paket_zip.name))

    for pfad in (bericht_pdf, paket_zip):
        if not pfad or not pfad.is_file():
            continue
        ctype, _ = mimetypes.guess_type(pfad.name)
        maintype, subtype = (ctype or "application/octet-stream").split("/", 1)
        msg.add_attachment(pfad.read_bytes(), maintype=maintype,
                           subtype=subtype, filename=pfad.name)

    ziel.write_bytes(msg.as_bytes())
    return ziel


def sende_email(betreff: str, text: str, anhaenge: list[Path] | None = None,
                empfaenger: str | None = None) -> str:
    """Versendet eine E-Mail über das hinterlegte Postfach (SMTP, STARTTLS).

    Genutzt für die automatische Monatsabschluss-Mail an die Buchhaltung.
    """
    import smtplib
    import ssl

    import certifi

    absender = config.get_imap_email()
    passwort = config.get_imap_passwort()
    if not absender or not passwort:
        raise RuntimeError("Kein E-Mail-Konto hinterlegt (Konto & E-Mail).")
    empfaenger = (empfaenger or config.get_abschluss_email()).strip()

    msg = EmailMessage()
    msg["From"] = absender
    msg["To"] = empfaenger
    msg["Subject"] = betreff
    msg.set_content(text)

    for pfad in anhaenge or []:
        if not pfad or not Path(pfad).exists():
            continue
        typ, _ = mimetypes.guess_type(str(pfad))
        maintype, subtype = (typ or "application/octet-stream").split("/", 1)
        msg.add_attachment(Path(pfad).read_bytes(), maintype=maintype,
                           subtype=subtype, filename=Path(pfad).name)

    ctx = ssl.create_default_context(cafile=certifi.where())
    with smtplib.SMTP(config.get_smtp_host(), 587, timeout=30) as smtp:
        smtp.starttls(context=ctx)
        smtp.login(absender, passwort)
        smtp.send_message(msg)
    return empfaenger
