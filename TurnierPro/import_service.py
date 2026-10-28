"""Daten übernehmen: Excel-Exporte des bisherigen Artefakts, Termine, Website-Besuche, Sicherung.

Ablauf in einfachen Worten:
1. Datei lesen und erkennen, welche Tabellen drin sind (an den Spaltenköpfen).
2. Jede Zeile in einen Eintrag der App übersetzen (Vereine, Kontakte, Aufgaben …).
3. Doppelte erkennen (gleicher Vereinsname, gleiche Aufgabe …) und weglassen.
4. Erst prüfen und anzeigen, dann auf Knopfdruck schreiben.
"""

from __future__ import annotations

import csv
import io
import json
from datetime import date, datetime

from speicher import Speicher, neue_id

# ── Feste Listen (wie in der Oberfläche, static/js/stammdaten.js) ───────
ERG = ["Keine Rückmeldung", "Rückmeldung und Interesse", "Rückmeldung und kein Interesse",
       "Möchte Demo-Session", "Abschluss", "Folgetermin vereinbart"]
ERGTXT = {
    "Telefon (Cold Call)": ["Keine Rückmeldung (nicht erreicht / Mailbox)", "Gespräch geführt, Interesse", "Gespräch geführt, kein Interesse", "Möchte Demo-Session (im Gespräch vereinbart)", "Abschluss (im Gespräch)", "Folgetermin vereinbart (Rückruf oder Gesprächstermin)"],
    "E-Mail": ["Keine Rückmeldung auf die E-Mail", "E-Mail-Antwort mit Interesse", "E-Mail-Antwort ohne Interesse", "Möchte Demo-Session (per E-Mail angefragt)", "Abschluss (per E-Mail bestätigt)", "Folgetermin per E-Mail vereinbart"],
    "WhatsApp": ["Keine Rückmeldung auf die WhatsApp-Nachricht", "WhatsApp-Antwort mit Interesse", "WhatsApp-Antwort ohne Interesse", "Möchte Demo-Session (per WhatsApp angefragt)", "Abschluss (per WhatsApp bestätigt)", "Folgetermin per WhatsApp vereinbart"],
    "Social Media": ["Keine Antwort auf die Nachricht", "Antwort mit Interesse", "Antwort ohne Interesse", "Möchte Demo-Session (per Nachricht angefragt)", "Abschluss (per Nachricht bestätigt)", "Folgetermin per Nachricht vereinbart"],
    "Persönlicher Kontakt": ["Keine Rückmeldung (nicht angetroffen)", "Gespräch vor Ort, Interesse", "Gespräch vor Ort, kein Interesse", "Möchte Demo-Session (vor Ort vereinbart)", "Abschluss (vor Ort)", "Folgetermin vor Ort vereinbart"],
    "Kontaktformular": ["Keine Rückmeldung auf die Formularanfrage", "Antwort auf die Anfrage mit Interesse", "Antwort auf die Anfrage ohne Interesse", "Möchte Demo-Session (über Formular angefragt)", "Abschluss (über Formular)", "Folgetermin nach Formularanfrage vereinbart"],
}
WIEDERHOLUNG = {"einmalig": "", "täglich": "daily", "werktags (mo–fr)": "weekdays", "wöchentlich": "weekly",
                "alle 2 wochen": "biweekly", "monatlich": "monthly", "vierteljährlich": "quarterly", "jährlich": "yearly"}
LEER_NAMEN = {"", "nicht zugewiesen", "unbekannt", "–", "-"}


def _ergebnis(kanal: str, text: str) -> str:
    """Anzeigetext (je Kontaktart) zurück in den gespeicherten Grundwert übersetzen."""
    if text in ERG:
        return text
    for i, t in enumerate(ERGTXT.get(kanal, [])):
        if t == text:
            return ERG[i]
    for liste in ERGTXT.values():
        if text in liste:
            return ERG[liste.index(text)]
    return text


# ── Zellen lesen ────────────────────────────────────────────────────────
def _text(v) -> str:
    if v is None:
        return ""
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    return str(v).strip()


