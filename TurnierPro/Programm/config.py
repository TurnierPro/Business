"""Zentrale Konfiguration der TurnierPro-App.

Drei Orte, sauber getrennt:

* Programmordner (APP_DIR): der Code. Liegt im geteilten iCloud-Ordner, damit
  beide Macs dieselbe Version nutzen.
* Lokaler Ordner (LOKAL_DIR): nur auf diesem Mac. Hier liegen Zugangsdaten,
  Einstellungen dieses Macs, Zwischenspeicher und erzeugte Berichte. Zugangs-
  daten gehören nie in den geteilten Ordner.
* Datenordner (get_daten_dir): geteilt zwischen den Macs. Vertrieb, Aufgaben,
  Projekte, Team. Jeder Mac schreibt dort nur in seine eigene Datei
  (siehe speicher.py), damit iCloud keine Konfliktkopien anlegt.
"""

from __future__ import annotations

import json
import os
import shutil
import sys
import uuid
from pathlib import Path

from dotenv import load_dotenv

# ── Verzeichnisse (Entwicklung vs. gebündelte .app) ─────────────────────
APP_DIR = Path(__file__).resolve().parent
# Sichtbarer Programmordner (z. B. „03_TurnierPro App“): der Code liegt darin im Unterordner „Programm“
BASIS_DIR = APP_DIR.parent if APP_DIR.name == "Programm" else APP_DIR
IST_GEPACKT = getattr(sys, "frozen", False)
RESSOURCEN_DIR = Path(getattr(sys, "_MEIPASS", APP_DIR)) if IST_GEPACKT else APP_DIR


def _standard_lokal_dir() -> Path:
    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support" / "TurnierPro"
    return Path.home() / ".turnierpro"


LOKAL_DIR = Path(os.environ.get("TP_LOKAL_DIR") or _standard_lokal_dir())
# Frühere Version (Steuer-Cockpit): Einstellungen, Cache und Projektordner-Merker
ALT_LOKAL_DIR = Path.home() / "Library" / "Application Support" / "TurnierPro-Cockpit"

LOKAL_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_DIR = LOKAL_DIR / "output"
CACHE_DIR = LOKAL_DIR / "cache"
OUTPUT_DIR.mkdir(exist_ok=True)
CACHE_DIR.mkdir(exist_ok=True)
# Kompatibilität: ältere Module sprechen noch von DATEN_DIR
DATEN_DIR = LOKAL_DIR

EINSTELLUNGEN_DATEI = LOKAL_DIR / "einstellungen.json"


def _alte_orte() -> list[Path]:
    """Wo die frühere Finanz-App ihre Daten abgelegt hat (für die Übernahme)."""
    orte = [ALT_LOKAL_DIR]
    merker = ALT_LOKAL_DIR / "projektordner"
    if merker.is_file():
        try:
            orte.append(Path(merker.read_text(encoding="utf-8").strip()))
        except OSError:
            pass
    return [o for o in orte if o.is_dir() and o.resolve() != LOKAL_DIR.resolve()]


def _uebernimm_alte_daten() -> None:
    """Einmalig: Einstellungen, .env und Cache der alten Finanz-App übernehmen.

    Wichtig ist vor allem mail_verarbeitet.json: ohne sie würde der Mail-Import
    alle schon abgelegten Rechnungen ein zweites Mal holen. Es wird nur kopiert,
    nie gelöscht.
    """
    if EINSTELLUNGEN_DATEI.exists():
        return
    alt: dict = {}
    for ort in _alte_orte():
        datei = ort / "einstellungen.json"
        if datei.is_file():
            try:
                alt = {**json.loads(datei.read_text(encoding="utf-8")), **alt}
            except (OSError, ValueError):
                pass
        env = ort / ".env"
        if env.is_file() and not (LOKAL_DIR / ".env").exists():
            shutil.copy2(env, LOKAL_DIR / ".env")
        for datei in (ort / "cache").glob("*.json") if (ort / "cache").is_dir() else []:
            ziel = CACHE_DIR / datei.name
            if not ziel.exists():
                shutil.copy2(datei, ziel)
    EINSTELLUNGEN_DATEI.write_text(json.dumps(alt, ensure_ascii=False, indent=2), encoding="utf-8")
    try:
        os.chmod(EINSTELLUNGEN_DATEI, 0o600)  # Zugangsdaten nur für diesen Benutzer
    except OSError:
        pass


_uebernimm_alte_daten()

