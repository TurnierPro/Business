"""Qonto-Anbindung: legt den monatlichen Kontoauszug automatisch ab.

Nutzt die Qonto Business-API (thirdparty.qonto.com/v2). Authentifizierung per
API-Key (login + secret) aus dem Qonto Developer Portal.

Zwei Wege (defensiv):
1. Falls Qonto ein fertiges Statement-PDF liefert → dieses laden.
2. Sonst: Transaktionen des Monats abrufen und daraus selbst einen sauberen
   Kontoauszug als PDF erzeugen (funktioniert immer).
"""

from __future__ import annotations

import calendar
import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

import config

BASE = "https://thirdparty.qonto.com/v2"


def konfiguriert() -> bool:
    return bool(config.get_qonto_login() and config.get_qonto_secret())


def _auth_header() -> dict:
    return {
        "Authorization": f"{config.get_qonto_login()}:{config.get_qonto_secret()}",
        "User-Agent": "TurnierPro-Cockpit",
        "Accept": "application/json",
    }


def _ssl_ctx():
    import ssl

    try:
        import certifi

        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        return ssl.create_default_context()


def _get(pfad: str, params: dict | None = None) -> dict:
    from urllib.parse import urlencode

    url = f"{BASE}{pfad}"
    if params:
        url += "?" + urlencode(params, doseq=True)
    req = Request(url, headers=_auth_header())
    with urlopen(req, timeout=30, context=_ssl_ctx()) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _lade_datei(url: str, ziel: Path) -> bool:
    try:
        req = Request(url, headers={"User-Agent": "TurnierPro-Cockpit"})
        with urlopen(req, timeout=60, context=_ssl_ctx()) as resp:
            data = resp.read()
        if data[:4] != b"%PDF":
            return False
        ziel.write_bytes(data)
        return True
    except Exception:
        return False


def konten() -> list[dict]:
    """Liste der Qonto-Bankkonten (id, iban, name, saldo)."""
    if not konfiguriert():
        raise RuntimeError(
            "Qonto nicht konfiguriert. Bitte API-Login und Secret links unter "
            "Einstellungen › Zugänge eintragen (aus developers.qonto.com)."
        )
    org = _get("/organization").get("organization", {})
    konten = []
    for b in org.get("bank_accounts", []):
        konten.append({
            "id": b.get("id"), "slug": b.get("slug"),
            "iban": b.get("iban", ""), "name": b.get("name") or "Qonto-Konto",
            "saldo": (b.get("balance_cents") or 0) / 100,
        })
    return konten


def _monatsgrenzen(jahr: int, monat: int):
    start = datetime(jahr, monat, 1, tzinfo=timezone.utc)
    letzter = calendar.monthrange(jahr, monat)[1]
    ende = datetime(jahr, monat, letzter, 23, 59, 59, tzinfo=timezone.utc)
    return start, ende


def _transaktionen(konto_id: str, jahr: int, monat: int) -> list[dict]:
    start, ende = _monatsgrenzen(jahr, monat)
    tx = []
    seite = 1
    while True:
        d = _get("/transactions", {
            "bank_account_id": konto_id,
            "settled_at_from": start.strftime("%Y-%m-%dT%H:%M:%S.000Z"),
            "settled_at_to": ende.strftime("%Y-%m-%dT%H:%M:%S.000Z"),
            "per_page": 100, "current_page": seite, "sort_by": "settled_at:asc",
        })
        tx += d.get("transactions", [])
        meta = d.get("meta", {})
        if seite >= (meta.get("total_pages") or 1):
            break
        seite += 1
    return tx


