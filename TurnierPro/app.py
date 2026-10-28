"""TurnierPro — lokaler Server der Unternehmens-App.

Start:  python app.py   (oder Doppelklick auf „TurnierPro starten.command“)
Öffnet sich unter http://localhost:8000

Bereiche: Start, Vertrieb, Aufgaben, Projekte, Finanzen (Steuer & Monats-
abschluss) und Einstellungen. Vertrieb, Aufgaben, Projekte und Team liegen im
geteilten Datenordner (speicher.py), die Finanzen im Finanzordner mit der
Finanzübersicht_JAHR.xlsx.
"""

from __future__ import annotations

import io
import os
import socket
import threading
import time
import traceback
import webbrowser
from pathlib import Path

from flask import Flask, abort, jsonify, request, send_file, send_from_directory

import bundle
import claude_service
import config
import excel_service
import report
import scanner
import geteilt
from geteilt import ich, speicher
from speicher import SpeicherFehler

VERSION = "2.0.0"

app = Flask(
    __name__,
    static_folder=str(config.RESSOURCEN_DIR / "static"),
    template_folder=str(config.RESSOURCEN_DIR / "templates"),
)
app.config["MAX_CONTENT_LENGTH"] = 30 * 1024 * 1024  # 30 MB Upload-Limit


# ── Seiten ──────────────────────────────────────────────────────────────
@app.errorhandler(Exception)
def _globaler_fehler(exc):
    """Sicherheitsnetz: jede unerwartete Ausnahme → saubere Antwort statt Absturz."""
    from werkzeug.exceptions import HTTPException

    if isinstance(exc, HTTPException):
        return exc  # 404 etc. normal behandeln
    traceback.print_exc()
    return jsonify({"ok": False, "fehler": f"Unerwarteter Fehler: {exc}"}), 500


ERLAUBTE_HOSTS = {"localhost", "127.0.0.1"}


@app.before_request
def _schutz():
    """Nur die App selbst darf den Server benutzen.

    * Host-Prüfung: schützt vor Webseiten, die per DNS-Trick auf localhost zeigen.
    * Ändernde Anfragen brauchen den Kopf „X-TurnierPro“. Fremde Webseiten
      können ihn nicht mitschicken, also auch nichts ändern oder auslösen.
    """
    host = (request.host or "").rsplit(":", 1)[0].strip("[]")
    if host not in ERLAUBTE_HOSTS:
        abort(403)
    if request.method not in ("GET", "HEAD", "OPTIONS") and request.headers.get("X-TurnierPro") != "1":
        abort(403)


@app.after_request
def _kopfzeilen(antwort):
    antwort.headers["X-Content-Type-Options"] = "nosniff"
    antwort.headers["X-Frame-Options"] = "DENY"
    antwort.headers["Referrer-Policy"] = "no-referrer"
    antwort.headers["Content-Security-Policy"] = (
        "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; "
        "script-src 'self'; font-src 'self'; connect-src 'self'; frame-ancestors 'none'")
    if request.path.startswith("/api/"):
        antwort.headers["Cache-Control"] = "no-store"
    return antwort


@app.get("/")
def index():
    return send_from_directory(app.template_folder, "index.html")


# ── Geteilter Speicher (Vertrieb, Aufgaben, Projekte, Team) ─────────────
_letzte_meldung = 0.0


def _melde_dich(sp: Speicher, sofort: bool = False) -> None:
    global _letzte_meldung
    if sofort or time.time() - _letzte_meldung > 60:
        _letzte_meldung = time.time()
        try:
            sp.melde_geraet(config.geraet_name(), ich())
        except OSError:
            pass


@app.get("/api/start")
def api_start():
    sp = speicher()
    _melde_dich(sp, sofort=True)
    return jsonify({
        "ok": True, "version": VERSION, "firmenname": config.FIRMENNAME,
        "geraet": {"id": config.geraet_id(), "name": config.geraet_name()},
        "ich": ich(), "daten_ordner": str(sp.ordner),
        "finanzen_root": str(config.get_finanzen_root()),
        "heute": time.strftime("%Y-%m-%d"),
    })