# ── .env laden (lokal oder im Programmordner, falls vorhanden) ──────────
for _envp in (LOKAL_DIR / ".env", APP_DIR / ".env"):
    if _envp.exists():
        load_dotenv(_envp)

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "").strip()
STRIPE_API_KEY = os.getenv("STRIPE_API_KEY", "").strip()
# Modell ist konfigurierbar (Einstellungen oder .env).
# Für günstigere Läufe kann in .env CLAUDE_MODEL=claude-sonnet-5 gesetzt werden.
CLAUDE_MODEL = os.getenv("CLAUDE_MODEL", "claude-opus-5").strip()

FIRMENNAME = os.getenv("FIRMENNAME", "TurnierPro UG (haftungsbeschränkt)")

# E-Mail an den Steuerberater
STEUERBERATER_EMAIL = os.getenv("STEUERBERATER_EMAIL", "").strip()
STEUERBERATER_NAME = os.getenv("STEUERBERATER_NAME", "Steuerberater").strip()
ABSENDER_EMAIL = os.getenv("ABSENDER_EMAIL", "").strip()

# Rechnungs-Import aus iCloud Mail (IMAP)
IMAP_HOST = os.getenv("IMAP_HOST", "imap.mail.me.com").strip()
IMAP_EMAIL = os.getenv("IMAP_EMAIL", "").strip()
# App-spezifisches Passwort (appleid.apple.com → Anmelden & Sicherheit)
IMAP_APP_PASSWORT = os.getenv("IMAP_APP_PASSWORT", "").strip()
# Apple-Mail-Ordner mit den Rechnungen (Eingang = erhaltene, Ausgang = gestellte)
MAIL_ORDNER_EINGANG = os.getenv("MAIL_ORDNER_EINGANG", "Rechnungen Eingang").strip()
MAIL_ORDNER_AUSGANG = os.getenv("MAIL_ORDNER_AUSGANG", "Rechnungen Ausgang").strip()

# ── Im Tool änderbare Einstellungen dieses Macs (einstellungen.json) ────


def lade_einstellungen() -> dict:
    if EINSTELLUNGEN_DATEI.exists():
        try:
            return json.loads(EINSTELLUNGEN_DATEI.read_text(encoding="utf-8"))
        except Exception:
            return {}
    return {}


def speichere_einstellungen(neu: dict) -> None:
    akt = lade_einstellungen()
    akt.update({k: v for k, v in neu.items() if v is not None})
    tmp = EINSTELLUNGEN_DATEI.with_suffix(".tmp")
    tmp.write_text(json.dumps(akt, ensure_ascii=False, indent=2), encoding="utf-8")
    try:
        os.chmod(tmp, 0o600)
    except OSError:
        pass
    tmp.replace(EINSTELLUNGEN_DATEI)


# ── Dieser Mac ──────────────────────────────────────────────────────────
def _rechnername() -> str:
    """Feste Kennung der Hardware (Mac: IOPlatformUUID), sonst der Rechnername."""
    if sys.platform == "darwin":
        try:
            import re
            import subprocess

            aus = subprocess.run(["/usr/sbin/ioreg", "-rd1", "-c", "IOPlatformExpertDevice"],
                                 capture_output=True, text=True, timeout=5).stdout
            treffer = re.search(r'"IOPlatformUUID" = "([^"]+)"', aus)
            if treffer:
                return treffer.group(1)
        except (OSError, subprocess.SubprocessError):
            pass
    try:
        import socket

        return socket.gethostname()
    except OSError:
        return ""


def geraet_id() -> str:
    """Feste, zufällige Kennung dieses Macs. Bestimmt die eigene Journaldatei.

    Wurde einstellungen.json von einem anderen Mac kopiert (um Zugänge zu
    übertragen), passt der gespeicherte Rechnername nicht. Dann bekommt dieser
    Mac eine eigene Kennung und fragt neu, wer an ihm arbeitet. Sonst würden
    zwei Macs in dieselbe Journaldatei schreiben.
    """
    e = lade_einstellungen()
    rechner = _rechnername()
    if not e.get("geraet_id") or (e.get("geraet_rechner") and rechner and e["geraet_rechner"] != rechner):
        speichere_einstellungen({"geraet_id": uuid.uuid4().hex[:12], "geraet_rechner": rechner,
                                 "ich": "", "geraet_name": ""})
        e = lade_einstellungen()
    elif not e.get("geraet_rechner") and rechner:
        speichere_einstellungen({"geraet_rechner": rechner})
    return e["geraet_id"]


