"""Importiert Rechnungs-Anhänge aus iCloud Mail (IMAP) in die lokalen Ordner.

Ablauf: verbinde zu imap.mail.me.com, öffne die konfigurierten Ordner
(Eingang → erhaltene, Ausgang → gestellte), lade PDF-/Bild-Anhänge, ordne den
Monat über das E-Mail-Datum zu und lege sie via beleg_service ab. Bereits
verarbeitete Mails (Message-ID) werden übersprungen (idempotent).
"""

from __future__ import annotations

import email
import imaplib
import json
from datetime import datetime
from email.header import decode_header, make_header
from email.utils import parsedate_to_datetime
from pathlib import Path

import beleg_service
import config

_VERARBEITET = config.CACHE_DIR / "mail_verarbeitet.json"
MIN_GROESSE = 3000  # Bytes — kleinere Anhänge (Logos/Signaturen) überspringen

import re as _re
# E-Mails ohne Anhang, deren Betreff das enthält, werden selbst als PDF abgelegt.
_RELEVANT_RE = _re.compile(
    r"auszahlung|rechnung|servicegeb|beleg|zahlung|gutschrift|quittung|invoice|payout|receipt"
    r"|billing|subscription|abonnement|verl(?:ä|ae)ngert|renew|bestellbest(?:ä|ae)tigung|order\s+confirmation",
    _re.I)
# Absender, die fast immer Rechnungen schicken (z. B. billing@zoom.us)
# Ein Betrag im Mail-Text (z. B. „15,99 EUR“, „€ 25.00“, „Betrag: 30,00“)
_BETRAG_RE = _re.compile(r"\d+[.,]\d{2}\s*(?:EUR|€)|(?:EUR|€)\s*\d+[.,]\d{2}|(?:betrag|amount|total|summe)\D{0,20}\d+[.,]\d{2}", _re.I)
# Anhang, der nach echter Rechnung aussieht (dann reicht der Anhang)
_RECHNUNGS_ANHANG_RE = _re.compile(r"rechnung|invoice|receipt|beleg|quittung|faktura|\bRE[-_]?\d", _re.I)
_RECHNUNGS_ABSENDER_RE = _re.compile(r"billing|invoice|rechnung|receipt|accounting|buchhaltung|payments?@", _re.I)
# Betreff deutet auf eigene Ausgangsseite (Servicegebühr/Auszahlung) hin
_AUSGANG_RE = _re.compile(r"auszahlung|servicegeb|payout", _re.I)

# Benachrichtigungen, die keine Rechnung sind. Sie enthalten das Wort
# "Zahlung" und wurden deshalb bisher als PDF in den Rechnungsordner gelegt --
# im August 2026 fuenf Stueck:
#
#   PayPal  "Sie haben eine Zahlung erhalten"        -> Einnahme (Startgeld/Camp),
#   PayPal  "Benachrichtigung ueber Zahlungseingang"    keine Rechnung AN uns
#   Qonto   "Ihre Zahlung ... wurde durchgefuehrt"   -> Ausfuehrungsbestaetigung
#   Qonto   "Sie haben eine Zahlung durchgefuehrt"      einer Ueberweisung
#   Stripe  "Eine neue ... Rechnung ist verfuegbar"  -> Hinweis, die Rechnung
#                                                       selbst kommt separat
#
# Der Steuerberater braucht die Rechnung, nicht die Mitteilung, dass Geld
# geflossen ist -- das steht im Kontoauszug. Betrifft nur E-Mails OHNE Anhang;
# haengt eine echte Rechnung dran, wird die weiterhin abgelegt.
_KEINE_RECHNUNG_RE = _re.compile(
    r"zahlung\s+erhalten"
    r"|zahlungseingang"
    r"|zahlung\s+(?:per\s+\w+\s+)?(?:an\s+.{0,40}\s+)?wurde\s+durchgef"
    r"|haben\s+eine\s+zahlung\s+durchgef"
    r"|ist\s+verf(?:ü|ue)gbar"
    r"|zahlungserinnerung"
    r"|zahlung\s+war\s+erfolgreich"
    r"|geld\s+erhalten"
    r"|überweisung\s+ausgef(?:ü|ue)hrt",
    _re.I)


def _lade_verarbeitet() -> set[str]:
    if _VERARBEITET.exists():
        try:
            return set(json.loads(_VERARBEITET.read_text(encoding="utf-8")))
        except Exception:
            return set()
    return set()