@app.get("/api/daten")
def api_daten():
    sp = speicher()
    sp.aktualisieren()
    return jsonify({"ok": True, "stand": sp.stand(), "daten": sp.alles(),
                    "geraete": sp.geraete(), "icloud_wartet": sp.icloud_wartet()})


@app.get("/api/daten/stand")
def api_daten_stand():
    sp = speicher()
    sp.aktualisieren()
    _melde_dich(sp)
    return jsonify({"ok": True, "stand": sp.stand(), "icloud_wartet": sp.icloud_wartet()})


@app.post("/api/daten")
def api_daten_schreiben():
    d = request.get_json(force=True, silent=True) or {}
    try:
        ids = speicher().schreibe(d.get("aenderungen"), von=ich())
    except SpeicherFehler as exc:
        return jsonify({"ok": False, "fehler": str(exc)}), 400
    except OSError as exc:
        return jsonify({"ok": False, "fehler": f"Datenordner nicht beschreibbar: {exc}"}), 500
    return jsonify({"ok": True, "ids": ids, "stand": speicher().stand()})


@app.post("/api/ich")
def api_ich():
    d = request.get_json(force=True, silent=True) or {}
    mitglied = str(d.get("mitglied") or "").strip()
    if mitglied and not speicher().hole("team", mitglied):
        return jsonify({"ok": False, "fehler": "Dieses Team-Mitglied gibt es nicht."}), 400
    config.speichere_einstellungen({"ich": mitglied})
    _melde_dich(speicher(), sofort=True)
    return jsonify({"ok": True, "ich": mitglied})


@app.post("/api/geraet")
def api_geraet():
    """Einstellungen nur für diesen Mac: Name und geteilter Datenordner."""
    d = request.get_json(force=True, silent=True) or {}
    neu = {}
    if "geraet_name" in d:
        neu["geraet_name"] = str(d.get("geraet_name") or "").strip()[:60]
    if "daten_ordner" in d:
        pfad = str(d.get("daten_ordner") or "").strip()
        if pfad and not Path(pfad).expanduser().is_absolute():
            return jsonify({"ok": False, "fehler": "Bitte einen vollständigen Pfad angeben (beginnt mit /)."}), 400
        neu["daten_ordner"] = pfad
    config.speichere_einstellungen(neu)
    sp = speicher()
    _melde_dich(sp, sofort=True)
    return jsonify({"ok": True, "daten_ordner": str(sp.ordner), "geraet_name": config.geraet_name()})


def _jahr() -> int:
    return int(time.strftime("%Y"))


# ── Status / Konfiguration ──────────────────────────────────────────────
@app.get("/api/config")
def api_config():
    return jsonify(
        {
            "firmenname": config.FIRMENNAME,
            "modell": config.CLAUDE_MODEL,
            "hat_anthropic_key": bool(config.get_anthropic_key()),
            "hat_stripe_key": bool(config.get_stripe_key()),
            "finanzen_root": str(config.get_finanzen_root()),
            "hat_qonto": bool(config.get_qonto_login() and config.get_qonto_secret()),
            "hat_mail": bool(config.get_imap_email() and config.get_imap_passwort()),
        }
    )


@app.get("/api/dashboard")
def api_dashboard():
    jahr = request.args.get("jahr", type=int, default=_jahr())
    try:
        return jsonify({"ok": True, **excel_service.dashboard_daten(jahr)})
    except FileNotFoundError as exc:
        return jsonify({"ok": False, "fehler": str(exc)}), 404
    except Exception as exc:  # pragma: no cover
        return jsonify({"ok": False, "fehler": f"Excel-Fehler: {exc}"}), 500


@app.get("/api/kategorien")
def api_kategorien():
    jahr = request.args.get("jahr", type=int, default=_jahr())
    try:
        return jsonify({"ok": True, **excel_service.kategorien_liste(jahr)})
    except FileNotFoundError as exc:
        return jsonify({"ok": False, "fehler": str(exc)}), 404
    except Exception as exc:  # pragma: no cover
        return jsonify({"ok": False, "fehler": f"Excel-Fehler: {exc}"}), 500


