"""Zugriff auf den geteilten Speicher für alle Module (Server, Automatik, Export).

Ein eigenes Modul, damit z. B. auto_service.py den Speicher nutzen kann, ohne
app.py zu importieren.
"""

from __future__ import annotations

import threading
import time

import config
from speicher import Speicher

_speicher: Speicher | None = None
_lock = threading.Lock()


def speicher() -> Speicher:
    """Der Speicher im aktuell eingestellten Datenordner (wird bei Bedarf neu geöffnet)."""
    global _speicher
    ordner = config.get_daten_dir()
    with _lock:
        if _speicher is None or _speicher.ordner != ordner:
            _speicher = Speicher(ordner, config.geraet_id())
        return _speicher


def ich() -> str:
    """Team-Mitglied, das an diesem Mac arbeitet (lokal gespeichert)."""
    return (config.lade_einstellungen().get("ich") or "").strip()


# ── Automatik nur auf einem Mac ─────────────────────────────────────────
def automatik_besitzer() -> dict | None:
    sp = speicher()
    sp.aktualisieren()
    doc = sp.hole("einstellungen", "automatik")
    return doc if doc and doc.get("geraet") else None


def automatik_uebernehmen() -> None:
    werte = {"geraet": config.geraet_id(), "name": config.geraet_name(), "seit": int(time.time() * 1000)}
    sp = speicher()
    aktion = "upd" if sp.hole("einstellungen", "automatik") else "set"
    sp.schreibe([{"k": "einstellungen", "a": aktion, "id": "automatik", "w": werte}], von=ich())


def ist_automatik_mac() -> bool:
    b = automatik_besitzer()
    return bool(b and b.get("geraet") == config.geraet_id())


def darf_automatik_laufen(warten: float = 120.0) -> bool:
    """Darf dieser Mac jetzt Belege ablegen bzw. den Abschluss machen?

    Ist noch kein Mac festgelegt, übernimmt der erste Mac mit Zugangsdaten.
    Danach kurz warten und erneut prüfen: Hat der andere Mac fast gleichzeitig
    übernommen, gewinnt die spätere Eintragung und nur einer läuft.
    """
    b = automatik_besitzer()
    if b:
        return b.get("geraet") == config.geraet_id()
    if not (config.get_stripe_key() or config.get_imap_email() or config.get_qonto_login()):
        return False
    automatik_uebernehmen()
    time.sleep(warten)
    return ist_automatik_mac()


def letzter_abschluss() -> str:
    doc = speicher().hole("einstellungen", "automatik") or {}
    return doc.get("letzterAbschluss") or config.lade_einstellungen().get("letzter_monatsabschluss") or ""


def merke_abschluss(jahr: int, monat: int) -> None:
    wert = f"{jahr}-{monat:02d}"
    config.speichere_einstellungen({"letzter_monatsabschluss": wert})
    sp = speicher()
    aktion = "upd" if sp.hole("einstellungen", "automatik") else "set"
    sp.schreibe([{"k": "einstellungen", "a": aktion, "id": "automatik", "w": {"letzterAbschluss": wert}}], von=ich())
