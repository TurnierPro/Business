"""Automatische Rechnungs-Ablage im Hintergrund.

Holt regelmäßig (und beim App-Start) die Rechnungen aus Stripe und Apple Mail
und legt sie in den iCloud-Ordnern ab — ohne Klick. Die kostenpflichtige
KI-Prüfung wird NICHT automatisch ausgeführt.
"""

from __future__ import annotations

import json
import threading
import time
from datetime import datetime

import config
import geteilt

_STATUS = config.CACHE_DIR / "auto_status.json"


def _vormonat(jahr: int, monat: int) -> tuple[int, int]:
    return (jahr - 1, 12) if monat == 1 else (jahr, monat - 1)


def status() -> dict:
    if _STATUS.exists():
        try:
            return json.loads(_STATUS.read_text(encoding="utf-8"))
        except Exception:
            return {}
    return {}


def _schreibe_status(d: dict) -> None:
    try:
        _STATUS.write_text(json.dumps(d, ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception:
        pass


def auto_ablegen() -> dict:
    """Legt Stripe- und Mail-Rechnungen ab (aktueller + Vormonat für Stripe)."""
    jetzt = datetime.now()
    erg = {
        "zeit": jetzt.strftime("%d.%m.%Y %H:%M"),
        "stripe": 0, "mail": 0, "fehler": [],
    }

    if config.get_stripe_key():
        try:
            import stripe_service

            for (y, m) in ((jetzt.year, jetzt.month), _vormonat(jetzt.year, jetzt.month)):
                r = stripe_service.sync_monat(y, m)
                erg["stripe"] += len(r.get("abgelegt", []))
                # interne Sync-Fehler (z. B. fehlende Key-Rechte) sichtbar machen
                for f in r.get("fehler", []):
                    erg["fehler"].append(f"Stripe {m}/{y}: {f}")
        except Exception as exc:  # pragma: no cover
            erg["fehler"].append(f"Stripe: {exc}")

    if config.get_qonto_login() and config.get_qonto_secret():
        try:
            import qonto_service

            for (y, m) in ((jetzt.year, jetzt.month), _vormonat(jetzt.year, jetzt.month)):
                r = qonto_service.kontoauszug_ablegen(y, m)
                if r.get("abgelegt"):
                    erg["qonto"] = erg.get("qonto", 0) + 1
        except Exception as exc:  # pragma: no cover
            erg["fehler"].append(f"Qonto: {exc}")

    if config.get_imap_email() and config.get_imap_passwort():
        try:
            import mail_import_service

            r = mail_import_service.importiere()  # alle offenen, dedupliziert
            erg["mail"] += r.get("abgelegt_gesamt", 0)
        except Exception as exc:  # pragma: no cover
            erg["fehler"].append(f"Mail: {exc}")

    _schreibe_status(erg)
    return erg


def monatsabschluss(jahr: int, monat: int) -> dict:
    """Kompletter Monatsabschluss für einen (abgeschlossenen) Monat.

    Läuft automatisch am 3. des Folgemonats um 0:15: Belege ablegen (Stripe,
    Mail, Qonto), KI-Vollständigkeitsprüfung + Bericht +
    Belegpaket erzeugen und alles per E-Mail an die Buchhaltung senden.
    """
    schritte: list[str] = []
    fehler: list[str] = []
    anhaenge = []

    # 1) Belege ablegen (Stripe)
    if config.get_stripe_key():
        try:
            import stripe_service
            r = stripe_service.sync_monat(jahr, monat)
            schritte.append(f"Stripe: {len(r.get('abgelegt', []))} neu abgelegt")
            fehler += [f"Stripe: {f}" for f in r.get("fehler", [])]
        except Exception as exc:
            fehler.append(f"Stripe: {exc}")

    # 2) E-Mail-Postfach (Rechnungen/Auszahlungen/Posteingang)
    if config.get_imap_email() and config.get_imap_passwort():
        try:
            import mail_import_service
            r = mail_import_service.importiere()
            schritte.append(f"E-Mail-Postfach: {r.get('abgelegt_gesamt', 0)} neu abgelegt")
        except Exception as exc:
            fehler.append(f"Mail: {exc}")

    # 3) Qonto-Kontoauszug
    if config.get_qonto_login() and config.get_qonto_secret():
        try:
            import qonto_service
            r = qonto_service.kontoauszug_ablegen(jahr, monat)
            schritte.append(f"Qonto-Kontoauszug: {r.get('datei', 'abgelegt')}")
        except Exception as exc:
            fehler.append(f"Qonto: {exc}")

        # Kontofuehrungsgebuehr: Qonto stellt dafuer eine monatliche Rechnung
        # aus und haengt sie an die Gebuehrenbuchung. Ohne diesen Schritt fehlt
        # dem Steuerberater der Beleg zu einer Ausgabe, die jeden Monat kommt.
        try:
            import qonto_service
            r = qonto_service.rechnungen_ablegen(jahr, monat)
            if r["abgelegt"]:
                schritte.append(f"Qonto-Gebührenrechnung: {', '.join(r['abgelegt'])}")
            elif r["schon_vorhanden"]:
                schritte.append("Qonto-Gebührenrechnung: lag bereits im Ordner")
            elif r["ohne_beleg"]:
                # Qonto haengt die Rechnung erst ein paar Tage spaeter an --
                # das ist kein Fehler, muss aber sichtbar sein, sonst fehlt der
                # Beleg unbemerkt im Paket.
                datum = r.get("faellig_ab", "")
                tag = f"{datum[8:10]}.{datum[5:7]}.{datum[0:4]}" if datum else "dem 1. des Folgemonats"
                if r.get("faellig_erreicht"):
                    fehler.append(f"Qonto-Gebührenrechnung: {r['ohne_beleg']} Buchungen "
                                  f"({r['summe']} €) ohne Rechnung, obwohl sie seit {tag} "
                                  f"vorliegen müsste – bitte in Qonto nachsehen")
                else:
                    schritte.append(f"Qonto-Gebührenrechnung: kommt erst am {tag} "
                                    f"({r['summe']} € Gebühren gebucht)")
        except Exception as exc:
            fehler.append(f"Qonto-Gebührenrechnung: {exc}")

    # 4) KI-Prüfung + Bericht + Belegpaket
    analyse = None
    if config.get_anthropic_key():
        try:
            import bundle
            import claude_service
            import report
            res = claude_service.analysiere_monat(jahr, monat)
            analyse = res["analyse"]
            zeitraum = f"{config.MONATSNAMEN[monat]} {jahr}"
            pdf_ziel = config.OUTPUT_DIR / f"Bericht_{jahr}-{monat:02d}.pdf"
            report.erstelle_bericht(
                "Monatsbericht", zeitraum,
                [{"label": zeitraum, "analyse": analyse}], pdf_ziel)
            zip_ziel = config.OUTPUT_DIR / f"Belege_{jahr}-{monat:02d}.zip"
            bundle.baue_monatspaket(jahr, monat, pdf_ziel, zip_ziel)
            anhaenge = [pdf_ziel, zip_ziel]
            schritte.append("KI-Prüfung, Monatsbericht und Belegpaket erstellt")
        except Exception as exc:
            fehler.append(f"Bericht: {exc}")

    # 5) Zusammenfassung per E-Mail an die Buchhaltung
    versendet = ""
    try:
        import mail_service
        zeilen = [f"Monatsabschluss {config.MONATSNAMEN[monat]} {jahr}", ""]
        zeilen += [f"✓ {s}" for s in schritte]
        if analyse:
            a = analyse if isinstance(analyse, dict) else analyse.model_dump()
            ust = a.get("vereinnahmte_umsatzsteuer", 0) or 0
            vst = a.get("vorsteuer", 0) or 0
            zahllast = ust - vst
            durch_ein = sum(
                b["betrag_brutto"] for b in a.get("belege") or []
                if b.get("typ") == "Ausgangsrechnung" and config.ist_durchlaufend(b))
            durch_aus = sum(
                b["betrag_brutto"] for b in a.get("belege") or []
                if b.get("typ") != "Ausgangsrechnung" and config.ist_durchlaufend(b))
            zeilen += ["", "Einnahmen & Ausgaben:",
                       f"  Eingegangen (Einnahmen):  {a.get('einnahmen_gesamt', 0):.2f} €",
                       f"  Rausgegangen (Ausgaben):  {a.get('ausgaben_gesamt', 0):.2f} €",
                       f"  Ergebnis:                 {a.get('ergebnis', 0):.2f} €"]
            if durch_ein or durch_aus:
                echt = (a.get("einnahmen_gesamt", 0) - durch_ein) - (
                    a.get("ausgaben_gesamt", 0) - durch_aus)
                zeilen += [
                    "",
                    "Durchlaufende Posten (z. B. Camp-Gebühren, werden weitergeleitet):",
                    f"  In den Einnahmen enthalten: {durch_ein:.2f} €",
                    f"  In den Ausgaben enthalten:  {durch_aus:.2f} €",
                    f"  Echtes Ergebnis (ohne durchlaufende Posten): {echt:.2f} €"]
            zeilen += ["", "Steuern (Umsatzsteuer):",
                       f"  Vereinnahmte USt:         {ust:.2f} €",
                       f"  Abziehbare Vorsteuer:     {vst:.2f} €",
                       (f"  USt-Zahllast (ans Finanzamt): {zahllast:.2f} €" if zahllast >= 0
                        else f"  USt-Erstattung (vom Finanzamt): {abs(zahllast):.2f} €"),
                       "",
                       f"Fehlende Belege: {len(a.get('fehlende_belege', []) or [])}"]
        if fehler:
            zeilen += ["", "Hinweise/Fehler:"] + [f"• {f}" for f in fehler]
        zeilen += ["", "Bericht und Belegpaket im Anhang.",
                   "— TurnierPro Unternehmensdashboard (automatischer Lauf)"]
        versendet = mail_service.sende_email(
            f"Monatsabschluss {config.MONATSNAMEN[monat]} {jahr} – TurnierPro",
            "\n".join(zeilen), anhaenge)
        schritte.append(f"E-Mail an {versendet} versendet")
    except Exception as exc:
        fehler.append(f"E-Mail-Versand: {exc}")

    erg = {"zeit": datetime.now().strftime("%d.%m.%Y %H:%M"),
           "monat": f"{jahr}-{monat:02d}", "schritte": schritte,
           "fehler": fehler, "email_an": versendet}
    st = status()
    st["monatsabschluss"] = erg
    _schreibe_status(st)
    return erg


def _abschluss_faellig() -> tuple[int, int] | None:
    """Vormonat, wenn dessen Abschluss noch aussteht und der 3., 0:15 vorbei ist.

    Erst am 3.: Qonto erzeugt das offizielle Monats-Statement am 2. des
    Folgemonats nachmittags — vorher wäre nur der vorläufige Auszug im Paket.
    """
    e = config.lade_einstellungen()
    if not e.get("monatsabschluss_aktiv", True):
        return None
    if not geteilt.ist_automatik_mac():
        return None
    jetzt = datetime.now()
    stichtag = jetzt.replace(day=3, hour=0, minute=15, second=0, microsecond=0)
    if jetzt < stichtag:
        return None
    vj, vm = _vormonat(jetzt.year, jetzt.month)
    if geteilt.letzter_abschluss() >= f"{vj}-{vm:02d}":
        return None
    return (vj, vm)


def _abschluss_loop():
    # Prüft jede Minute; läuft der Rechner um 0:15 nicht, wird der Abschluss
    # beim nächsten App-Start nachgeholt (kein Monat geht verloren).
    time.sleep(45)
    while True:
        try:
            faellig = _abschluss_faellig()
        except Exception:  # pragma: no cover  (z. B. iCloud-Ordner kurz nicht erreichbar)
            faellig = None
        if faellig:
            try:
                monatsabschluss(*faellig)
            except Exception:  # pragma: no cover
                pass
            try:
                geteilt.merke_abschluss(*faellig)
            except Exception:  # pragma: no cover
                pass
        time.sleep(60)


def _loop():
    # Erster Lauf kurz nach dem Start, danach im eingestellten Intervall.
    time.sleep(15)
    while True:
        e = config.lade_einstellungen()
        try:
            darf = e.get("auto_ablegen", True) and geteilt.darf_automatik_laufen()
        except Exception:  # pragma: no cover
            darf = False
        if darf:
            try:
                auto_ablegen()
            except Exception:  # pragma: no cover
                pass
        intervall = float(config.lade_einstellungen().get("auto_intervall_stunden", 6) or 6)
        time.sleep(max(0.25, intervall) * 3600)


def starte_auto() -> None:
    """Startet die Hintergrund-Automatik (Daemon-Threads)."""
    threading.Thread(target=_loop, daemon=True).start()
    threading.Thread(target=_abschluss_loop, daemon=True).start()