def geraet_name() -> str:
    gesetzt = (lade_einstellungen().get("geraet_name") or "").strip()
    if gesetzt:
        return gesetzt
    try:
        import socket

        return socket.gethostname().replace(".local", "")
    except OSError:
        return "Mac"


# ── Geteilter Datenordner ───────────────────────────────────────────────
def get_daten_dir() -> Path:
    """Geteilter Ordner mit Vertrieb, Aufgaben, Projekten und Team.

    Reihenfolge: in der App gesetzt → Umgebung TP_DATEN_DIR → neben dem
    Programmordner „TurnierPro Daten“. Liegt der Programmordner in iCloud,
    liegen die Daten damit automatisch auch dort und beide Macs sehen sie.
    """
    gesetzt = (lade_einstellungen().get("daten_ordner") or os.getenv("TP_DATEN_DIR", "")).strip()
    if gesetzt:
        ordner = Path(gesetzt).expanduser()
    elif IST_GEPACKT:
        # Gebündelte .app (DMG): der Programmordner liegt nicht in iCloud,
        # daher direkt im iCloud Drive einen gemeinsamen Ordner verwenden.
        ordner = Path.home() / "Library" / "Mobile Documents" / "com~apple~CloudDocs" / "TurnierPro Daten"
    else:
        ordner = _finde_datenordner(BASIS_DIR.parent)
    ordner.mkdir(parents=True, exist_ok=True)
    return ordner


def _hat_daten(ordner: Path) -> bool:
    """Enthält der Ordner schon Journaldateien (auch von iCloud ausgelagerte)?"""
    j = ordner / "journal"
    if not j.is_dir():
        return False
    return any(j.glob("*.jsonl")) or any(j.glob(".*.jsonl.icloud"))


def _finde_datenordner(basis: Path) -> Path:
    """Datenordner neben dem Programmordner finden.

    Standardname ist „TurnierPro Daten“. Wurde er umbenannt (z. B. in
    „04_TurnierPro App - Daten“), wird ein Nachbarordner mit „Daten“ im Namen
    genommen, der schon Daten enthält. Ein leerer Ordner zählt nicht, damit ein
    versehentlich neu angelegter, leerer „TurnierPro Daten“ nichts verdeckt.
    """
    standard = basis / "TurnierPro Daten"
    if _hat_daten(standard):
        return standard
    try:
        kandidaten = sorted(p for p in basis.iterdir() if p.is_dir() and "daten" in p.name.lower() and _hat_daten(p))
    except OSError:
        kandidaten = []
    return kandidaten[0] if kandidaten else standard


def daten_hinweis(ordner: Path) -> str:
    """Warnt, wenn der Datenordner offensichtlich nicht geteilt ist (nur auf dem Mac)."""
    if sys.platform != "darwin":
        return ""
    pfad = str(ordner)
    if any(t in pfad for t in ("Mobile Documents", "CloudDocs", "CloudStorage", "Dropbox")):
        return ""
    return ("Der Datenordner liegt nicht in iCloud. Der andere Mac sieht diese Daten nicht. "
            "Bitte den Programmordner in den geteilten iCloud-Ordner legen oder hier einen iCloud-Ordner eintragen.")


def geteilter_cache_dir() -> Path:
    """KI-Prüfungen werden geteilt, damit der zweite Mac sie nicht neu bezahlt."""
    ordner = get_daten_dir() / "cache"
    ordner.mkdir(parents=True, exist_ok=True)
    return ordner


def get_finanzen_root() -> Path:
    """Datenordner mit 01_Rechnungen, 02_Kontoauszüge, Finanzübersicht_*.xlsx.

    Reihenfolge: im Tool gesetzter Pfad → .env FINANZEN_ROOT → Elternordner der App.
    So läuft die App auch beim Kunden, egal wo seine Ordner liegen.
    """
    gesetzt = lade_einstellungen().get("finanzen_root") or os.getenv("FINANZEN_ROOT", "")
    if gesetzt.strip():
        p = Path(gesetzt).expanduser()
        # Wurde der Ordner umbenannt/verschoben, zeigt der gespeicherte Pfad ins
        # Leere. Dann lieber den Elternordner der App nehmen, statt zu scheitern.
        if p.is_dir() or IST_GEPACKT:
            return p
    # Liegt der Programmordner neben „02_Finanzen“, ist das der Finanzordner.
    for kandidat in (BASIS_DIR.parent / "02_Finanzen", BASIS_DIR.parent):
        if (kandidat / "02_Kontoauszüge").is_dir() or list(kandidat.glob("Finanz*bersicht_*.xlsx")):
            return kandidat
    # In der gebündelten App gibt es keinen sinnvollen Default → Nutzer setzt ihn.
    return LOKAL_DIR if IST_GEPACKT else BASIS_DIR.parent