@app.post("/api/eintrag")
def api_eintrag():
    d = request.get_json(force=True)
    try:
        ergebnis = excel_service.eintrag_speichern(
            jahr=int(d["jahr"]),
            typ=str(d["typ"]),
            kategorie=str(d["kategorie"]),
            monat=int(d["monat"]),
            betrag=float(d["betrag"]),
            modus=str(d.get("modus", "add")),
        )
        return jsonify({"ok": True, **ergebnis})
    except PermissionError as exc:
        return jsonify({"ok": False, "fehler": str(exc)}), 403
    except (ValueError, KeyError, FileNotFoundError) as exc:
        return jsonify({"ok": False, "fehler": str(exc)}), 400
    except Exception as exc:  # pragma: no cover
        return jsonify({"ok": False, "fehler": f"Speichern fehlgeschlagen: {exc}"}), 500


@app.get("/api/mail/einstellungen")
def api_mail_einstellungen_get():
    return jsonify({
        "ok": True,
        "eingang": config.get_mail_ordner_eingang(),
        "ausgang": config.get_mail_ordner_ausgang(),
        "konto": config.get_imap_email() or "",
        "imap_host_gesetzt": (config.lade_einstellungen().get("imap_host") or "").strip(),
        "imap_host_erkannt": config.get_imap_host(),
        "passwort_gesetzt": bool(config.get_imap_passwort()),
        "konfiguriert": bool(config.get_imap_email() and config.get_imap_passwort()),
        "anthropic_gesetzt": bool(config.get_anthropic_key()),
        "stripe_gesetzt": bool(config.get_stripe_key()),
        "qonto_gesetzt": bool(config.get_qonto_login() and config.get_qonto_secret()),
        "monatsabschluss_aktiv": bool(config.lade_einstellungen().get("monatsabschluss_aktiv", True)),
        "abschluss_email": config.get_abschluss_email(),
        "finanzen_root": str(config.get_finanzen_root()),
        "finanzen_root_ok": (config.get_finanzen_root() / "02_Kontoauszüge").is_dir()
                            or bool(list(config.get_finanzen_root().glob("Finanz*bersicht_*.xlsx"))),
    })


@app.post("/api/mail/einstellungen")
def api_mail_einstellungen_post():
    d = request.get_json(force=True)
    config.speichere_einstellungen({
        "finanzen_root": (d.get("finanzen_root") or "").strip() or None,
        "imap_email": (d.get("email") or "").strip() or None,
        "imap_host": (d.get("imap_host") or "").strip() or None,
        # Passwörter/Keys nur überschreiben, wenn eingegeben (leer = unverändert)
        "imap_app_passwort": (d.get("passwort") or "").strip() or None,
        "anthropic_api_key": (d.get("anthropic_key") or "").strip() or None,
        "stripe_api_key": (d.get("stripe_key") or "").strip() or None,
        "qonto_login": (d.get("qonto_login") or "").strip() or None,
        "qonto_secret": (d.get("qonto_secret") or "").strip() or None,
        "mail_ordner_eingang": (d.get("eingang") or "").strip() or None,
        "mail_ordner_ausgang": (d.get("ausgang") or "").strip() or None,
        "auto_ablegen": d.get("auto_ablegen") if "auto_ablegen" in d else None,
        "auto_intervall_stunden": d.get("auto_intervall") if d.get("auto_intervall") else None,
        "monatsabschluss_aktiv": d.get("monatsabschluss_aktiv") if "monatsabschluss_aktiv" in d else None,
        "abschluss_email": (d.get("abschluss_email") or "").strip() or None,
    })
    return jsonify({"ok": True, "konfiguriert": bool(config.get_imap_email() and config.get_imap_passwort())})


@app.get("/api/mail/ordner")
def api_mail_ordner():
    try:
        import mail_import_service

        return jsonify({"ok": True, "ordner": mail_import_service.liste_ordner()})
    except RuntimeError as exc:
        return jsonify({"ok": False, "fehler": str(exc)}), 400
    except Exception as exc:  # pragma: no cover
        return jsonify({"ok": False, "fehler": f"Ordner-Abruf fehlgeschlagen: {exc}"}), 500


