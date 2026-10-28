"""Liest/schreibt die Finanzübersicht_<Jahr>.xlsx und liefert Dashboard-Daten.

Wichtig: Zellen können Formeln enthalten (z. B. '=74.29+28.05' oder '=SUM(C4:C9)').
openpyxl verwirft beim Speichern die gecachten Formel-Ergebnisse, deshalb wertet
diese App Formelzellen SELBST aus (sichere Arithmetik + SUM-Bereiche) und ist so
unabhängig vom Excel-Cache. Alle Beträge in EUR (brutto).
"""

from __future__ import annotations

import ast
import re
from pathlib import Path

from openpyxl.utils.cell import (
    column_index_from_string,
    coordinate_from_string,
    get_column_letter,
    range_boundaries,
)

import config

MONATS_KURZ = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun",
               "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"]


def _excel_pfad(jahr: int) -> Path | None:
    root = config.get_finanzen_root()
    for p in (root / f"Finanzübersicht_{jahr}.xlsx",
              root / f"Finanzuebersicht_{jahr}.xlsx"):
        if p.is_file():
            return p
    for p in sorted(root.glob("Finanz*bersicht_*.xlsx")):
        return p
    return None


# ── Sichere Formel-Auswertung ───────────────────────────────────────────
def _safe_arith(expr: str) -> float:
    """Wertet einen reinen Rechenausdruck sicher aus (+ - * / und Klammern)."""
    def ev(n):
        if isinstance(n, ast.Expression):
            return ev(n.body)
        if isinstance(n, ast.Constant) and isinstance(n.value, (int, float)):
            return float(n.value)
        if isinstance(n, ast.BinOp):
            a, b = ev(n.left), ev(n.right)
            if isinstance(n.op, ast.Add):
                return a + b
            if isinstance(n.op, ast.Sub):
                return a - b
            if isinstance(n.op, ast.Mult):
                return a * b
            if isinstance(n.op, ast.Div):
                return a / b if b else 0.0
            raise ValueError("Operator nicht erlaubt")
        if isinstance(n, ast.UnaryOp):
            v = ev(n.operand)
            if isinstance(n.op, ast.UAdd):
                return v
            if isinstance(n.op, ast.USub):
                return -v
            raise ValueError("Operator nicht erlaubt")
        raise ValueError("Ausdruck nicht erlaubt")

    return ev(ast.parse(expr, mode="eval"))


def _eval_formula(ws, expr: str, seen: set) -> float:
    try:
        e = expr.upper().replace(" ", "")

        def sum_repl(m):
            total = 0.0
            for part in m.group(1).split(","):
                if ":" in part:
                    c1, r1, c2, r2 = range_boundaries(part)
                    for rr in range(r1, r2 + 1):
                        for cc in range(c1, c2 + 1):
                            total += _val(ws, rr, cc, seen)
                elif part:
                    try:
                        col, row = coordinate_from_string(part.replace("$", ""))
                    except Exception:
                        # SUM() mit reiner Rechnung statt Zellbezug,
                        # z. B. '=SUM(5.49+16.99+3.99)' -> arithmetisch auswerten.
                        total += _eval_formula(ws, part, seen)
                        continue
                    total += _val(ws, row, column_index_from_string(col), seen)
            return repr(total)

        e = re.sub(r"SUM\(([^)]*)\)", sum_repl, e)

        def ref_repl(m):
            col, row = coordinate_from_string(m.group(0).replace("$", ""))
            return repr(_val(ws, row, column_index_from_string(col), seen))

        e = re.sub(r"\$?[A-Z]{1,3}\$?\d+", ref_repl, e)
        return float(_safe_arith(e))
    except Exception:
        return 0.0


def _val(ws, r: int, c: int, seen: set) -> float:
    """Ausgewerteter numerischer Zellwert (Zahl oder Formel)."""
    key = (id(ws), r, c)
    if key in seen:
        return 0.0
    v = ws.cell(row=r, column=c).value
    if v is None:
        return 0.0
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip()
    if s.startswith("="):
        return _eval_formula(ws, s[1:], seen | {key})
    try:
        return float(s.replace(" ", "").replace(",", "."))
    except ValueError:
        return 0.0


# ── Struktur-Helfer ─────────────────────────────────────────────────────
def _sheet_by_hint(wb, hint: str):
    for ws in wb.worksheets:
        if hint.lower() in ws.title.lower():
            return ws
    return None


def _gesamt_row(ws) -> int | None:
    if ws is None:
        return None
    for r in range(1, ws.max_row + 1):
        v = ws.cell(row=r, column=2).value
        if v and str(v).strip().upper().startswith("GESAMT"):
            return r
    return None