def lade_defaults() -> dict:
    """Fest ins Tool eingebaute Vorgaben (Keys), die mit der App mitgeliefert werden.

    Reihenfolge bei Keys: Tool-Einstellung > app_defaults.json > .env/Umgebung.
    So bleiben Claude-/Stripe-Key dauerhaft gesetzt, ohne erneute Eingabe.
    """
    p = RESSOURCEN_DIR / "app_defaults.json"
    if p.exists():
        try:
            return json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            return {}
    return {}


def get_anthropic_key() -> str:
    return (lade_einstellungen().get("anthropic_api_key")
            or lade_defaults().get("anthropic_api_key")
            or ANTHROPIC_API_KEY).strip()


def get_stripe_key() -> str:
    return (lade_einstellungen().get("stripe_api_key")
            or lade_defaults().get("stripe_api_key")
            or STRIPE_API_KEY).strip()


def get_qonto_login() -> str:
    return (lade_einstellungen().get("qonto_login")
            or lade_defaults().get("qonto_login")
            or os.getenv("QONTO_LOGIN", "")).strip()


def get_qonto_secret() -> str:
    return (lade_einstellungen().get("qonto_secret")
            or lade_defaults().get("qonto_secret")
            or os.getenv("QONTO_SECRET", "")).strip()


def get_provision_camp() -> float:
    return float(lade_einstellungen().get("provision_camp", 0.03) or 0.03)


def get_provision_turnier() -> float:
    return float(lade_einstellungen().get("provision_turnier", 0.03) or 0.03)


# Bekannte IMAP-Server je Anbieter (aus der E-Mail-Adresse ableitbar)
IMAP_PROVIDER = {
    "icloud.com": "imap.mail.me.com", "me.com": "imap.mail.me.com", "mac.com": "imap.mail.me.com",
    "gmx.net": "imap.gmx.net", "gmx.de": "imap.gmx.net",
    "web.de": "imap.web.de",
    "gmail.com": "imap.gmail.com", "googlemail.com": "imap.gmail.com",
    "outlook.com": "outlook.office365.com", "hotmail.com": "outlook.office365.com",
    "ionos.de": "imap.ionos.de", "1und1.de": "imap.1und1.de",
    "turnierpro.de": "imap.ionos.de",  # TurnierPro-Postfächer laufen über IONOS
    "t-online.de": "secureimap.t-online.de",
}


def get_imap_host() -> str:
    """IMAP-Server: explizit gesetzt > aus E-Mail-Domain abgeleitet > iCloud-Default."""
    gesetzt = (lade_einstellungen().get("imap_host") or "").strip()
    if gesetzt:
        return gesetzt
    email = get_imap_email()
    if "@" in email:
        domain = email.split("@")[-1].lower()
        if domain in IMAP_PROVIDER:
            return IMAP_PROVIDER[domain]
    return (os.getenv("IMAP_HOST") or IMAP_HOST or "imap.mail.me.com").strip()


def get_imap_email() -> str:
    return (lade_einstellungen().get("imap_email") or IMAP_EMAIL).strip()


def get_imap_passwort() -> str:
    return (lade_einstellungen().get("imap_app_passwort") or IMAP_APP_PASSWORT).strip()


SMTP_PROVIDER = {
    "imap.mail.me.com": "smtp.mail.me.com",
    "imap.gmx.net": "mail.gmx.net",
    "imap.web.de": "smtp.web.de",
    "imap.gmail.com": "smtp.gmail.com",
    "outlook.office365.com": "smtp.office365.com",
    "imap.ionos.de": "smtp.ionos.de", "imap.1und1.de": "smtp.1und1.de",
    "secureimap.t-online.de": "securesmtp.t-online.de",
}


def get_smtp_host() -> str:
    """SMTP-Server: explizit gesetzt > vom IMAP-Server abgeleitet."""
    gesetzt = (lade_einstellungen().get("smtp_host") or "").strip()
    if gesetzt:
        return gesetzt
    imap = get_imap_host()
    return SMTP_PROVIDER.get(imap, imap.replace("imap.", "smtp.", 1))


def get_abschluss_email() -> str:
    """Empfänger der automatischen Monatsabschluss-Mail (Standard: eigenes Postfach)."""
    return (lade_einstellungen().get("abschluss_email") or "").strip() or get_imap_email()