@app.post("/api/qonto/rechnungen")
def api_qonto_rechnungen():
    """Legt die Qonto-Gebührenrechnung eines Monats bei den Eingangsrechnungen ab."""
    d = request.get_json(silent=True) or {}
    jahr = int(d.get("jahr") or _jahr())
    monat = int(d.get("monat") or 1)
    try:
        import qonto_service

        return jsonify({"ok": True, **qonto_service.rechnungen_ablegen(jahr, monat)})
    except RuntimeError as exc:
        return jsonify({"ok": False, "fehler": str(exc)}), 400
    except Exception as exc:  # pragma: no cover
        return jsonify({"ok": False, "fehler": f"Qonto-Fehler: {exc}"}), 500


@app.post("/api/qonto/kontoauszug")
def api_qonto_kontoauszug():
    d = request.get_json(silent=True) or {}
    jahr = int(d.get("jahr") or _jahr())
    monat = int(d.get("monat", 1))
    try:
        import qonto_service

        return jsonify({"ok": True, **qonto_service.kontoauszug_ablegen(jahr, monat)})
    except RuntimeError as exc:
        return jsonify({"ok": False, "fehler": str(exc)}), 400
    except Exception as exc:  # pragma: no cover
        return jsonify({"ok": False, "fehler": f"Qonto-Fehler: {exc}"}), 500


@app.get("/api/automatik")
def api_automatik():
    import auto_service

    e = config.lade_einstellungen()
    b = geteilt.automatik_besitzer()
    return jsonify({
        "ok": True,
        "besitzer": {"geraet": b.get("geraet"), "name": b.get("name")} if b else None,
        "dieser": bool(b and b.get("geraet") == config.geraet_id()),
        "aktiv": e.get("auto_ablegen", True),
        "intervall": e.get("auto_intervall_stunden", 6),
        "abschluss_aktiv": bool(e.get("monatsabschluss_aktiv", True)),
        "abschluss_email": config.get_abschluss_email(),
        "letzter_lauf": auto_service.status(),
        "letzter_abschluss": geteilt.letzter_abschluss(),
    })


@app.post("/api/automatik/uebernehmen")
def api_automatik_uebernehmen():
    geteilt.automatik_uebernehmen()
    return api_automatik()


@app.get("/api/auto/status")
def api_auto_status():
    e = config.lade_einstellungen()
    import auto_service

    return jsonify({
        "ok": True,
        "aktiv": e.get("auto_ablegen", True),
        "intervall": e.get("auto_intervall_stunden", 6),
        "letzter_lauf": auto_service.status(),
    })


@app.post("/api/auto/jetzt")
def api_auto_jetzt():
    try:
        import auto_service

        return jsonify({"ok": True, **auto_service.auto_ablegen()})
    except Exception as exc:  # pragma: no cover
        return jsonify({"ok": False, "fehler": f"Auto-Ablage fehlgeschlagen: {exc}"}), 500


@app.post("/api/abschluss/jetzt")
def api_abschluss_jetzt():
    """Monatsabschluss manuell anstoßen (Standard: Vormonat)."""
    try:
        from datetime import datetime

        import auto_service

        d = request.get_json(silent=True) or {}
        jetzt = datetime.now()
        vj, vm = auto_service._vormonat(jetzt.year, jetzt.month)
        jahr = int(d.get("jahr") or vj)
        monat = int(d.get("monat") or vm)
        erg = auto_service.monatsabschluss(jahr, monat)
        geteilt.merke_abschluss(jahr, monat)
        return jsonify({"ok": True, **erg})
    except Exception as exc:  # pragma: no cover
        return jsonify({"ok": False, "fehler": f"Monatsabschluss fehlgeschlagen: {exc}"}), 500