def _ist_kategorie(ws, r: int) -> bool:
    raw = ws.cell(row=r, column=2).value
    if raw is None:
        return False
    label = str(raw).strip()
    if label in ("Einnahmequelle", "Ausgabenkategorie"):
        return False
    if str(raw).startswith(" ") or label.startswith("Summe") or label.startswith("💡"):
        return False
    return True


def _kategorien(ws) -> list[dict]:
    """Kategorie-Zeilen mit 12 ausgewerteten Monatswerten."""
    kats: list[dict] = []
    if ws is None:
        return kats
    g = _gesamt_row(ws) or (ws.max_row + 1)
    kopf = False
    for r in range(1, g):
        raw = ws.cell(row=r, column=2).value
        if raw is None:
            continue
        if str(raw).strip() in ("Einnahmequelle", "Ausgabenkategorie"):
            kopf = True
            continue
        if not kopf or not _ist_kategorie(ws, r):
            continue
        # Spalte C (=3) ist Januar, N (=14) ist Dezember.
        werte = [round(_val(ws, r, 3 + i, set()), 2) for i in range(12)]
        summe = round(sum(werte), 2)
        if summe != 0:
            kats.append({"name": str(raw).strip(), "summe": summe, "monate": werte})
    return kats


def _alle_kat_namen(ws) -> list[str]:
    """Kategorienamen für Eingabefeld/Datalist – ohne Titel- und Hinweiszeilen."""
    if ws is None:
        return []
    g = _gesamt_row(ws) or ws.max_row
    return [str(ws.cell(row=r, column=2).value).strip()
            for r in _kategorie_rows(ws, g)]


def _tabelle(ws) -> list[dict]:
    """Alle Zeilen des Blatts in Excel-Reihenfolge – für die Jahres-Matrix.

    Liefert auch leere Kategorien, Abschnittsüberschriften und Zwischensummen,
    damit die Ansicht im Dashboard genauso aussieht wie die Tabelle.
    """
    zeilen: list[dict] = []
    if ws is None:
        return zeilen
    g = _gesamt_row(ws) or (ws.max_row + 1)
    kopf = False
    for r in range(1, g):
        raw = ws.cell(row=r, column=2).value
        if raw is None:
            continue
        label = str(raw).strip()
        if label in ("Einnahmequelle", "Ausgabenkategorie"):
            kopf = True
            continue
        if not kopf or label.startswith("💡"):
            continue
        werte = [round(_val(ws, r, 3 + i, set()), 2) for i in range(12)]
        if str(raw).startswith(" "):
            art = "abschnitt"
        elif label.startswith("Summe"):
            art = "summe"
        else:
            art = "kategorie"
        zeilen.append({"name": label, "art": art, "monate": werte,
                       "summe": round(sum(werte), 2)})
    return zeilen


# ── Dashboard-Daten ─────────────────────────────────────────────────────
_DASH_CACHE: dict = {}


def dashboard_daten(jahr: int) -> dict:
    pfad = _excel_pfad(jahr)
    if pfad is None:
        raise FileNotFoundError(
            f"Keine Finanzübersicht_{jahr}.xlsx im Ordner 02_Finanzen gefunden."
        )

    key = (str(pfad), pfad.stat().st_mtime)
    if _DASH_CACHE.get("key") == key:
        return _DASH_CACHE["data"]

    import openpyxl

    wb = openpyxl.load_workbook(pfad)  # Formeln erhalten, selbst auswerten
    einn_ws = _sheet_by_hint(wb, "Einnahmen")
    ausg_ws = _sheet_by_hint(wb, "Ausgaben")

    ausgaben_kat = sorted(_kategorien(ausg_ws), key=lambda k: k["summe"], reverse=True)
    einnahmen_kat = sorted(_kategorien(einn_ws), key=lambda k: k["summe"], reverse=True)

    einnahmen = [round(sum(k["monate"][i] for k in einnahmen_kat), 2) for i in range(12)]
    ausgaben = [round(sum(k["monate"][i] for k in ausgaben_kat), 2) for i in range(12)]
    ergebnis = [round(einnahmen[i] - ausgaben[i], 2) for i in range(12)]

    monate = [
        {
            "monat": i + 1, "name": config.MONATSNAMEN[i + 1], "kurz": MONATS_KURZ[i],
            "einnahmen": einnahmen[i], "ausgaben": ausgaben[i], "ergebnis": ergebnis[i],
        }
        for i in range(12)
    ]

    quartale = []
    for q in range(4):
        idx = range(q * 3, q * 3 + 3)
        qe = round(sum(einnahmen[i] for i in idx), 2)
        qa = round(sum(ausgaben[i] for i in idx), 2)
        quartale.append({"quartal": q + 1, "einnahmen": qe, "ausgaben": qa,
                         "ergebnis": round(qe - qa, 2)})

    je = round(sum(einnahmen), 2)
    ja = round(sum(ausgaben), 2)
    aktive_monate = sum(1 for i in range(12) if einnahmen[i] or ausgaben[i]) or 1

    daten = {
        "jahr": jahr, "quelle": pfad.name, "monate": monate, "quartale": quartale,
        "jahr_summe": {
            "einnahmen": je, "ausgaben": ja, "ergebnis": round(je - ja, 2),
            "schnitt_ergebnis": round((je - ja) / aktive_monate, 2),
            "aktive_monate": aktive_monate,
        },
        "ausgaben_kategorien": ausgaben_kat,
        "einnahmen_kategorien": einnahmen_kat,
        "einnahmen_tabelle": _tabelle(einn_ws),
        "ausgaben_tabelle": _tabelle(ausg_ws),
        "alle_ausgaben_kat": _alle_kat_namen(ausg_ws),
        "alle_einnahmen_kat": _alle_kat_namen(einn_ws),
    }
    _DASH_CACHE["key"] = key
    _DASH_CACHE["data"] = daten
    return daten


