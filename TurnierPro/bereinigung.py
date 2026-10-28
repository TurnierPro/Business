"""Bereinigt das Ergebnis der KI-Prüfung, bevor es in Bericht und E-Mail landet.

Die KI liest jede PDF als eigenen Beleg. Dadurch entstanden falsche Summen:
- Übersichten (Stripe-Zahlungsübersicht, Stripe-Auszahlung aufs eigene Konto)
  wurden als Ausgaben gezählt, obwohl sie keine eigenen Geldbewegungen sind.
- Zu einer Zahlung liegen oft zwei PDFs vor (Quittung + Rechnung, z. B. Abo-Beleg
  und Stripe-Rechnung, Lovable, Resend) – sie wurden doppelt gezählt.
- Auszahlungen an Vereine (Weiterleitung der Startgelder) standen bei den
  Einnahmen statt bei den Ausgaben.
- Ohne Kontoauszug hat die KI Einnahmen/Ausgaben mit 0 angesetzt.

Die Summen kommen deshalb aus der Finanzübersicht (wie im Dashboard), die
Belegliste wird regelbasiert bereinigt. Durchlaufende Posten (Startgelder und
deren Weiterleitung) werden zu den Summen addiert, damit „Eingegangen“ und
„Rausgegangen“ den echten Geldfluss zeigen und das „echte Ergebnis“ genau dem
Dashboard entspricht.
"""

from __future__ import annotations

import copy
import re

import config

# Dateien, die nur zusammenfassen bzw. Umbuchungen aufs eigene Konto sind.
_UEBERSICHT = re.compile(r"Stripe_Zahlungsuebersicht|Stripe_Payouts|_Stripe_IhreAuszahlung", re.I)
# Auszahlungsbestätigungen an Vereine/Veranstalter (Mails von TurnierPro).
_WEITERLEITUNG = re.compile(r"Auszahlung|^\d{4}-\d{2}-\d{2}_TurnierPro_", re.I)
_ABO_QUITTUNG = re.compile(r"_Abo_Beleg-")
_STRIPE_RECHNUNG = re.compile(r"_Stripe_Rechnung_")

# KI-Hinweise, die durch die Bereinigung überholt sind.
_UEBERHOLT = re.compile(r"mit 0 |0 angesetzt|0 gesetzt|doppel|dublette|durchlaufend", re.I)


def _anbieter(beleg: dict) -> str:
    worte = re.findall(r"\w+", (beleg.get("aussteller") or "").lower())
    return worte[0] if worte else ""


def _ohne_dubletten(belege: list[dict]) -> tuple[list[dict], int]:
    """Entfernt Quittung/Rechnung-Paare derselben Zahlung."""
    behalten: list[dict] = []
    entfernt = 0

    # Abos: Stripe-Rechnung und Abo-Quittung beschreiben dieselbe Zahlung
    # (gleicher Tag, gleicher Betrag). Je Rechnung fällt eine Quittung weg.
    rechnungen: dict[tuple, int] = {}
    for b in belege:
        if _STRIPE_RECHNUNG.search(b["datei"]):
            k = (b["datum"], round(b["betrag_brutto"], 2))
            rechnungen[k] = rechnungen.get(k, 0) + 1

    gesehen_eingang: set[tuple] = set()
    for b in belege:
        k = (b["datum"], round(b["betrag_brutto"], 2))
        if _ABO_QUITTUNG.search(b["datei"]) and rechnungen.get(k, 0) > 0:
            rechnungen[k] -= 1
            entfernt += 1
            continue
        if b.get("typ") == "Eingangsrechnung":
            # Quittung + Rechnung bzw. doppelt abgelegte Datei desselben Anbieters
            ke = (*k, _anbieter(b))
            if ke in gesehen_eingang:
                entfernt += 1
                continue
            gesehen_eingang.add(ke)
        behalten.append(b)
    return behalten, entfernt


def _stripe_ust(jahr: int, monat: int) -> float | None:
    if not config.get_stripe_key():
        return None
    try:
        import stripe_service

        return stripe_service.umsatz_aufschluesselung(jahr, monat)["umsatzsteuer_gesamt"]
    except Exception:
        return None