def _datum(v) -> str:
    if v is None or v == "":
        return ""
    if isinstance(v, datetime):
        return v.date().isoformat()
    if isinstance(v, date):
        return v.isoformat()
    s = str(v).strip()
    if len(s) >= 10 and s[4] == "-" and s[7] == "-":
        return s[:10]
    teile = s.split(" ")[0].split(".")
    if len(teile) == 3 and all(t.isdigit() for t in teile):
        t, m, j = teile
        j = j if len(j) == 4 else "20" + j
        return f"{int(j):04d}-{int(m):02d}-{int(t):02d}"
    return ""


def _zahl(v) -> float:
    if v is None or v == "":
        return 0.0
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).replace("€", "").replace(" ", "").strip()
    if "," in s:
        s = s.replace(".", "").replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return 0.0


def _ms(v) -> int:
    if isinstance(v, datetime):
        return int(v.timestamp() * 1000)
    d = _datum(v)
    return int(datetime.fromisoformat(d).timestamp() * 1000) if d else 0


# ── Tabellen aus Datei holen ────────────────────────────────────────────
def _tabellen_aus_xlsx(daten: bytes) -> list[tuple[str, list[list]]]:
    import openpyxl

    wb = openpyxl.load_workbook(io.BytesIO(daten), data_only=True, read_only=True)
    return [(ws.title, [list(r) for r in ws.iter_rows(values_only=True)]) for ws in wb.worksheets]


def _tabelle_aus_csv(daten: bytes) -> list[list]:
    for kodierung in ("utf-8-sig", "cp1252"):
        try:
            text = daten.decode(kodierung)
            break
        except UnicodeDecodeError:
            continue
    else:
        raise ValueError("Die CSV-Datei hat eine unbekannte Zeichenkodierung.")
    trenner = ";" if text.split("\n", 1)[0].count(";") >= text.split("\n", 1)[0].count(",") else ","
    return [row for row in csv.reader(io.StringIO(text), delimiter=trenner)]


def _mit_kopf(zeilen: list[list], muss: set[str]) -> list[dict]:
    """Sucht die Kopfzeile (enthält alle Pflichtspalten) und liefert die Zeilen als dicts."""
    for i, z in enumerate(zeilen[:30]):
        kopf = [_text(x) for x in z]
        if muss <= set(kopf):
            liste = []
            for r in zeilen[i + 1:]:
                if r is None or all(_text(x) == "" for x in r):
                    continue
                # Zwischenüberschriften wie „Offene Aufgaben (3)“ stehen allein in Spalte A
                if _text(r[0]) and all(_text(x) == "" for x in r[1:]):
                    continue
                d = {kopf[j]: r[j] for j in range(min(len(kopf), len(r))) if kopf[j]}
                liste.append(d)
            return liste
    return []


def _kopf_flexibel(zeilen: list[list], namen: dict[str, list[str]]) -> list[dict]:
    """Für Termine/Besuche: Spalten über mehrere mögliche Namen finden."""
    for i, z in enumerate(zeilen[:15]):
        kopf = [_text(x).lower() for x in z]
        zuordnung = {}
        for feld, kandidaten in namen.items():
            for k in kandidaten:
                if k in kopf:
                    zuordnung[feld] = kopf.index(k)
                    break
        if "datum" in zuordnung and len(zuordnung) >= 2:
            liste = []
            for r in zeilen[i + 1:]:
                if not r or all(_text(x) == "" for x in r):
                    continue
                liste.append({f: (r[j] if j < len(r) else None) for f, j in zuordnung.items()})
            return liste
    return []