def _speichere_verarbeitet(ids: set[str]) -> None:
    _VERARBEITET.write_text(json.dumps(sorted(ids), ensure_ascii=False, indent=2),
                            encoding="utf-8")


def _sicher(name: str) -> str:
    import re
    n = re.sub(r"[^\w\s.\-äöüÄÖÜß]", "", (name or "")).strip()
    return (n[:80] or "Beleg")


def _anbieter(msg) -> str:
    """Kurzer Anbieter-Name aus dem Absender (z. B. 'IONOS', 'Supabase')."""
    von = _dekodiere(msg.get("From") or "")
    m = _re.match(r'\s*"?([^"<]+?)"?\s*<', von)
    name = (m.group(1) if m else "").strip()
    if not name:
        # Fallback: Domain-Teil der Adresse
        m2 = _re.search(r"@([A-Za-z0-9.-]+)", von)
        name = (m2.group(1).split(".")[-2].capitalize() if m2 and "." in m2.group(1) else "Absender")
    name = _re.sub(r"[^\w\-äöüÄÖÜß ]", "", name).strip()
    name = _re.sub(r"\s+", "-", name)
    return name[:24] or "Absender"


def _sprechender_name(dt, anbieter: str, rest: str) -> str:
    """Einheitliche Benennung: JJJJ-MM-TT_Anbieter_Rechnungsnummer.

    Der Anbietername aus der Absenderadresse ist oft aufgeblaeht
    ("Supabase-Pte-Ltd", "Rechnungsstelle-IONOS") und der Originalname
    wiederholt Datum und Nummer. Beides wird hier eingedampft, damit der
    Ordner nach Datum sortierbar bleibt und man den Anbieter auf einen Blick
    sieht. Die Nummer bleibt vollstaendig -- sie ist die einzige Angabe, mit
    der sich ein Beleg eindeutig zuordnen laesst.
    """
    rest = (rest or "").strip().lstrip("_-")
    try:
        import belege_aufraeumen as _b

        kurz = _b.anbieter_aus(f"{anbieter}_{rest}")
        if kurz not in ("Unbekannt", "Receipt", "receipt"):
            anbieter = kurz
        nummer = _b.nummer_aus(rest, anbieter)
        if nummer and len(nummer) >= 4:
            endung = Path(rest).suffix or ".pdf"
            return f"{dt:%Y-%m-%d}_{anbieter}_{nummer}{endung}"
    except Exception:
        pass  # im Zweifel die bisherige Benennung -- Hauptsache, der Beleg liegt
    return f"{dt:%Y-%m-%d}_{anbieter}_{rest}"


def _email_koerper(msg) -> tuple[str, bool]:
    """Liefert den E-Mail-Inhalt (bevorzugt HTML) + Flag ob HTML."""
    html = text = None
    for part in msg.walk():
        ct = part.get_content_type()
        disp = part.get("Content-Disposition")
        if disp and "attachment" in str(disp).lower():
            continue
        if ct == "text/html" and html is None:
            html = part.get_payload(decode=True)
        elif ct == "text/plain" and text is None:
            text = part.get_payload(decode=True)
    if html:
        return html.decode(errors="replace"), True
    if text:
        return text.decode(errors="replace"), False
    return "", False


