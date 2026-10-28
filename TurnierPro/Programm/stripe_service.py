"""Stripe-Flow: gestellte Rechnungen/Belege eines Monats abrufen und ablegen.

Holt für den gewählten Monat die in Stripe erzeugten Rechnungen (invoice_pdf)
und – falls keine Rechnung existiert – die Zahlungsbelege (charge.receipt_url),
lädt die PDFs herunter und legt sie im Ordner der Ausgangsrechnungen ab
(01_Rechnungen/<Jahr>/02_gestellte/Q../MM_Monat/).
"""

from __future__ import annotations

import calendar
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

# Monatsgrenzen und Belegdaten nach deutscher Zeit – sonst landet z. B. eine
# Zahlung vom 1. Oktober, 01:30 Uhr, noch im September (UTC).
BERLIN = ZoneInfo("Europe/Berlin")
from pathlib import Path
from urllib.request import Request, urlopen

import config


def _d(obj):
    """Stripe-Objekt → echtes, rekursiv konvertiertes dict/list (Stripe v15 hat kein .get())."""
    if hasattr(obj, "to_dict") and not isinstance(obj, dict):
        try:
            obj = obj.to_dict()
        except Exception:
            return obj
    if isinstance(obj, dict):
        return {k: _d(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_d(v) for v in obj]
    return obj


def _chrome_pfad() -> str | None:
    import shutil

    for p in ("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
              "/Applications/Chromium.app/Contents/MacOS/Chromium",
              "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
              "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"):
        if Path(p).is_file():
            return p
    return shutil.which("google-chrome") or shutil.which("chromium")


def _receipt_zu_pdf(url: str, ziel: Path) -> bool:
    """Rendert die echte Stripe-Zahlungsbeleg-HTML (receipt_url) als PDF via Chrome."""
    chrome = _chrome_pfad()
    if not chrome:
        return False
    import subprocess
    import tempfile

    try:
        with tempfile.TemporaryDirectory() as tmp:
            subprocess.run(
                [chrome, "--headless=new", "--disable-gpu", "--no-sandbox",
                 f"--user-data-dir={tmp}", "--no-pdf-header-footer",
                 "--virtual-time-budget=8000",
                 f"--print-to-pdf={ziel}", url],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=40,
            )
        return ziel.is_file() and ziel.read_bytes()[:4] == b"%PDF"
    except Exception:
        return False


def _monatsgrenzen(jahr: int, monat: int) -> tuple[int, int]:
    start = int(datetime(jahr, monat, 1, tzinfo=BERLIN).timestamp())
    letzter_tag = calendar.monthrange(jahr, monat)[1]
    ende = int(
        datetime(jahr, monat, letzter_tag, 23, 59, 59, tzinfo=BERLIN).timestamp()
    )
    return start, ende


def _guthaben_eingang(stripe, kunde: str) -> dict[str, int]:
    """payment_intent → Zeitpunkt, an dem das Geld auf dem Kundenguthaben einging.

    Banküberweisungen landen zuerst im Stripe-Kundenguthaben und werden oft erst
    Tage später einer Zahlung zugeordnet. Wirtschaftlich zählt der Geldeingang;
    zugeordnet wird nach FIFO (älteste Einzahlung wird zuerst verbraucht).
    """
    txns = [_d(t) for t in stripe.Customer.list_cash_balance_transactions(
        kunde, limit=100).auto_paging_iter()]
    txns.sort(key=lambda t: t.get("created", 0))
    offen: list[list[int]] = []  # [Zeitpunkt, Restbetrag] der Einzahlungen
    ergebnis: dict[str, int] = {}
    for t in txns:
        betrag = t.get("net_amount", 0) or 0
        if betrag > 0:
            offen.append([t["created"], betrag])
            continue
        rest, zeitpunkt = -betrag, t["created"]
        while rest > 0 and offen:
            zeitpunkt = offen[0][0]
            nimm = min(rest, offen[0][1])
            offen[0][1] -= nimm
            rest -= nimm
            if offen[0][1] == 0:
                offen.pop(0)
        if t.get("type") == "applied_to_payment":
            pi = ((t.get("applied_to_payment") or {}).get("payment_intent"))
            if pi:
                ergebnis[pi] = zeitpunkt
    return ergebnis


def _zahlungen_im_monat(stripe, jahr: int, monat: int) -> list[tuple[dict, int]]:
    """Erfolgreiche Charges eines Monats als (charge, Zahlungszeitpunkt).

    Zahlungszeitpunkt ist das Anlagedatum – außer bei Zahlungen aus dem
    Kundenguthaben: dort zählt der Tag des Geldeingangs. Deshalb wird auch in die
    Folgewochen geschaut (Guthaben vom 28.09., angerechnet am 01.10. → September)
    und eine im Monat angerechnete, aber vorher eingegangene Zahlung fällt heraus.
    """
    start, ende = _monatsgrenzen(jahr, monat)
    vorlauf = 45 * 86400
    guthaben: dict[str, dict[str, int]] = {}
    treffer: list[tuple[dict, int]] = []
    charges = stripe.Charge.list(created={"gte": start, "lte": ende + vorlauf}, limit=100)
    for c in charges.auto_paging_iter():
        d = _d(c)
        if d.get("status") != "succeeded":
            continue
        zeitpunkt = d.get("created", 0)
        art = (d.get("payment_method_details") or {}).get("type")
        if art == "customer_balance" and d.get("customer") and d.get("payment_intent"):
            kunde = d["customer"]
            if kunde not in guthaben:
                try:
                    guthaben[kunde] = _guthaben_eingang(stripe, kunde)
                except Exception:
                    guthaben[kunde] = {}
            zeitpunkt = guthaben[kunde].get(d["payment_intent"], zeitpunkt)
        if start <= zeitpunkt <= ende:
            treffer.append((d, zeitpunkt))
    return treffer


def _ssl_ctx():
    import ssl

    try:
        import certifi

        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        return ssl.create_default_context()


def _lade_pdf(url: str, ziel: Path) -> bool:
    try:
        req = Request(url, headers={"User-Agent": "TurnierPro-Steuer-Cockpit"})
        with urlopen(req, timeout=30, context=_ssl_ctx()) as resp:
            data = resp.read()
        if data[:4] != b"%PDF":
            return False
        ziel.write_bytes(data)
        return True
    except Exception:
        return False


def monatsreport(jahr: int, monat: int) -> dict:
    """Zieht die Stripe-Finanzzahlen des Monats direkt per API.

    Aggregiert alle Balance-Transaktionen (Zahlungen, Gebühren, Erstattungen,
    Auszahlungen) zu einem Monatsreport. Beträge in EUR.
    """
    if not config.get_stripe_key():
        raise RuntimeError(
            "Kein Stripe-Key gesetzt. Bitte unter Einstellungen › Zugänge eintragen "
            "(Stripe-Dashboard → Entwickler → API-Schlüssel)."
        )

    import stripe

    stripe.api_key = config.get_stripe_key()
    start, ende = _monatsgrenzen(jahr, monat)

    bruttoumsatz = gebuehren = erstattungen = netto = auszahlungen = 0.0
    anzahl_zahlungen = 0
    waehrung = "EUR"

    txns = stripe.BalanceTransaction.list(created={"gte": start, "lte": ende}, limit=100)
    for t in txns.auto_paging_iter():
        t = _d(t)
        betrag = (t.get("amount", 0) or 0) / 100
        fee = (t.get("fee", 0) or 0) / 100
        net = (t.get("net", 0) or 0) / 100
        typ = t.get("type", "")
        if t.get("currency"):
            waehrung = t["currency"].upper()

        if typ in ("charge", "payment"):
            bruttoumsatz += betrag
            gebuehren += fee
            netto += net
            anzahl_zahlungen += 1
        elif typ in ("refund", "payment_refund"):
            erstattungen += betrag  # negativ
            gebuehren += fee
            netto += net
        elif typ == "payout":
            auszahlungen += betrag  # negativ (Geld aufs Bankkonto)
        else:
            gebuehren += fee
            netto += net

    return {
        "jahr": jahr, "monat": monat, "waehrung": waehrung,
        "bruttoumsatz": round(bruttoumsatz, 2),
        "gebuehren": round(gebuehren, 2),
        "erstattungen": round(erstattungen, 2),
        "netto": round(netto, 2),
        "auszahlungen": round(auszahlungen, 2),
        "anzahl_zahlungen": anzahl_zahlungen,
    }


def umsatz_aufschluesselung(jahr: int, monat: int) -> dict:
    """Echter TurnierPro-Umsatz eines Monats, klassifiziert nach Stripe-Metadaten.

    - Abos (keine/andere Metadaten): voller Betrag ist Umsatz.
    - Camps (type=camp_deposit): nur Provision (Standard 3 %) ist Umsatz.
    - Turniere (type=tournament_deposit): nur Provision (Standard 3 %) ist Umsatz.
    Die durchlaufenden Beträge (Rest an Veranstalter) sind KEIN Umsatz.
    """
    if not config.get_stripe_key():
        raise RuntimeError(
            "Kein Stripe-Key gesetzt. Bitte unter Einstellungen › Zugänge eintragen."
        )

    import stripe

    stripe.api_key = config.get_stripe_key()
    camp_satz, turnier_satz = config.get_provision_camp(), config.get_provision_turnier()

    abo = camp_brutto = turnier_brutto = 0.0
    n_abo = n_camp = n_turnier = 0

    for d, _zeit in _zahlungen_im_monat(stripe, jahr, monat):
        # Erstattungen abziehen (netto)
        netto = (d.get("amount", 0) - d.get("amount_refunded", 0)) / 100
        if netto <= 0:
            continue
        typ = (d.get("metadata") or {}).get("type", "")
        if typ == "camp_deposit":
            camp_brutto += netto; n_camp += 1
        elif typ == "tournament_deposit":
            turnier_brutto += netto; n_turnier += 1
        else:
            abo += netto; n_abo += 1

    camp_prov = round(camp_brutto * camp_satz, 2)
    turnier_prov = round(turnier_brutto * turnier_satz, 2)
    prov_brutto = round(camp_prov + turnier_prov, 2)
    # Provision ist Brutto inkl. 19 % USt → Netto + USt herausrechnen
    ustsatz = 0.19
    prov_netto = round(prov_brutto / (1 + ustsatz), 2)
    prov_ust = round(prov_brutto - prov_netto, 2)
    # Abos sind ebenfalls Brutto inkl. USt (Umsatzerlös)
    abo_netto = round(abo / (1 + ustsatz), 2)
    abo_ust = round(abo - abo_netto, 2)
    return {
        "jahr": jahr, "monat": monat,
        "abo_umsatz": round(abo, 2), "abo_netto": abo_netto, "abo_ust": abo_ust,
        "n_abo": n_abo,
        "camp_brutto": round(camp_brutto, 2), "camp_provision": camp_prov,
        "camp_satz": camp_satz, "n_camp": n_camp,
        "turnier_brutto": round(turnier_brutto, 2), "turnier_provision": turnier_prov,
        "turnier_satz": turnier_satz, "n_turnier": n_turnier,
        "provision_brutto": prov_brutto, "provision_netto": prov_netto,
        "provision_ust": prov_ust, "ustsatz": ustsatz,
        "durchlauf": round((camp_brutto - camp_prov) + (turnier_brutto - turnier_prov), 2),
        "gesamt_umsatz": round(abo + prov_brutto, 2),
        "umsatzsteuer_gesamt": round(abo_ust + prov_ust, 2),
    }


def provision_positionen(jahr: int, monat: int) -> dict:
    """Detail-Positionen für die Provisions-Aufstellung (Camps/Turniere) eines Monats."""
    if not config.get_stripe_key():
        raise RuntimeError("Kein Stripe-Key gesetzt.")

    import datetime as _dt

    import stripe

    stripe.api_key = config.get_stripe_key()
    camp_satz, turnier_satz = config.get_provision_camp(), config.get_provision_turnier()

    positionen: list[dict] = []
    for d, zeit in _zahlungen_im_monat(stripe, jahr, monat):
        meta = d.get("metadata") or {}
        typ = meta.get("type", "")
        if typ not in ("camp_deposit", "tournament_deposit"):
            continue
        netto = (d.get("amount", 0) - d.get("amount_refunded", 0)) / 100
        if netto <= 0:
            continue
        satz = camp_satz if typ == "camp_deposit" else turnier_satz
        prov = round(netto * satz, 2)
        prov_netto = round(prov / 1.19, 2)
        positionen.append({
            "datum": _dt.datetime.fromtimestamp(zeit, BERLIN).strftime("%d.%m.%Y"),
            "art": "Camp" if typ == "camp_deposit" else "Turnier",
            "veranstaltung": meta.get("camp_name") or meta.get("tournament_name") or "-",
            "teilnehmer": meta.get("child_name") or meta.get("team_name") or "-",
            "brutto": round(netto, 2),
            "satz": satz,
            "provision": prov,
            "provision_netto": prov_netto,
            "provision_ust": round(prov - prov_netto, 2),
        })
    positionen.sort(key=lambda p: (p["art"], p["datum"]))
    return {"jahr": jahr, "monat": monat, "positionen": positionen}


def sync_monat(jahr: int, monat: int) -> dict:
    """Ruft Stripe-Belege des Monats ab und legt sie ab.

    Rückgabe: dict mit Zusammenfassung (abgelegt, übersprungen, fehler).
    """
    if not config.get_stripe_key():
        raise RuntimeError(
            "Kein Stripe-Key gesetzt. Bitte unter Einstellungen › Zugänge eintragen "
            "(Stripe-Dashboard → Entwickler → API-Schlüssel)."
        )

    import stripe

    stripe.api_key = config.get_stripe_key()
    start, ende = _monatsgrenzen(jahr, monat)
    zielordner = config.ausgangsrechnungen_ordner(jahr, monat, anlegen=True)

    abgelegt: list[str] = []
    uebersprungen: list[str] = []
    fehler: list[str] = []

    import re as _re2

    def _clean(s: str) -> str:
        s = _re2.sub(r"[^\w\-äöüÄÖÜß ]", "", str(s or "")).strip()
        return _re2.sub(r"\s+", "-", s)[:28]

    def _schon_da(kennung: str) -> bool:
        """Beleg mit dieser eindeutigen Nummer bereits abgelegt (egal unter welchem Namen)?"""
        k = str(kennung).replace("/", "-")
        return any(zielordner.glob(f"*{k}*.pdf"))

    # 1) Offizielle Stripe-Rechnungen (haben ein invoice_pdf)
    try:
        rechnungen = stripe.Invoice.list(
            created={"gte": start, "lte": ende}, limit=100
        )
        for inv in rechnungen.auto_paging_iter():
            inv = _d(inv)
            nummer = inv.get("number") or inv.get("id")
            url = inv.get("invoice_pdf")
            if not url:
                continue
            inv_datum = datetime.fromtimestamp(inv.get("created", 0), tz=BERLIN)
            dateiname = f"{inv_datum:%Y-%m-%d}_Stripe_Rechnung_{nummer}.pdf".replace("/", "-")
            ziel = zielordner / dateiname
            if _schon_da(nummer):
                uebersprungen.append(dateiname)
                continue
            if _lade_pdf(url, ziel):
                abgelegt.append(dateiname)
            else:
                fehler.append(f"Download fehlgeschlagen: {nummer}")
    except Exception as exc:  # pragma: no cover - Netz-/Auth-Fehler
        fehler.append(f"Stripe-Rechnungen: {exc}")

    # 2) Zahlungen ohne Rechnung → Receipt-PDF (falls verfügbar)
    zahlungen: list[dict] = []
    chrome_da = _chrome_pfad() is not None
    try:
        for ch, zeit in _zahlungen_im_monat(stripe, jahr, monat):
            if ch.get("invoice"):
                continue  # bereits über Invoice abgedeckt
            receipt = ch.get("receipt_url")
            meta = ch.get("metadata") or {}
            typ = meta.get("type", "")
            art = "Camp" if typ == "camp_deposit" else ("Turnier" if typ == "tournament_deposit" else "Abo")
            betrag = (ch.get("amount", 0) - ch.get("amount_refunded", 0)) / 100
            datum = datetime.fromtimestamp(zeit, tz=BERLIN)
            beleg_nr = ch.get("receipt_number") or ch.get("id", "")[:14]
            zahlungen.append({
                "datum": f"{datum:%d.%m.%Y}",
                "beleg_nr": beleg_nr, "art": art,
                "beschreibung": ch.get("description") or (meta.get("child_name") or meta.get("team_name") or "-"),
                "betrag": round(betrag, 2),
            })
            # Echten Stripe-Zahlungsbeleg als PDF ablegen (via Chrome),
            # sprechend benannt: Datum_Art_Teilnehmer_Beleg-Nr (schnelle Zuordnung)
            if receipt and chrome_da:
                teiln = _clean(meta.get("child_name") or meta.get("team_name") or "")
                mitte = f"{art}_{teiln}" if teiln else art
                dateiname = f"{datum:%Y-%m-%d}_{mitte}_Beleg-{beleg_nr}.pdf".replace("/", "-")
                ziel = zielordner / dateiname
                if _schon_da(beleg_nr):
                    uebersprungen.append(dateiname)
                elif _receipt_zu_pdf(receipt, ziel):
                    abgelegt.append(dateiname)
                    # alten txt-Beleg (Vorgängerformat) durch das PDF ersetzen
                    alt = zielordner / f"Stripe_Zahlungsbeleg_{beleg_nr}.txt".replace("/", "-")
                    if alt.exists():
                        alt.unlink()
        # Zusätzlich eine Übersichts-PDF aller Zahlungen des Monats
        if zahlungen:
            import provision_beleg

            ziel = zielordner / f"Stripe_Zahlungsuebersicht_{jahr}-{monat:02d}.pdf"
            neu = zielordner / f".{ziel.name}.neu"  # erst daneben schreiben, dann austauschen (iCloud)
            provision_beleg.erstelle_zahlungsbelege(jahr, monat, zahlungen, neu)
            config.ersetze_datei(neu, ziel)
            if ziel.name not in abgelegt:
                abgelegt.append(ziel.name)
    except Exception as exc:  # pragma: no cover
        fehler.append(f"Stripe-Zahlungen: {exc}")

    # 3) Payout-Report als Referenz
    try:
        payouts = stripe.Payout.list(created={"gte": start, "lte": ende}, limit=100)
        summe = sum(_d(p).get("amount", 0) for p in payouts.auto_paging_iter()) / 100
        if summe:
            info = zielordner / f"Stripe_Payouts_{jahr}-{monat:02d}.txt"
            if not info.exists():
                info.write_text(
                    f"Stripe-Auszahlungen (Payouts) im {config.MONATSNAMEN[monat]} {jahr}\n"
                    f"Summe: {summe:.2f} EUR\n",
                    encoding="utf-8",
                )
                abgelegt.append(info.name)
    except Exception as exc:  # pragma: no cover
        fehler.append(f"Stripe-Payouts: {exc}")

    # 4) Provisions-Aufstellung als PDF-Beleg (Camps/Turniere)
    try:
        pos = provision_positionen(jahr, monat)["positionen"]
        if pos:
            import provision_beleg

            ziel = zielordner / f"Provisions-Aufstellung_{jahr}-{monat:02d}.pdf"
            neu = zielordner / f".{ziel.name}.neu"
            provision_beleg.erstelle_provisionsbeleg(jahr, monat, pos, neu)
            config.ersetze_datei(neu, ziel)
            if ziel.name not in abgelegt:
                abgelegt.append(ziel.name)
    except Exception as exc:  # pragma: no cover
        fehler.append(f"Provisions-Beleg: {exc}")

    return {
        "zielordner": str(zielordner),
        "abgelegt": abgelegt,
        "uebersprungen": uebersprungen,
        "fehler": fehler,
    }