# ── Übersetzen ──────────────────────────────────────────────────────────
class Plan:
    """Sammelt, was geschrieben würde, und erkennt Doppelte."""

    def __init__(self, sp: Speicher):
        self.sp = sp
        self.aend: list[dict] = []
        self.zahl: dict[str, dict] = {}
        self.hinweise: list[str] = []
        self.team = {str(t.get("name", "")).strip().lower(): t["id"] for t in sp.liste("team")}
        self.vereine = {str(v.get("name", "")).strip().lower(): v["id"] for v in sp.liste("vereine")}
        vname = {v["id"]: str(v.get("name", "")).lower() for v in sp.liste("vereine")}
        self.akt = {(vname.get(a.get("vereinId"), ""), a.get("datum"), a.get("kanal"), (a.get("notiz") or "").strip())
                    for a in sp.liste("aktivitaeten")}
        self.aufgaben = {(str(t.get("titel", "")).strip().lower(), t.get("faellig") or "") for t in sp.liste("aufgaben")}
        self.projekte = {str(p.get("titel", "")).strip().lower(): p["id"] for p in sp.liste("projekte")}
        pname = {p["id"]: str(p.get("titel", "")).lower() for p in sp.liste("projekte")}
        self.komm = {(pname.get(c.get("projektId"), ""), (c.get("text") or "").strip()) for c in sp.liste("kommentare")}
        self.termine = {(str(t.get("titel", "")).lower(), t.get("datum")) for t in sp.liste("termine")}
        self.besuche = {b["id"] for b in sp.liste("besuche")}

    def zaehle(self, k: str, neu: bool) -> None:
        z = self.zahl.setdefault(k, {"neu": 0, "doppelt": 0})
        z["neu" if neu else "doppelt"] += 1

    def setze(self, k: str, werte: dict, doc_id: str | None = None) -> str:
        doc_id = doc_id or neue_id()
        self.aend.append({"k": k, "a": "set", "id": doc_id, "w": werte})
        self.zaehle(k, True)
        return doc_id

    def person(self, name) -> str:
        n = _text(name)
        if n.lower() in LEER_NAMEN:
            return ""
        if n.lower() not in self.team:
            self.team[n.lower()] = self.setze("team", {"name": n})
        return self.team[n.lower()]


def _vereine(plan: Plan, zeilen: list[dict]) -> None:
    for r in zeilen:
        name = _text(r.get("Verein"))
        if not name or name == "Noch keine Vereine":
            continue
        if name.lower() in plan.vereine:
            plan.zaehle("vereine", False)
            continue
        groesse = r.get("Teilnehmer")
        w = {
            "name": name, "verband": _text(r.get("Landesverband")), "bundesland": _text(r.get("Bundesland")),
            "strasse": _text(r.get("Straße")), "plz": _text(r.get("PLZ")), "ort": _text(r.get("Ort")),
            "person": _text(r.get("Ansprechperson")), "funktion": _text(r.get("Funktion")),
            "telefon": _text(r.get("Telefon")), "email": _text(r.get("E-Mail")), "entscheider": _text(r.get("Entscheider")),
            "betreuer": plan.person(r.get("Betreuer")),
            "veranstaltung": _text(r.get("Veranstaltung")), "art": _text(r.get("Art")),
            "terminVon": _datum(r.get("Termin von")), "terminBis": _datum(r.get("Termin bis")),
            "terminOffen": _text(r.get("Datum unbekannt")).lower() == "ja",
            "groesse": int(_zahl(groesse)) if _text(groesse) else "", "loesung": _text(r.get("Aktuelle Lösung")),
            "status": _text(r.get("Status")) or "Erstkontakt erfolgt", "potenzial": round(_zahl(r.get("Potenzial")), 2),
            "prio": _text(r.get("Prio")), "letzterKontakt": _datum(r.get("Letzter Kontakt")),
            "wiedervorlage": _datum(r.get("Wiedervorlage")), "naechsterSchritt": _text(r.get("Nächster Schritt")),
            "angelegt": int(datetime.now().timestamp() * 1000), "importiert": True,
        }
        plan.vereine[name.lower()] = plan.setze("vereine", w)


def _aktivitaeten(plan: Plan, zeilen: list[dict]) -> None:
    ohne = 0
    for r in zeilen:
        verein = _text(r.get("Verein"))
        if not verein or verein == "Noch keine Aktivitäten":
            continue
        vid = plan.vereine.get(verein.lower())
        if not vid:
            ohne += 1
            continue
        kanal, notiz, dat = _text(r.get("Kontaktart")), _text(r.get("Notiz")), _datum(r.get("Datum"))
        schluessel = (verein.lower(), dat, kanal, notiz)
        if schluessel in plan.akt:
            plan.zaehle("aktivitaeten", False)
            continue
        plan.akt.add(schluessel)
        plan.setze("aktivitaeten", {"vereinId": vid, "datum": dat, "kanal": kanal, "ergebnis": _ergebnis(kanal, _text(r.get("Ergebnis"))),
                                    "notiz": notiz, "von": plan.person(r.get("Mitarbeiter")), "angelegt": _ms(r.get("Datum")), "importiert": True})
    if ohne:
        wort = "Kontakt gehört" if ohne == 1 else "Kontakte gehören"
        plan.hinweise.append(f"{ohne} {wort} zu Vereinen, die nicht in der Datei stehen, und {'wird' if ohne == 1 else 'werden'} übersprungen.")