def kontoauszug_ablegen(jahr: int, monat: int, konto_id: str | None = None) -> dict:
    """Legt den offiziellen Qonto-Monatsauszug in 02_Kontoauszüge ab.

    Ausschliesslich das Original von Qonto -- kein selbst erzeugtes Ersatz-PDF.
    Solange Qonto den Auszug nicht bereitstellt, wird nichts abgelegt und der
    Zustand als offener Punkt gemeldet.
    """
    if not konfiguriert():
        raise RuntimeError(
            "Qonto nicht konfiguriert. Bitte API-Login und Secret links unter "
            "Einstellungen › Zugänge eintragen (aus developers.qonto.com)."
        )
    ks = konten()
    if not ks:
        raise RuntimeError("Kein Qonto-Bankkonto gefunden.")
    konto = next((k for k in ks if k["id"] == konto_id), ks[0])

    zielordner = config.get_finanzen_root() / "02_Kontoauszüge"
    zielordner.mkdir(parents=True, exist_ok=True)
    basis = f"{monat:02d}_{config.MONATSNAMEN[monat]}_Qonto"
    ziel = zielordner / f"{basis}.pdf"
    vorlaeufig = zielordner / f"{basis}_vorlaeufig.pdf"
    if ziel.exists():
        return {"abgelegt": False, "uebersprungen": True, "datei": ziel.name}

    # Weg 1: offizielles Statement-PDF von Qonto (erst nach Monatsende verfügbar)
    try:
        seite = 1
        while True:
            st = _get("/statements", {"bank_account_ids[]": konto["id"],
                                      "per_page": 100, "current_page": seite})
            for s in st.get("statements", []):
                per = s.get("period")
                if isinstance(per, str):
                    passt = per == f"{monat:02d}-{jahr}"
                else:  # ältere API-Form: {"start_date": "JJJJ-MM-.."}
                    passt = str((per or {}).get("start_date") or "").startswith(f"{jahr}-{monat:02d}")
                if not passt:
                    continue
                url = ((s.get("file") or {}).get("file_url")
                       or s.get("pdf_url") or (s.get("attachment") or {}).get("url"))
                if url and _lade_datei(url, ziel):
                    vorlaeufig.unlink(missing_ok=True)  # Eigenbau durch Original ersetzen
                    return {"abgelegt": True, "quelle": "offizielles Qonto-Statement",
                            "datei": ziel.name}
            meta = st.get("meta", {})
            if seite >= (meta.get("total_pages") or 1):
                break
            seite += 1
    except Exception:
        pass  # Statement-Endpoint evtl. nicht verfügbar → Fallback

    # Kein Eigenbau mehr (Nutzer-Entscheidung, 22.08.2026): Frueher wurde aus
    # den Transaktionen ein eigenes PDF erzeugt, solange Qonto noch kein
    # Statement bereitgestellt hatte. Das sah aus wie ein Kontoauszug, war aber
    # keiner -- ein selbst gerechnetes Dokument hat im Steuerberater-Paket
    # nichts verloren. Abgelegt wird nur noch, was Qonto offiziell ausstellt.
    #
    # Frueher erzeugte "_vorlaeufig"-Dateien werden dabei aufgeraeumt, damit
    # kein Altbestand im Ordner zurueckbleibt.
    import datetime as _dt

    entfernt = None
    if vorlaeufig.exists():
        vorlaeufig.unlink()
        entfernt = vorlaeufig.name

    faellig = _dt.date(jahr + (monat // 12), (monat % 12) + 1, 1)
    return {
        "abgelegt": False,
        "datei": None,
        "entfernt": entfernt,
        "faellig_ab": faellig.isoformat(),
        "faellig_erreicht": _dt.date.today() >= faellig,
        "hinweis": ("Qonto hat für diesen Monat noch keinen offiziellen Auszug bereitgestellt. "
                    f"Er erscheint erfahrungsgemäß ab dem {faellig.strftime('%d.%m.%Y')}."),
    }


# Gebuehrenarten, fuer die Qonto selbst eine Rechnung ausstellt. Die haengt an
# der Buchung als Beleg -- ein eigener Rechnungs-Endpunkt existiert nicht.
GEBUEHR_TYPEN = {"qonto_fee", "subscription", "card_acquirer_payout_fee", "direct_debit_fee"}


def rechnungen_ablegen(jahr: int, monat: int, konto_id: str | None = None) -> dict:
    """Legt die Qonto-Rechnungen eines Monats bei den Eingangsrechnungen ab.

    Die Kontofuehrungsgebuehr ist eine Betriebsausgabe und braucht einen Beleg.
    Qonto stellt dafuer eine monatliche Sammelrechnung aus und haengt sie an
    JEDE Gebuehrenbuchung des Monats -- im Juli 2026 etwa an die 13,20 EUR
    Abogebuehr und an 0,44 EUR Transaktionsgebuehr, beide Male dieselbe Datei.
    Ohne Duplikatspruefung landete sie mehrfach im Ordner.

    Ebenfalls uebersprungen wird, was schon da ist: Dieselbe Rechnung kommt
    meist auch per E-Mail und wird vom Mail-Import abgeholt. Zwei Kopien
    derselben Rechnung im Steuerberater-Paket waeren ein Rueckfrage-Garant.
    """
    if not konfiguriert():
        raise RuntimeError(
            "Qonto nicht konfiguriert. Bitte API-Login und Secret links unter "
            "Einstellungen › Zugänge eintragen."
        )
    ziel_ordner = config.eingangsrechnungen_ordner(jahr, monat, anlegen=True)
    if ziel_ordner is None:
        raise RuntimeError(f"Kein Rechnungsordner für {monat:02d}/{jahr} gefunden.")

    if konto_id is None:
        alle = konten()
        if not alle:
            raise RuntimeError("Kein Qonto-Konto gefunden.")
        konto_id = alle[0]["id"]

    transaktionen = [t for t in _transaktionen(konto_id, jahr, monat)
                     if (t.get("operation_type") or "") in GEBUEHR_TYPEN]

    abgelegt, vorhanden, ohne_beleg, gesehen = [], [], 0, set()
    for t in transaktionen:
        beleg_ids = t.get("attachment_ids") or []
        if not beleg_ids:
            ohne_beleg += 1
            continue
        for beleg_id in beleg_ids:
            try:
                antwort = _get(f"/attachments/{beleg_id}")
            except Exception:
                continue
            beleg = antwort.get("attachment", antwort)
            name = (beleg.get("file_name") or f"qonto-{beleg_id}.pdf").strip()
            if name in gesehen:      # dieselbe Sammelrechnung an mehreren Buchungen
                continue
            gesehen.add(name)

            ziel = ziel_ordner / name
            if ziel.exists():
                vorhanden.append(name)
                continue
            url = beleg.get("url") or (beleg.get("file") or {}).get("file_url")
            if url and _lade_datei(url, ziel):
                abgelegt.append(name)

    # Wann die Rechnung zu erwarten ist: Qonto stellt sie am 1. des Folgemonats
    # aus, nachts. Nachgemessen an fuenf Monaten (Maerz bis Juli 2026): immer
    # der Erste, zwischen 01:52 und 07:42 Uhr. Ohne diese Angabe weiss niemand,
    # ob eine fehlende Rechnung ein Problem ist oder einfach zu frueh abgefragt.
    import datetime as _dt

    faellig = _dt.date(jahr + (monat // 12), (monat % 12) + 1, 1)
    return {
        "ordner": str(ziel_ordner),
        "abgelegt": abgelegt,
        "schon_vorhanden": vorhanden,
        "gebuehren_buchungen": len(transaktionen),
        "ohne_beleg": ohne_beleg,
        "summe": round(sum(float(t.get("amount") or 0) for t in transaktionen), 2),
        "faellig_ab": faellig.isoformat(),
        "faellig_erreicht": _dt.date.today() >= faellig,
    }
