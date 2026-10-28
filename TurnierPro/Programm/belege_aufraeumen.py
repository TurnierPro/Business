"""Vereinheitlicht die Benennung der Eingangsrechnungen und entfernt Quittungen.

Zielschema:  JJJJ-MM-TT_Anbieter_Rechnungsnummer.pdf

Warum: Der Ordner ist über Monate aus drei Quellen gewachsen -- Mail-Import,
Hand-Ablage und Qonto-Abruf. Dadurch stehen dort Namen wie
"Invoice-UQFT4HW1-0007.pdf" (kein Datum, kein Anbieter),
"Rechnung_2026-04-15_100184942461_V110073800.pdf" (Anbieter fehlt) und
"2026-08-15_Rechnungsstelle-IONOS_Rechnung_2026-08-15_100192202786_V110073800.pdf"
(Datum und Nummer doppelt). Sortiert man den Ordner nach Namen, steht nichts
beieinander, was zusammengehört.

Quittungen (Receipt) werden entfernt, wenn zum selben Anbieter am selben Tag
eine Rechnung (Invoice) vorliegt: Beide belegen denselben Vorgang, für die
Buchhaltung zählt die Rechnung. Steht eine Quittung allein, bleibt sie -- dann
ist sie der einzige Beleg.

Aufruf:
    python belege_aufraeumen.py --dry-run
    python belege_aufraeumen.py
"""

from __future__ import annotations

import argparse
import re
import shutil
from datetime import date
from pathlib import Path

import config

# Anbieter am Kunden-/Nummernkuerzel erkennen. Die Kuerzel sind je Anbieter
# konstant, der Dateiname nennt den Anbieter dagegen oft gar nicht.
ANBIETER_MUSTER = [
    (re.compile(r"UQFT4HW1", re.I), "Lovable"),
    (re.compile(r"2YNEF2SA", re.I), "Resend"),
    (re.compile(r"YGHBAS", re.I), "Supabase"),
    (re.compile(r"V110073800|IONOS", re.I), "IONOS"),
    (re.compile(r"FLYERALARM", re.I), "Flyeralarm"),
    (re.compile(r"^\d{2}-\d{2}-invoice-\d+", re.I), "Qonto"),
    (re.compile(r"qonto", re.I), "Qonto"),
    (re.compile(r"stripe", re.I), "Stripe"),
    (re.compile(r"supabase", re.I), "Supabase"),
    (re.compile(r"resend", re.I), "Resend"),
    (re.compile(r"lovable", re.I), "Lovable"),
    (re.compile(r"anthropic|claude", re.I), "Anthropic"),
    (re.compile(r"apple", re.I), "Apple"),
    (re.compile(r"google", re.I), "Google"),
]

DATUM_RE = re.compile(r"(20\d{2})[-_]?(\d{2})[-_]?(\d{2})")


def anbieter_aus(name: str) -> str:
    for muster, anbieter in ANBIETER_MUSTER:
        if muster.search(name):
            return anbieter
    # Fallback: erstes Wort vor dem ersten Unterstrich, ohne Datumspraefix
    rest = re.sub(r"^\d{4}-\d{2}-\d{2}_", "", name)
    teil = re.split(r"[_\-]", rest)[0]
    return re.sub(r"[^A-Za-zÄÖÜäöü0-9]", "", teil)[:20] or "Unbekannt"


def nummer_aus(name: str, anbieter: str) -> str:
    """Die Rechnungsnummer -- das, was den Beleg eindeutig macht."""
    stamm = Path(name).stem
    if anbieter == "IONOS":
        m = re.search(r"(\d{12})", stamm)          # 100192202786
        if m:
            return m.group(1)
    if anbieter == "Qonto":
        m = re.search(r"invoice-(\d+)", stamm, re.I)
        if m:
            return m.group(1)
    # Mehrteilige Nummern komplett mitnehmen: "Rechnung-RE-2026-00004" hatte
    # sonst nur "RE-2026" ergeben -- ohne den Teil, der sie eindeutig macht.
    m = re.search(r"(?:Invoice|Receipt|Rechnung|RG)[-_ ]([A-Z0-9]+(?:[-_][0-9]+)+)", stamm, re.I)
    if m:
        return m.group(1).replace("_", "-")
    m = re.search(r"(?:Invoice|Receipt)[-_]([A-Z0-9-]+)", stamm, re.I)
    if m:
        return m.group(1)
    m = re.search(r"(\d{6,})", stamm)
    if m:
        return m.group(1)
    return re.sub(r"[^A-Za-z0-9-]", "", stamm)[:24]


def _ordner_monat(pfad: Path) -> str:
    """Jahr und Monat aus der Ordnerstruktur -- die stimmt immer."""
    # Struktur: <Jahr>/01_erhaltene/<Quartal>/<MM_Monat>/datei.pdf
    # Das Jahr liegt also vier Ebenen ueber der Datei, nicht drei.
    monat = re.match(r"(\d{2})_", pfad.parent.name)
    jahr = pfad.parent.parent.parent.parent.name
    if monat and jahr.isdigit():
        return f"{jahr}-{monat.group(1)}"
    return ""