def _aufgaben(plan: Plan, zeilen: list[dict]) -> None:
    for r in zeilen:
        titel = _text(r.get("Aufgabe"))
        if not titel or titel == "Keine Aufgaben vorhanden":
            continue
        faellig = _datum(r.get("Erledigt bis"))
        if (titel.lower(), faellig) in plan.aufgaben:
            plan.zaehle("aufgaben", False)
            continue
        plan.aufgaben.add((titel.lower(), faellig))
        erledigt = _text(r.get("Status")).lower() == "erledigt"
        plan.setze("aufgaben", {"titel": titel, "notizen": _text(r.get("Notizen")), "zustaendig": plan.person(r.get("Zugewiesen an")),
                                "faellig": faellig, "wdh": WIEDERHOLUNG.get(_text(r.get("Wiederholung")).lower(), ""),
                                "prio": "high" if _text(r.get("Priorität")).lower() == "hoch" else "", "erledigt": erledigt,
                                "erledigtAm": "" if not erledigt else faellig, "angelegt": int(datetime.now().timestamp() * 1000), "importiert": True})


def _projekte(plan: Plan, zeilen: list[dict]) -> None:
    for r in zeilen:
        titel = _text(r.get("Projekt"))
        if not titel or titel == "Noch keine Projekte":
            continue
        if titel.lower() in plan.projekte:
            plan.zaehle("projekte", False)
            continue
        wer = [plan.person(n) for n in _text(r.get("Zugewiesen an")).split(",")]
        plan.projekte[titel.lower()] = plan.setze("projekte", {
            "titel": titel, "notizen": _text(r.get("Beschreibung / Notizen")), "status": _text(r.get("Status")) or "Idee",
            "prio": {"hoch": "hoch", "niedrig": "niedrig"}.get(_text(r.get("Priorität")).lower(), "normal"),
            "verantwortlich": [w for w in wer if w], "angelegt": int(datetime.now().timestamp() * 1000), "importiert": True})


def _kommentare(plan: Plan, zeilen: list[dict]) -> None:
    for r in zeilen:
        projekt, text = _text(r.get("Projekt")), _text(r.get("Kommentar / aktueller Stand"))
        pid = plan.projekte.get(projekt.lower())
        if not pid or not text:
            continue
        if (projekt.lower(), text) in plan.komm:
            plan.zaehle("kommentare", False)
            continue
        plan.komm.add((projekt.lower(), text))
        plan.setze("kommentare", {"projektId": pid, "text": text, "von": plan.person(r.get("Von")), "zeit": _ms(r.get("Zeitpunkt")), "importiert": True})


def _artefakt(plan: Plan, daten: bytes) -> None:
    tabellen = _tabellen_aus_xlsx(daten)
    erkannt = False
    for _name, zeilen in tabellen:
        for muss, fn in (({"Verein", "Landesverband", "Status"}, _vereine),
                         ({"Datum", "Verein", "Kontaktart", "Ergebnis"}, _aktivitaeten),
                         ({"Aufgabe", "Zugewiesen an", "Erledigt bis"}, _aufgaben),
                         ({"Projekt", "Status", "Priorität"}, _projekte),
                         ({"Projekt", "Zeitpunkt", "Kommentar / aktueller Stand"}, _kommentare)):
            liste = _mit_kopf(zeilen, muss)
            if liste:
                fn(plan, liste)
                erkannt = True
                break
    if not erkannt:
        plan.hinweise.append("In dieser Datei wurden keine Vertriebs-, Aufgaben- oder Projekt-Tabellen erkannt. "
                             "Bitte im Artefakt „Export ▾ → Als Excel speichern“ verwenden.")


def _zeilen_flexibel(daten: bytes, dateiname: str, namen: dict) -> list[dict]:
    if dateiname.lower().endswith(".xlsx"):
        for _n, zeilen in _tabellen_aus_xlsx(daten):
            liste = _kopf_flexibel(zeilen, namen)
            if liste:
                return liste
        return []
    return _kopf_flexibel(_tabelle_aus_csv(daten), namen)