@app.post("/api/mail-import")
def api_mail_import():
    d = request.get_json(silent=True) or {}
    jahr = d.get("jahr")
    monate = None
    if d.get("monat"):
        monate = [int(d["monat"])]
    elif d.get("quartal"):
        erster = (int(d["quartal"]) - 1) * 3 + 1
        monate = list(range(erster, erster + 3))
    try:
        import mail_import_service

        return jsonify({"ok": True, **mail_import_service.importiere(
            jahr=int(jahr) if jahr else None, monate=monate)})
    except (RuntimeError, FileNotFoundError) as exc:
        return jsonify({"ok": False, "fehler": str(exc)}), 400
    except Exception as exc:  # pragma: no cover
        return jsonify({"ok": False, "fehler": f"Mail-Import fehlgeschlagen: {exc}"}), 500


@app.post("/api/beleg-upload")
def api_beleg_upload():
    datei = request.files.get("datei")
    if datei is None or not datei.filename:
        return jsonify({"ok": False, "fehler": "Keine Datei ausgewählt."}), 400
    try:
        import beleg_service

        ergebnis = beleg_service.speichere_beleg(
            jahr=int(request.form["jahr"]),
            typ=str(request.form["typ"]),
            monat=int(request.form["monat"]),
            dateiname=datei.filename,
            daten=datei.read(),
        )
        return jsonify({"ok": True, **ergebnis})
    except (ValueError, KeyError) as exc:
        return jsonify({"ok": False, "fehler": str(exc)}), 400
    except Exception as exc:  # pragma: no cover
        return jsonify({"ok": False, "fehler": f"Upload fehlgeschlagen: {exc}"}), 500


@app.get("/api/status")
def api_status():
    jahr = request.args.get("jahr", type=int, default=_jahr())
    monat = request.args.get("monat", type=int)
    quartal = request.args.get("quartal", type=int)

    if quartal:
        monate = scanner.scan_quartal(jahr, quartal)
        return jsonify({"modus": "quartal", "jahr": jahr, "quartal": quartal, "monate": monate})
    if not monat:
        abort(400, "monat oder quartal erforderlich")
    scan = scanner.scan_monat(jahr, monat)
    return jsonify({"modus": "monat", "scan": scan, "checkliste": scanner.checkliste(scan)})


# ── KI-Vollständigkeitsprüfung ──────────────────────────────────────────
@app.post("/api/analyse")
def api_analyse():
    daten = request.get_json(force=True)
    jahr = int(daten["jahr"])
    monat = int(daten["monat"])
    force = bool(daten.get("force", False))
    try:
        ergebnis = claude_service.analysiere_monat(jahr, monat, force=force)
        return jsonify({"ok": True, **ergebnis})
    except (ValueError, RuntimeError) as exc:
        return jsonify({"ok": False, "fehler": str(exc)}), 400
    except Exception as exc:  # pragma: no cover
        return jsonify({"ok": False, "fehler": f"Unerwarteter Fehler: {exc}"}), 500


# ── Stripe-Sync ─────────────────────────────────────────────────────────
@app.post("/api/stripe/sync")
def api_stripe_sync():
    daten = request.get_json(force=True)
    jahr = int(daten["jahr"])
    monat = int(daten["monat"])
    try:
        import stripe_service

        ergebnis = stripe_service.sync_monat(jahr, monat)
        report = stripe_service.umsatz_aufschluesselung(jahr, monat)  # nur Report, Excel bleibt unberührt
        return jsonify({"ok": True, "report": report, **ergebnis})
    except RuntimeError as exc:
        return jsonify({"ok": False, "fehler": str(exc)}), 400
    except Exception as exc:  # pragma: no cover
        return jsonify({"ok": False, "fehler": f"Unerwarteter Fehler: {exc}"}), 500


@app.post("/api/stripe/report")
def api_stripe_report():
    d = request.get_json(force=True)
    try:
        import stripe_service

        return jsonify({"ok": True, "report": stripe_service.monatsreport(
            int(d["jahr"]), int(d["monat"]))})
    except RuntimeError as exc:
        return jsonify({"ok": False, "fehler": str(exc)}), 400
    except Exception as exc:  # pragma: no cover
        return jsonify({"ok": False, "fehler": f"Unerwarteter Fehler: {exc}"}), 500