def get_mail_ordner_eingang() -> str:
    return (lade_einstellungen().get("mail_ordner_eingang") or MAIL_ORDNER_EINGANG).strip()


def get_mail_ordner_ausgang() -> str:
    return (lade_einstellungen().get("mail_ordner_ausgang") or MAIL_ORDNER_AUSGANG).strip()


# ── Monats- und Quartals-Logik ──────────────────────────────────────────
MONATSNAMEN = {
    1: "Januar", 2: "Februar", 3: "März", 4: "April",
    5: "Mai", 6: "Juni", 7: "Juli", 8: "August",
    9: "September", 10: "Oktober", 11: "November", 12: "Dezember",
}


def monat_praefix(monat: int) -> str:
    """z.B. 7 -> '07_'  (passt auf Ordner wie '07_Juli')."""
    return f"{monat:02d}_"


def monatsordner_name(monat: int) -> str:
    """Kanonischer Ordnername, z.B. '07_Juli'."""
    return f"{monat:02d}_{MONATSNAMEN[monat]}"


def quartal_fuer_monat(monat: int) -> int:
    return (monat - 1) // 3 + 1


def quartal_ordner(monat: int) -> str:
    return f"Q{quartal_fuer_monat(monat)}"


def _finde_nach_praefix(basis: Path, monat: int, *, ordner: bool) -> Path | None:
    """Sucht in *basis* einen Eintrag, dessen Name mit '0M_' beginnt.

    Toleriert Tippfehler im Monatsnamen (z.B. '02_Feburar').
    """
    if not basis.is_dir():
        return None
    praefix = monat_praefix(monat)
    for eintrag in sorted(basis.iterdir()):
        if not eintrag.name.startswith(praefix):
            continue
        if ordner and eintrag.is_dir():
            return eintrag
        if not ordner and eintrag.is_file():
            return eintrag
    return None


def kontoauszug_pfad(monat: int) -> Path | None:
    """Findet den offiziellen Monats-Kontoauszug (PDF) anhand des '0M_'-Präfixes.

    Vorläufige Auszüge ('…_vorlaeufig.pdf', im laufenden Monat selbst erzeugt)
    zählen nicht — sie dürfen nicht ins Steuerberater-Paket.
    """
    basis = get_finanzen_root() / "02_Kontoauszüge"
    if not basis.is_dir():
        return None
    praefix = monat_praefix(monat)
    for eintrag in sorted(basis.iterdir()):
        if (eintrag.name.startswith(praefix) and eintrag.is_file()
                and "vorlaeufig" not in eintrag.name.lower()
                and "vorläufig" not in eintrag.name.lower()):
            return eintrag
    return None


def _monatsordner(unterordner: str, jahr: int, monat: int, *, anlegen: bool) -> Path | None:
    """Ermittelt den Rechnungs-Monatsordner.

    unterordner: '01_erhaltene' oder '02_gestellte'
    """
    quartal_dir = get_finanzen_root() / "01_Rechnungen" / str(jahr) / unterordner / quartal_ordner(monat)
    treffer = _finde_nach_praefix(quartal_dir, monat, ordner=True)
    if treffer is not None:
        return treffer
    if anlegen:
        ziel = quartal_dir / monatsordner_name(monat)
        ziel.mkdir(parents=True, exist_ok=True)
        return ziel
    return None


def eingangsrechnungen_ordner(jahr: int, monat: int, *, anlegen: bool = False) -> Path | None:
    return _monatsordner("01_erhaltene", jahr, monat, anlegen=anlegen)


def ausgangsrechnungen_ordner(jahr: int, monat: int, *, anlegen: bool = False) -> Path | None:
    return _monatsordner("02_gestellte", jahr, monat, anlegen=anlegen)


def pdfs_im_ordner(ordner: Path | None) -> list[Path]:
    if ordner is None or not ordner.is_dir():
        return []
    return sorted(p for p in ordner.iterdir() if p.suffix.lower() == ".pdf")


def ist_durchlaufend(beleg: dict) -> bool:
    """Durchlaufender Posten (z. B. Camp-Gebühren, die an den Verein weitergeleitet
    werden). Neue Analysen setzen das Feld 'durchlaufend'; für ältere, gecachte
    Analysen greift die Texterkennung am Aussteller/Typ."""
    if beleg.get("durchlaufend"):
        return True
    text = f"{beleg.get('aussteller', '')} {beleg.get('typ', '')}".lower()
    return "durchlaufend" in text or "weiterleitung" in text