def _termine(plan: Plan, daten: bytes, dateiname: str) -> None:
    namen = {"titel": ["titel", "name", "turnier", "veranstaltung", "title"], "datum": ["datum", "von", "start", "beginn", "date"],
             "ende": ["ende", "bis", "end"], "ort": ["ort", "place", "stadt"], "art": ["art", "typ", "kind"],
             "veranstalter": ["veranstalter", "verein", "org", "organisator"], "url": ["url", "link"]}
    for r in _zeilen_flexibel(daten, dateiname, namen):
        titel, dat = _text(r.get("titel")), _datum(r.get("datum"))
        if not titel or not dat:
            continue
        if (titel.lower(), dat) in plan.termine:
            plan.zaehle("termine", False)
            continue
        plan.termine.add((titel.lower(), dat))
        art = "camp" if "camp" in _text(r.get("art")).lower() else "turnier"
        url = _text(r.get("url"))
        plan.setze("termine", {"titel": titel, "datum": dat, "ende": _datum(r.get("ende")), "ort": _text(r.get("ort")), "art": art,
                               "veranstalter": _text(r.get("veranstalter")), "url": url if url.startswith("https://") else ""})
    if plan.zahl.get("termine", {}).get("neu"):
        heute = date.today().isoformat()
        aktion = "upd" if plan.sp.hole("einstellungen", "termine") else "set"
        plan.aend.append({"k": "einstellungen", "a": aktion, "id": "termine", "w": {"stand": heute}})


def _besuche(plan: Plan, daten: bytes, dateiname: str) -> None:
    namen = {"datum": ["datum", "tag", "date"], "besucher": ["besucher", "visitors", "nutzer", "users"], "klicks": ["klicks", "clicks", "aufrufe", "seitenaufrufe", "pageviews"]}
    for r in _zeilen_flexibel(daten, dateiname, namen):
        dat = _datum(r.get("datum"))
        if not dat:
            continue
        vorhanden = dat.replace("-", "") in plan.besuche
        plan.aend.append({"k": "besuche", "a": "set", "id": dat.replace("-", ""),
                          "w": {"datum": dat, "besucher": int(_zahl(r.get("besucher"))), "klicks": int(_zahl(r.get("klicks")))}})
        plan.zaehle("besuche", not vorhanden)
    if plan.zahl.get("besuche", {}).get("doppelt"):
        plan.hinweise.append("Vorhandene Tage werden mit den neuen Zahlen überschrieben.")


def _sicherung(plan: Plan, daten: bytes) -> None:
    try:
        inhalt = json.loads(daten.decode("utf-8"))
    except (UnicodeDecodeError, ValueError):
        raise ValueError("Die Datei ist keine gültige Sicherung (JSON).")
    sammlungen = inhalt.get("daten") if isinstance(inhalt, dict) else None
    if not isinstance(sammlungen, dict):
        raise ValueError("Die Datei ist keine Sicherung dieser App.")
    for k, docs in sammlungen.items():
        if not isinstance(docs, list):
            continue
        for d in docs:
            if not isinstance(d, dict) or not d.get("id"):
                continue
            if plan.sp.hole(k, str(d["id"])) is not None:
                plan.zaehle(k, False)
                continue
            plan.setze(k, {f: w for f, w in d.items() if f != "id" and not str(f).startswith("_")}, str(d["id"]))


def importiere(sp: Speicher, art: str, dateiname: str, daten: bytes, ausfuehren: bool, von: str = "") -> dict:
    sp.aktualisieren()
    plan = Plan(sp)
    if art == "artefakt":
        if not dateiname.lower().endswith(".xlsx"):
            raise ValueError("Bitte die Excel-Datei (.xlsx) aus dem Artefakt wählen.")
        _artefakt(plan, daten)
    elif art == "termine":
        _termine(plan, daten, dateiname)
    elif art == "besuche":
        _besuche(plan, daten, dateiname)
    elif art == "sicherung":
        _sicherung(plan, daten)
    else:
        raise ValueError("Unbekannte Importart.")
    neu = sum(z["neu"] for z in plan.zahl.values())
    if not ausfuehren:
        return {"sammlungen": plan.zahl, "hinweise": plan.hinweise, "neu_gesamt": neu}
    for i in range(0, len(plan.aend), 1500):
        sp.schreibe(plan.aend[i:i + 1500], von=von)
    return {"fertig": True, "geschrieben": neu, "sammlungen": plan.zahl}