# ── Schreiben ───────────────────────────────────────────────────────────
def _ws_fuer_typ(wb, typ: str):
    ws = _sheet_by_hint(wb, "Einnahmen" if typ == "einnahmen" else "Ausgaben")
    if ws is None:
        raise ValueError("Passender Tab nicht in der Excel gefunden.")
    return ws


def _finde_kategorie_row(ws, kategorie: str) -> int | None:
    ziel = kategorie.strip().lower()
    for r in range(1, ws.max_row + 1):
        raw = ws.cell(row=r, column=2).value
        if raw and str(raw).strip().lower() == ziel and _ist_kategorie(ws, r):
            return r
    return None


def _ist_in_merge(ws, r: int) -> bool:
    for m in ws.merged_cells.ranges:
        if m.min_row <= r <= m.max_row:
            return True
    return False


def _insert_row_mit_merges(ws, idx: int) -> None:
    """insert_rows, das verbundene Zellbereiche unterhalb korrekt mitverschiebt."""
    verschiebungen = [m for m in list(ws.merged_cells.ranges) if m.min_row >= idx]
    for m in verschiebungen:
        ws.merged_cells.ranges.discard(m)
    ws.insert_rows(idx)
    for m in verschiebungen:
        m.shift(0, 1)
        ws.merged_cells.ranges.add(m)


def _setze_zelle(ws, r: int, c: int, value) -> None:
    """Schreibt einen Wert; bei verbundenen Zellen in die Anker-Zelle (top-left)."""
    from openpyxl.cell.cell import MergedCell

    cell = ws.cell(row=r, column=c)
    if isinstance(cell, MergedCell):
        for m in ws.merged_cells.ranges:
            if m.min_row <= r <= m.max_row and m.min_col <= c <= m.max_col:
                ws.cell(row=m.min_row, column=m.min_col, value=value)
                return
        return
    cell.value = value


def _kategorie_rows(ws, g: int) -> list[int]:
    """Zeilennummern der echten Kategoriezeilen oberhalb der GESAMT-Zeile."""
    rows: list[int] = []
    kopf = False
    for r in range(1, g):
        raw = ws.cell(row=r, column=2).value
        if raw is None:
            continue
        if str(raw).strip() in ("Einnahmequelle", "Ausgabenkategorie"):
            kopf = True
            continue
        if kopf and _ist_kategorie(ws, r):
            rows.append(r)
    return rows


def _gesamt_formel(rows: list[int], col: int) -> str:
    """Excel-Formel über alle Kategoriezeilen, zu Bereichen zusammengefasst."""
    if not rows:
        return "=0"
    letter = get_column_letter(col)
    bloecke: list[tuple[int, int]] = []
    start = prev = rows[0]
    for r in rows[1:]:
        if r == prev + 1:
            prev = r
            continue
        bloecke.append((start, prev))
        start = prev = r
    bloecke.append((start, prev))
    teile = [f"{letter}{a}" if a == b else f"SUM({letter}{a}:{letter}{b})"
             for a, b in bloecke]
    return "=" + "+".join(teile)