def bereinige(jahr: int, monat: int, analyse: dict, *, hat_kontoauszug: bool) -> dict:
    a = copy.deepcopy(analyse)
    belege_roh = a.get("belege") or []

    belege: list[dict] = []
    uebersichten = 0
    for b in belege_roh:
        datei = b.get("datei", "")
        if _UEBERSICHT.search(datei):
            uebersichten += 1
            continue
        if b.get("typ") == "Ausgangsrechnung" and _WEITERLEITUNG.search(datei):
            b = {**b, "typ": "Weiterleitung", "durchlaufend": True}
        elif datei.startswith("Provisions-Aufstellung"):
            # Servicegebühr an die Vereine = eigener Umsatz
            b = {**b, "typ": "Ausgangsrechnung", "durchlaufend": False}
        belege.append(b)
    belege, dubletten = _ohne_dubletten(belege)
    belege.sort(key=lambda b: (b.get("datum") or "")[6:10] + (b.get("datum") or "")[3:5] + (b.get("datum") or "")[:2])
    a["belege"] = belege

    durch_ein = sum(b["betrag_brutto"] for b in belege
                    if b.get("typ") == "Ausgangsrechnung" and config.ist_durchlaufend(b))
    durch_aus = sum(b["betrag_brutto"] for b in belege
                    if b.get("typ") != "Ausgangsrechnung" and config.ist_durchlaufend(b))

    hinweise: list[str] = []
    try:
        import excel_service

        m = excel_service.dashboard_daten(jahr)["monate"][monat - 1]
        a["einnahmen_gesamt"] = round(m["einnahmen"] + durch_ein, 2)
        a["ausgaben_gesamt"] = round(m["ausgaben"] + durch_aus, 2)
        a["ergebnis"] = round(a["einnahmen_gesamt"] - a["ausgaben_gesamt"], 2)
        hinweise.append(
            f"Eigene Einnahmen ({_euro(m['einnahmen'])}) und Ausgaben "
            f"({_euro(m['ausgaben'])}) laut Finanzübersicht. Die Belegtabellen können "
            "leicht abweichen, z. B. bei Stripe- und Kontogebühren ohne Einzelbeleg oder "
            "Rechnungen in Fremdwährung."
        )
    except Exception:
        pass  # ohne Finanzübersicht bleiben die Werte der KI stehen

    ust = _stripe_ust(jahr, monat)
    if ust is None:
        ust = sum(b.get("umsatzsteuer") or 0 for b in belege
                  if b.get("typ") == "Ausgangsrechnung" and not config.ist_durchlaufend(b))
    a["vereinnahmte_umsatzsteuer"] = round(ust, 2)
    a["vorsteuer"] = round(sum(b.get("umsatzsteuer") or 0 for b in belege
                               if b.get("typ") == "Eingangsrechnung"), 2)

    if not hat_kontoauszug:
        hinweise.insert(0, "Der Kontoauszug für diesen Monat liegt noch nicht vor – die "
                           "Zuordnung der Belege zu Kontobewegungen steht daher noch aus.")
    if durch_ein or durch_aus:
        hinweise.append(
            f"Durchlaufende Posten: {_euro(durch_ein)} Startgelder/Camp-Gebühren "
            f"eingesammelt, {_euro(durch_aus)} an Vereine ausgezahlt (Weiterleitung "
            "teils erst im Folgemonat). Kein Umsatz bzw. Aufwand von TurnierPro – "
            "nur die Servicegebühr (Provision) ist Umsatz."
        )
    if dubletten or uebersichten:
        hinweise.append(
            f"Nicht doppelt gezählt: {dubletten} Quittung(en) zu bereits erfasster Rechnung"
            + (f", {uebersichten} Übersicht(en)/Auszahlung(en) aufs eigene Konto" if uebersichten else "")
            + " – die Dateien liegen trotzdem im Belegpaket."
        )
    ohne_ust = sorted({b["aussteller"] for b in belege
                       if b.get("typ") == "Eingangsrechnung" and not b.get("umsatzsteuer")})
    if ohne_ust:
        hinweise.append(
            f"Vorsteuer ({_euro(a['vorsteuer'])}) nur aus ausgewiesener USt. Rechnungen ohne "
            f"USt-Ausweis ({', '.join(ohne_ust)}) auf Reverse-Charge (§ 13b UStG) prüfen."
        )

    for h in a.get("hinweise") or []:
        if _UEBERHOLT.search(h) or "vorsteuer" in h.lower():
            continue
        if not hat_kontoauszug and "kontoauszug" in h.lower():
            continue  # steht schon als erster Hinweis oben
        hinweise.append(h)
    a["hinweise"] = hinweise
    return a


def _euro(betrag: float) -> str:
    s = f"{betrag:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return f"{s} €"