# ── Bericht + ZIP erzeugen ──────────────────────────────────────────────
@app.post("/api/bericht")
def api_bericht():
    daten = request.get_json(force=True)
    jahr = int(daten["jahr"])
    monat = daten.get("monat")
    quartal = daten.get("quartal")

    try:
        if quartal:
            quartal = int(quartal)
            erster = (quartal - 1) * 3 + 1
            monate_analyse = []
            for m in range(erster, erster + 3):
                res = claude_service.analysiere_monat(jahr, m)
                monate_analyse.append(
                    {"label": f"{config.MONATSNAMEN[m]} {jahr}", "analyse": res["analyse"]}
                )
            zeitraum = f"Q{quartal} {jahr}"
            pdf_ziel = config.OUTPUT_DIR / f"Bericht_{jahr}-Q{quartal}.pdf"
            report.erstelle_bericht("Quartalsbericht", zeitraum, monate_analyse, pdf_ziel)
            zip_ziel = config.OUTPUT_DIR / f"Belege_{jahr}-Q{quartal}.zip"
            bundle.baue_quartalspaket(jahr, quartal, pdf_ziel, zip_ziel)
        else:
            monat = int(monat)
            res = claude_service.analysiere_monat(jahr, monat)
            monate_analyse = [
                {"label": f"{config.MONATSNAMEN[monat]} {jahr}", "analyse": res["analyse"]}
            ]
            zeitraum = f"{config.MONATSNAMEN[monat]} {jahr}"
            pdf_ziel = config.OUTPUT_DIR / f"Bericht_{jahr}-{monat:02d}.pdf"
            report.erstelle_bericht("Monatsbericht", zeitraum, monate_analyse, pdf_ziel)
            zip_ziel = config.OUTPUT_DIR / f"Belege_{jahr}-{monat:02d}.zip"
            bundle.baue_monatspaket(jahr, monat, pdf_ziel, zip_ziel)

        # E-Mail-Entwurf (.eml) an den Steuerberater mit Anhängen erzeugen
        import mail_service

        eml_ziel = config.OUTPUT_DIR / (pdf_ziel.stem.replace("Bericht", "Steuerberater") + ".eml")
        mail_service.erzeuge_eml(zeitraum, monate_analyse, pdf_ziel, zip_ziel, eml_ziel)

        return jsonify(
            {
                "ok": True,
                "bericht": pdf_ziel.name,
                "paket": zip_ziel.name,
                "mail": eml_ziel.name,
                "bericht_url": f"/download/{pdf_ziel.name}",
                "paket_url": f"/download/{zip_ziel.name}",
                "mail_url": f"/download/{eml_ziel.name}",
                "empfaenger": config.STEUERBERATER_EMAIL or "(noch nicht in .env gesetzt)",
            }
        )
    except (ValueError, RuntimeError) as exc:
        return jsonify({"ok": False, "fehler": str(exc)}), 400
    except Exception as exc:  # pragma: no cover
        return jsonify({"ok": False, "fehler": f"Unerwarteter Fehler: {exc}"}), 500


# ── Export und Import ───────────────────────────────────────────────────
@app.get("/api/export/<bereich>.<format>")
def api_export(bereich: str, format: str):
    import export_service

    heute = time.strftime("%Y-%m-%d")
    if bereich == "sicherung" and format == "json":
        daten, typ = export_service.sicherung(speicher()), "application/json"
    elif bereich in ("vertrieb", "aufgaben", "projekte") and format == "xlsx":
        daten = export_service.excel(speicher(), bereich)
        typ = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    elif bereich in ("vertrieb", "aufgaben", "projekte") and format == "pdf":
        daten = export_service.pdf(speicher(), bereich, config.RESSOURCEN_DIR / "static" / "img" / "logo.png")
        typ = "application/pdf"
    else:
        abort(404)
    name = f"TurnierPro_{bereich.capitalize()}_{heute}.{format}"
    return send_file(io.BytesIO(daten), mimetype=typ, as_attachment=True, download_name=name)