def datum_aus(pfad: Path) -> str:
    """Rechnungsdatum -- nur wenn es im Namen steht und plausibel ist.

    Sonst nur Jahr und Monat aus dem Ordner. Ein geratener Tag waere
    schlimmer als keiner: Das Dateidatum ist der Zeitpunkt der Ablage, nicht
    der Rechnung -- "Invoice-UQFT4HW1-0020" liegt im Maerz-Ordner, wurde aber
    am 28.07. kopiert. Und "Receipt-2043-9887" ergaebe als Datum gelesen den
    98. Monat des Jahres 2043.
    """
    ordner_ym = _ordner_monat(pfad)
    for m in DATUM_RE.finditer(pfad.name):
        jahr, monat, tag = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if not (2020 <= jahr <= date.today().year + 1):
            continue
        if not (1 <= monat <= 12 and 1 <= tag <= 31):
            continue
        gefunden = f"{jahr:04d}-{monat:02d}-{tag:02d}"
        # Muss zum Monatsordner passen, sonst ist es eine Nummer, kein Datum
        if ordner_ym and not gefunden.startswith(ordner_ym):
            continue
        return gefunden
    # Qonto-Muster "08-26-invoice-..." = Monat-Jahr der Abrechnung
    m = re.match(r"(\d{2})-(\d{2})-invoice", pfad.name)
    if m and 1 <= int(m.group(1)) <= 12:
        return f"20{m.group(2)}-{m.group(1)}"
    return ordner_ym


def ist_quittung(name: str) -> bool:
    """Erkennt Zahlungsquittungen.

    Kein \b um "Receipt": Der Unterstrich zaehlt in Regex als Wortzeichen,
    deshalb gibt es zwischen "_" und "Receipt" keine Wortgrenze --
    "2026-08-02_Supabase_Receipt-YGHBAS-00008.pdf" wurde damit uebersehen,
    "Receipt-YGHBAS-00004.pdf" dagegen erkannt.
    """
    return bool(re.search(r"(?<![a-z])receipt(?![a-z])|quittung|zahlungsbeleg", name, re.I))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    ap.add_argument("--dry-run", action="store_true", help="nur zeigen, nichts ändern")
    ap.add_argument("--jahr", type=int, default=2026)
    args = ap.parse_args()

    wurzel = config.get_finanzen_root() / "01_Rechnungen" / str(args.jahr) / "01_erhaltene"
    if not wurzel.is_dir():
        print(f"Ordner nicht gefunden: {wurzel}")
        return

    archiv = config.get_finanzen_root() / "00_Archiv" / f"quittungen_{date.today().isoformat()}"

    dateien = sorted(p for p in wurzel.rglob("*.pdf") if p.is_file())
    infos = []
    for p in dateien:
        anbieter = anbieter_aus(p.name)
        infos.append({"pfad": p, "anbieter": anbieter, "datum": datum_aus(p),
                      "nummer": nummer_aus(p.name, anbieter), "quittung": ist_quittung(p.name)})

    # Quittungen aussortieren, zu denen es am selben Tag eine Rechnung gibt
    rechnungen = {(i["anbieter"], i["datum"]) for i in infos if not i["quittung"]}
    raus = [i for i in infos if i["quittung"] and (i["anbieter"], i["datum"]) in rechnungen]

    print(f"=== {len(raus)} Quittungen mit zugehöriger Rechnung ===")
    for i in raus:
        print(f"  {i['pfad'].parent.name}/{i['pfad'].name}")
        print(f"     → Rechnung von {i['anbieter']} am {i['datum']} liegt vor")

    bleibt = [i for i in infos if i not in raus]
    umbenennen, unsicher = [], []
    for i in bleibt:
        # Ohne erkannten Anbieter lieber gar nicht anfassen: "Receipt" oder
        # "Unbekannt" als Anbieter im Dateinamen waere keine Verbesserung.
        if i["anbieter"] in ("Unbekannt", "Receipt", "receipt") or not i["datum"]:
            unsicher.append(i)
            continue
        neu = f"{i['datum']}_{i['anbieter']}_{i['nummer']}.pdf"
        if neu != i["pfad"].name:
            umbenennen.append((i["pfad"], neu))

    print(f"\n=== {len(umbenennen)} Dateien werden umbenannt ===")
    for alt, neu in umbenennen[:40]:
        print(f"  {alt.name[:52]:54} → {neu}")
    if len(umbenennen) > 40:
        print(f"  ... und {len(umbenennen) - 40} weitere")

    if unsicher:
        print(f"\n=== {len(unsicher)} Dateien bleiben unverändert (Anbieter unklar) ===")
        for i in unsicher[:15]:
            print(f"  {i['pfad'].parent.name}/{i['pfad'].name}")

    if args.dry_run:
        print("\nDRY RUN -- nichts geändert")
        return

    archiv.mkdir(parents=True, exist_ok=True)
    for i in raus:
        shutil.move(str(i["pfad"]), str(archiv / i["pfad"].name))
    for alt, neu in umbenennen:
        ziel = alt.parent / neu
        n = 2
        while ziel.exists():          # gleiche Nummer zweimal -> Zaehler anhaengen
            ziel = alt.parent / f"{Path(neu).stem}-{n}.pdf"
            n += 1
        alt.rename(ziel)
    print(f"\n{len(raus)} Quittungen verschoben nach 00_Archiv/{archiv.name}")
    print(f"{len(umbenennen)} Dateien umbenannt.")


if __name__ == "__main__":
    main()