def _email_als_pdf(msg, betreff: str, ziel: Path) -> bool:
    """Speichert die E-Mail selbst als PDF (z. B. Auszahlungsbestätigung ohne Anhang)."""
    inhalt, ist_html = _email_koerper(msg)
    if not inhalt.strip():
        return False
    absender = _dekodiere(msg.get("From"))
    datum = _dekodiere(msg.get("Date"))
    import html as _htmlmod
    import subprocess
    import tempfile

    if not ist_html:
        inhalt = "<pre style='white-space:pre-wrap;font:13px -apple-system,sans-serif'>" + \
            _htmlmod.escape(inhalt) + "</pre>"
    kopf = (f"<div style='font:13px -apple-system,sans-serif;border-bottom:1px solid #ccc;"
            f"padding-bottom:8px;margin-bottom:12px'>"
            f"<b>{_htmlmod.escape(betreff)}</b><br>Von: {_htmlmod.escape(absender)}<br>"
            f"Datum: {_htmlmod.escape(datum)}</div>")
    doc = f"<html><head><meta charset='utf-8'></head><body style='margin:32px'>{kopf}{inhalt}</body></html>"

    import time
    # Chrome nutzen (wie bei Stripe-Belegen)
    for chrome in ("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
                   "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
                   "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"):
        if not Path(chrome).is_file():
            continue
        tmp = tempfile.mkdtemp()
        proc = None
        try:
            html_datei = Path(tmp) / "mail.html"
            html_datei.write_text(doc, encoding="utf-8")
            proc = subprocess.Popen(
                [chrome, "--headless=new", "--disable-gpu", "--no-sandbox",
                 f"--user-data-dir={tmp}", "--no-pdf-header-footer",
                 "--virtual-time-budget=3000",
                 f"--print-to-pdf={ziel}", html_datei.as_uri()],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            # Auf fertige Datei pollen (Chrome hängt bei file:// → nicht auf Prozess-Ende warten)
            for _ in range(24):  # max ~7 s
                try:
                    if ziel.is_file() and ziel.stat().st_size > 500 and ziel.read_bytes()[:4] == b"%PDF":
                        return True
                except Exception:
                    pass
                time.sleep(0.3)
        except Exception:
            pass
        finally:
            if proc is not None:
                try:
                    proc.kill()
                except Exception:
                    pass
            import shutil
            shutil.rmtree(tmp, ignore_errors=True)
    return False


def _email_als_text_pdf(msg, betreff: str, ziel: Path) -> bool:
    """Rückfall ohne Chrome: Mail-Text schlicht als PDF (reportlab) speichern."""
    import html as _htmlmod
    import re

    inhalt, ist_html = _email_koerper(msg)
    if ist_html:
        inhalt = re.sub(r"(?is)<(script|style).*?</\1>", " ", inhalt)
        inhalt = re.sub(r"(?i)<br\s*/?>|</p>|</tr>|</div>", "\n", inhalt)
        inhalt = _htmlmod.unescape(re.sub(r"<[^>]+>", " ", inhalt))
    zeilen = [z.strip() for z in inhalt.splitlines()]
    text = "\n".join(z for z in zeilen if z)
    if not text.strip():
        return False
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import getSampleStyleSheet
        from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

        st = getSampleStyleSheet()
        teile = [Paragraph(_htmlmod.escape(betreff), st["Heading2"]),
                 Paragraph(_htmlmod.escape(f"Von: {_dekodiere(msg.get('From'))} · {_dekodiere(msg.get('Date'))}"), st["Normal"]),
                 Spacer(1, 10)]
        teile += [Paragraph(_htmlmod.escape(z), st["Normal"]) for z in text.splitlines()[:400]]
        SimpleDocTemplate(str(ziel), pagesize=A4).build(teile)
        return ziel.is_file()
    except Exception:
        return False


def _dekodiere(wert: str | None) -> str:
    if not wert:
        return ""
    try:
        return str(make_header(decode_header(wert)))
    except Exception:
        return wert


def _utf7_decode(s: str) -> str:
    """IMAP-modifiziertes UTF-7 → lesbarer Text (&APw- → ü)."""
    import base64
    res, i = [], 0
    while i < len(s):
        if s[i] == "&":
            j = s.find("-", i)
            if j == -1:
                res.append(s[i:]); break
            b64 = s[i + 1:j]
            if not b64:
                res.append("&")
            else:
                b64 = b64.replace(",", "/")
                b64 += "=" * ((4 - len(b64) % 4) % 4)
                try:
                    res.append(base64.b64decode(b64).decode("utf-16-be"))
                except Exception:
                    res.append(s[i:j + 1])
            i = j + 1
        else:
            res.append(s[i]); i += 1
    return "".join(res)


def _utf7_encode(s: str) -> str:
    """Lesbarer Text → IMAP-modifiziertes UTF-7 (für SELECT)."""
    import base64
    res, buf = [], []

    def flush():
        if buf:
            b64 = base64.b64encode("".join(buf).encode("utf-16-be")).decode()
            res.append("&" + b64.rstrip("=").replace("/", ",") + "-")
            buf.clear()

    for ch in s:
        if ch == "&":
            flush(); res.append("&-")
        elif 0x20 <= ord(ch) <= 0x7E:
            flush(); res.append(ch)
        else:
            buf.append(ch)
    flush()
    return "".join(res)


_LIST_RE = _re.compile(r'^\((?P<flags>[^)]*)\)\s+(?:"(?P<delim>[^"]*)"|NIL)\s+(?:"(?P<qname>(?:[^"\\]|\\.)*)"|(?P<name>.+))$')


def _ordner_verfuegbar(imap) -> list[str]:
    """Liest die IMAP-Ordnerliste robust (quotiert/unquotiert, UTF-7-dekodiert)."""
    namen = []
    typ, daten = imap.list()
    if typ != "OK":
        return namen
    for eintrag in daten:
        if eintrag is None:
            continue
        s = eintrag.decode(errors="replace") if isinstance(eintrag, bytes) else str(eintrag)
        m = _LIST_RE.match(s.strip())
        if not m:
            continue
        if "\\noselect" in (m.group("flags") or "").lower():
            continue  # nicht auswählbare Zwischenknoten überspringen
        roh = m.group("qname") if m.group("qname") is not None else (m.group("name") or "").strip()
        roh = roh.replace('\\"', '"').replace("\\\\", "\\")
        if roh:
            namen.append(_utf7_decode(roh))
    # Duplikate raus, Reihenfolge stabil
    gesehen = set()
    return [n for n in namen if not (n in gesehen or gesehen.add(n))]


_PROVISION_RE = _re.compile(r"\bRE-\d{4}-\d{3,}\b|Servicegeb[üu]hr", _re.I)


def _ist_provisionsrechnung(msg, betreff: str) -> bool:
    """Eigene Provisionsrechnung an einen Verein (von der Plattform verschickt)?"""
    absender = (_dekodiere(msg.get("From")) or "").lower()
    return "turnierpro.de" in absender and bool(_PROVISION_RE.search(betreff or ""))


def _vormonat(jahr: int, monat: int) -> tuple[int, int]:
    return (jahr - 1, 12) if monat == 1 else (jahr, monat - 1)


def _verarbeite_ordner(imap, ordner: str, typ: str, verarbeitet: set[str],
                       jahr: int | None = None, monate: list[int] | None = None,
                       nur_relevante: bool = False, neu_pruefen: bool = False) -> dict:
    ergebnis = {"ordner": ordner, "typ": typ, "abgelegt": [], "uebersprungen": 0, "fehler": [],
                "nicht_uebernommen": []}

    def merke_grund(msg, betreff: str, dt, grund: str) -> None:
        """Merkt eine Mail, die nicht übernommen wurde, samt Grund (für die Anzeige)."""
        ergebnis["nicht_uebernommen"].append({
            "ordner": ordner, "betreff": (betreff or "(ohne Betreff)")[:90],
            "von": _anbieter(msg), "datum": f"{dt:%d.%m.%Y}", "grund": grund})
    # Erst wie eingegeben versuchen, dann UTF-7-kodiert (Umlaute in Ordnernamen)
    status = "NO"
    for kandidat in (ordner, _utf7_encode(ordner)):
        try:
            status, _ = imap.select(f'"{kandidat}"', readonly=False)
        except Exception:
            status = "NO"
        if status == "OK":
            break
    if status != "OK":
        verfuegbar = _ordner_verfuegbar(imap)
        raise FileNotFoundError(
            f"Mail-Ordner '{ordner}' nicht gefunden. Bitte unter Einstellungen › Zugänge → "
            "'Verfügbare Ordner laden' einen dieser Ordner wählen: "
            + " · ".join(verfuegbar[:25])
        )

    status, daten = imap.search(None, "ALL")
    if status != "OK":
        return ergebnis
    for num in daten[0].split():
        status, roh = imap.fetch(num, "(RFC822)")
        if status != "OK" or not roh or not roh[0]:
            continue
        msg = email.message_from_bytes(roh[0][1])
        mid = msg.get("Message-ID", "").strip() or f"{ordner}:{num.decode()}"
        if mid in verarbeitet and not neu_pruefen:
            ergebnis["uebersprungen"] += 1
            continue

        # Monat/Jahr aus dem E-Mail-Datum
        try:
            dt = parsedate_to_datetime(msg.get("Date"))
        except Exception:
            dt = datetime.now()
        mail_jahr, mail_monat = dt.year, dt.month
        betreff_fuer_monat = _dekodiere(msg.get("Subject")) or ""
        if _ist_provisionsrechnung(msg, betreff_fuer_monat) and dt.day <= 3:
            # Die Provisionsrechnungen an die Vereine werden in der Nacht zum
            # Monatsersten für den ABGELAUFENEN Monat erzeugt. Nach dem Maildatum
            # abgelegt landeten sie im Folgemonat -- und damit im falschen
            # Steuerberater-Paket, denn der Umsatz gehört in den Leistungsmonat.
            mail_jahr, mail_monat = _vormonat(mail_jahr, mail_monat)
        # Nur E-Mails des gewählten Zeitraums verarbeiten (Monats-/Quartals-Tab)
        if jahr is not None and mail_jahr != jahr:
            continue
        if monate is not None and mail_monat not in monate:
            continue

        betreff_roh = _dekodiere(msg.get("Subject"))
        # Posteingang-Scan: nur Rechnungs-/Beleg-Mails berücksichtigen
        # (Newsletter u. Ä. bleiben unangetastet)
        absender = _dekodiere(msg.get("From")) or ""
        if nur_relevante and not (_RELEVANT_RE.search(betreff_roh or "") or _RECHNUNGS_ABSENDER_RE.search(absender)):
            continue
        # typ "auto": Auszahlungen/Servicegebühren → Einnahmen, sonst Ausgaben
        mail_typ = typ
        if typ == "auto":
            mail_typ = "einnahmen" if _AUSGANG_RE.search(betreff_roh or "") else "ausgaben"

        anhang_abgelegt = False
        anhang_ist_rechnung = False
        for part in msg.walk():
            if part.get_content_maintype() == "multipart":
                continue
            ist_pdf = part.get_content_type() == "application/pdf"
            if part.get("Content-Disposition") is None and not ist_pdf:
                continue  # kein echter Anhang (z. B. Inline-Logo)
            dateiname = _dekodiere(part.get_filename()) or ("Rechnung.pdf" if ist_pdf else "")
            if not dateiname:
                continue
            if Path(dateiname).suffix.lower() not in beleg_service.ERLAUBTE_ENDUNGEN:
                continue
            daten_bytes = part.get_payload(decode=True) or b""
            if len(daten_bytes) < MIN_GROESSE:
                continue
            if _RECHNUNGS_ANHANG_RE.search(dateiname):
                anhang_ist_rechnung = True
            # Sprechende Benennung: Datum_Anbieter_Originalname (schnelle Zuordnung)
            dateiname = _sprechender_name(dt, _anbieter(msg), dateiname)
            try:
                res = beleg_service.speichere_beleg(mail_jahr, mail_typ, mail_monat, dateiname, daten_bytes)
                if res.get("neu", True):
                    ergebnis["abgelegt"].append(
                        {"datei": res["datei"], "monat": mail_monat, "jahr": mail_jahr,
                         "betreff": _dekodiere(msg.get("Subject"))[:80]}
                    )
                else:
                    ergebnis["uebersprungen"] += 1  # lag schon im Ordner
                anhang_abgelegt = True
            except Exception as exc:  # pragma: no cover
                ergebnis["fehler"].append(f"{dateiname}: {exc}")

        # Kein Anhang, aber relevante E-Mail (Auszahlung/Rechnung/Beleg im Betreff)
        # → E-Mail selbst als PDF ablegen.
        betreff = betreff_roh
        if not anhang_abgelegt and _KEINE_RECHNUNG_RE.search(betreff or ""):
            # Reine Zahlungsbestaetigung ohne Anhang -- nicht ablegen, aber als
            # erledigt merken, damit sie nicht bei jedem Lauf erneut auftaucht.
            verarbeitet.add(mid)
            ergebnis["uebersprungen"] += 1
            merke_grund(msg, betreff, dt, "Nur Zahlungsbestätigung ohne Rechnung im Anhang. "
                        "Die Rechnung kommt meist separat oder liegt im Kundenkonto des Anbieters.")
            continue
        relevant = _RELEVANT_RE.search(betreff or "") or _RECHNUNGS_ABSENDER_RE.search(absender)
        # Zahlungsdaten stehen im Mail-Text, der Anhang ist nur Beiwerk (z. B. Zoom:
        # Anhang = Bestellung/Abo-Bedingungen, Betrag steht in der Mail) → Mail zusätzlich ablegen
        mail_zusaetzlich = False
        if anhang_abgelegt and not anhang_ist_rechnung and relevant:
            koerper, _html = _email_koerper(msg)
            mail_zusaetzlich = bool(_BETRAG_RE.search(_re.sub(r"<[^>]+>", " ", koerper)))
        if not anhang_abgelegt and not relevant:
            # Im Rechnungsordner, aber weder Anhang noch Rechnungs-Hinweis
            merke_grund(msg, betreff, dt, "Kein PDF-Anhang und kein Hinweis auf eine Rechnung im Betreff.")
        if (not anhang_abgelegt or mail_zusaetzlich) and relevant:
            ordner_ziel = (config.eingangsrechnungen_ordner(mail_jahr, mail_monat, anlegen=True)
                           if mail_typ == "ausgaben"
                           else config.ausgangsrechnungen_ordner(mail_jahr, mail_monat, anlegen=True))
            dateiname = _sprechender_name(dt, _anbieter(msg), f"{_sicher(betreff)}.pdf")
            if mail_zusaetzlich:
                dateiname = dateiname[:-4] + "_Mail.pdf"
            ziel = ordner_ziel / dateiname
            if ziel.exists():
                ergebnis["uebersprungen"] += 1
                anhang_abgelegt = True
            elif _email_als_pdf(msg, betreff, ziel) or _email_als_text_pdf(msg, betreff, ziel):
                ergebnis["abgelegt"].append(
                    {"datei": ziel.name, "monat": mail_monat, "jahr": mail_jahr, "betreff": betreff[:80]})
                anhang_abgelegt = True
            else:
                merke_grund(msg, betreff, dt, "Kein Anhang; die Mail konnte nicht als PDF gespeichert werden.")

        if anhang_abgelegt:
            verarbeitet.add(mid)
    return ergebnis


_NICHT_KONFIGURIERT = (
    "iCloud-Mail nicht konfiguriert. Bitte iCloud-Adresse und app-spezifisches "
    "Passwort unter Einstellungen › Zugänge eintragen (Passwort von appleid.apple.com)."
)


def liste_ordner() -> list[str]:
    """Verbindet zu iCloud Mail und liefert die verfügbaren Ordnernamen."""
    if not config.get_imap_email() or not config.get_imap_passwort():
        raise RuntimeError(_NICHT_KONFIGURIERT)
    imap = imaplib.IMAP4_SSL(config.get_imap_host())
    try:
        imap.login(config.get_imap_email(), config.get_imap_passwort())
        return sorted(n for n in _ordner_verfuegbar(imap) if n)
    except imaplib.IMAP4.error as exc:
        raise RuntimeError(
            f"Anmeldung bei iCloud Mail fehlgeschlagen: {exc}"
        )
    finally:
        try:
            imap.logout()
        except Exception:
            pass


def importiere(jahr: int | None = None, monate: list[int] | None = None, neu_pruefen: bool = False) -> dict:
    """neu_pruefen: auch schon früher abgearbeitete Mails des Zeitraums erneut ansehen
    (doppelte Dateien entstehen nicht: gleiche Inhalte und vorhandene Mail-PDFs werden erkannt)."""
    if not config.get_imap_email() or not config.get_imap_passwort():
        raise RuntimeError(_NICHT_KONFIGURIERT)

    verarbeitet = _lade_verarbeitet()
    ordner_liste = [
        (config.get_mail_ordner_eingang(), "ausgaben"),   # Eingangsrechnungen → erhaltene
        (config.get_mail_ordner_ausgang(), "einnahmen"),  # Ausgangsrechnungen → gestellte
    ]

    berichte = []
    imap = imaplib.IMAP4_SSL(config.get_imap_host())
    try:
        imap.login(config.get_imap_email(), config.get_imap_passwort())
        for ordner, typ in ordner_liste:
            if not ordner:
                continue
            berichte.append(_verarbeite_ordner(imap, ordner, typ, verarbeitet, jahr, monate, neu_pruefen=neu_pruefen))
        # Zusätzlich den Posteingang scannen: Rechnungs-/Beleg-Mails, die (noch)
        # nicht einsortiert wurden (z. B. IONOS direkt in der INBOX).
        berichte.append(_verarbeite_ordner(
            imap, "INBOX", "auto", verarbeitet, jahr, monate, nur_relevante=True, neu_pruefen=neu_pruefen))
    except imaplib.IMAP4.error as exc:
        raise RuntimeError(
            "Anmeldung bei iCloud Mail fehlgeschlagen. Stimmt die Adresse und das "
            f"app-spezifische Passwort? ({exc})"
        )
    finally:
        try:
            imap.logout()
        except Exception:
            pass

    _speichere_verarbeitet(verarbeitet)

    gesamt = sum(len(b["abgelegt"]) for b in berichte)
    return {"abgelegt_gesamt": gesamt, "ordner": berichte}