@app.post("/api/import")
def api_import():
    import import_service

    datei = request.files.get("datei")
    if datei is None or not datei.filename:
        return jsonify({"ok": False, "fehler": "Keine Datei ausgewählt."}), 400
    try:
        erg = import_service.importiere(speicher(), request.form.get("art", ""), datei.filename, datei.read(),
                                        ausfuehren=bool(request.form.get("ausfuehren")), von=ich())
    except (ValueError, KeyError, SpeicherFehler) as exc:
        return jsonify({"ok": False, "fehler": str(exc)}), 400
    except Exception as exc:  # pragma: no cover
        traceback.print_exc()
        return jsonify({"ok": False, "fehler": f"Die Datei konnte nicht gelesen werden: {exc}"}), 400
    return jsonify({"ok": True, **erg})


@app.get("/download/<path:name>")
def download(name: str):
    ziel = (config.OUTPUT_DIR / name).resolve()
    if config.OUTPUT_DIR.resolve() not in ziel.parents or not ziel.is_file():
        abort(404)
    return send_file(ziel, as_attachment=True)


PORT = 8000
URL = f"http://localhost:{PORT}"


def _oeffne_browser():
    webbrowser.open(URL)


def _oeffne_browser_wenn_bereit(timeout: float = 240.0):
    """Wartet, bis der Server antwortet, und öffnet dann erst den Browser.

    Ein fester Timer reicht nicht: liegt die .venv in iCloud, dauert allein das
    Laden der Pakete beim Kaltstart Minuten – der Browser stand dann vor einer
    Fehlerseite.
    """
    ende = time.monotonic() + timeout
    while time.monotonic() < ende:
        if _port_belegt(PORT):
            _oeffne_browser()
            return
        time.sleep(0.4)


def _port_belegt(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(("127.0.0.1", port)) == 0


def _starte_server():
    """Server mit Selbstheilung: läuft bei unerwartetem Abbruch weiter."""
    while True:
        try:
            app.run(host="127.0.0.1", port=PORT, threaded=True,
                    debug=False, use_reloader=False)
            break
        except OSError:
            break  # Port belegt → andere Instanz läuft bereits
        except Exception:  # pragma: no cover
            traceback.print_exc()
            time.sleep(1)  # neu versuchen, Prozess bleibt offen


def _starte_menueleiste():
    """Dauerhaftes Menüleisten-Symbol mit Öffnen/Beenden (nur in der App)."""
    try:
        import rumps

        class TurnierProApp(rumps.App):
            def __init__(self):
                super().__init__("TurnierPro", title="⚽ TurnierPro")
                self.menu = ["TurnierPro öffnen"]

            @rumps.clicked("TurnierPro öffnen")
            def _open(self, _):
                _oeffne_browser()

        TurnierProApp().run()
    except Exception:  # pragma: no cover
        traceback.print_exc()
        while True:  # Fallback: Prozess offen halten
            time.sleep(3600)


def main():
    # Doppelstart: läuft schon eine Instanz, nur Browser öffnen und beenden.
    if _port_belegt(PORT):
        if not os.environ.get("TP_KEIN_BROWSER"):
            _oeffne_browser()
        return
    import auto_service

    if not os.environ.get("TP_KEINE_AUTOMATIK"):
        auto_service.starte_auto()  # Belege ablegen + Monatsabschluss (nur auf dem Automatik-Mac)
    # Als Hintergrunddienst bzw. aus dem Programmfenster gestartet: kein Browser.
    if not os.environ.get("TP_KEIN_BROWSER"):
        threading.Thread(target=_oeffne_browser_wenn_bereit, daemon=True).start()
    if config.IST_GEPACKT:
        # Server im Hintergrund, Menüleiste im Haupt-Thread (bleibt offen)
        threading.Thread(target=_starte_server, daemon=True).start()
        _starte_menueleiste()
    else:
        _starte_server()  # Entwicklung: schlichter Server


if __name__ == "__main__":
    main()