def _recompute_gesamt(ws) -> None:
    """Schreibt die GESAMT-Zeile als Formel.

    Bewusst eine Formel und keine feste Zahl: sonst bleibt die Summe stehen,
    wenn jemand einen Betrag direkt in Excel ändert (genau so entstand die
    Abweichung zwischen Excel und Dashboard).
    """
    g = _gesamt_row(ws)
    if not g:
        return
    _recompute_zwischensummen(ws, g)
    rows = _kategorie_rows(ws, g)
    for monat in range(1, 13):
        col = 2 + monat
        _setze_zelle(ws, g, col, _gesamt_formel(rows, col))


def _recompute_zwischensummen(ws, g: int) -> None:
    """Zwischensummen ('Summe Fixkosten' …) über den Block direkt darüber.

    Auch hier bewusst als Formel: die alten Formeln endeten teils zu früh
    (z. B. '=SUM(C5:C8)' ohne die Zeilen Stripe-Gebühren und Finanzamt),
    dadurch fehlten Beträge in den Monatssummen.
    """
    kat = set(_kategorie_rows(ws, g))
    for r in range(1, g):
        raw = ws.cell(row=r, column=2).value
        if raw is None or not str(raw).strip().startswith("Summe"):
            continue
        ende = r - 1
        while ende >= 1 and ende not in kat:
            ende -= 1
        if ende < 1:
            continue
        start = ende
        while start - 1 >= 1 and (start - 1) in kat:
            start -= 1
        for monat in range(1, 13):
            col = 2 + monat
            letter = get_column_letter(col)
            _setze_zelle(ws, r, col, f"=SUM({letter}{start}:{letter}{ende})")


def kategorien_liste(jahr: int) -> dict:
    pfad = _excel_pfad(jahr)
    if pfad is None:
        raise FileNotFoundError(f"Keine Finanzübersicht_{jahr}.xlsx gefunden.")
    import openpyxl

    wb = openpyxl.load_workbook(pfad)
    return {
        "ausgaben": _alle_kat_namen(_sheet_by_hint(wb, "Ausgaben")),
        "einnahmen": _alle_kat_namen(_sheet_by_hint(wb, "Einnahmen")),
        "monate": [{"nr": i + 1, "name": config.MONATSNAMEN[i + 1]} for i in range(12)],
    }


def eintrag_speichern(jahr: int, typ: str, kategorie: str, monat: int,
                      betrag: float, modus: str = "add") -> dict:
    # Die Finanzübersicht wird nur noch gelesen, nie mehr vom Dashboard beschrieben.
    raise PermissionError("Die Finanzübersicht.xlsx wird nur gelesen – bitte direkt in Excel eintragen.")
    if typ not in ("ausgaben", "einnahmen"):
        raise ValueError("typ muss 'ausgaben' oder 'einnahmen' sein.")
    if not (1 <= int(monat) <= 12):
        raise ValueError("monat muss zwischen 1 und 12 liegen.")
    kategorie = (kategorie or "").strip()
    if not kategorie:
        raise ValueError("Bitte eine Kategorie angeben.")
    betrag = round(float(betrag), 2)

    pfad = _excel_pfad(jahr)
    if pfad is None:
        raise FileNotFoundError(f"Keine Finanzübersicht_{jahr}.xlsx gefunden.")

    import openpyxl

    wb = openpyxl.load_workbook(pfad)
    ws = _ws_fuer_typ(wb, typ)
    col = 2 + int(monat)

    r = _finde_kategorie_row(ws, kategorie)
    neu_angelegt = False
    if r is None:
        g = _gesamt_row(ws) or (ws.max_row + 1)
        # Bevorzugt eine bereits vorhandene LEERE Zeile über GESAMT nutzen
        # (vermeidet insert_rows, das verbundene Zellen/Formeln beschädigt).
        leer = None
        for rr in range(3, g):
            if ws.cell(row=rr, column=2).value in (None, "") and not _ist_in_merge(ws, rr):
                leer = rr
                break
        if leer is not None:
            r = leer
        else:
            _insert_row_mit_merges(ws, g)
            r = g
        _setze_zelle(ws, r, 2, kategorie)
        neu_angelegt = True

    aktuell = _val(ws, r, col, set())  # bestehende Formel/Zahl korrekt auswerten
    neuer_wert = round(betrag if modus == "set" else aktuell + betrag, 2)
    _setze_zelle(ws, r, col, neuer_wert)

    _recompute_gesamt(ws)
    wb.save(pfad)

    return {"kategorie": kategorie, "monat": int(monat), "typ": typ,
            "neuer_wert": neuer_wert, "neu_angelegt": neu_angelegt}
