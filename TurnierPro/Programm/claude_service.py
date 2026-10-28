"""Vollständigkeits- und Datenprüfung per Claude-API.

Claude liest den Monats-Kontoauszug und alle Ein-/Ausgangsrechnungen als PDF,
extrahiert die Zahlen (Beträge, USt, Datum, Aussteller), gleicht die
Kontobewegungen gegen die Belege ab und meldet fehlende Belege sowie Hinweise
für den Steuerberater.

Ergebnisse werden je Monat zwischengespeichert (cache/), damit ein erneuter
Klick nicht erneut über die API abgerechnet wird, solange sich keine Datei
geändert hat.
"""

from __future__ import annotations

import base64
import hashlib
import json
from pathlib import Path

from pydantic import BaseModel, Field

import bereinigung
import config


# ── Datenmodell für die strukturierte Ausgabe ──────────────────────────
class Beleg(BaseModel):
    datei: str = Field(description="Dateiname des Belegs")
    typ: str = Field(description="Eingangsrechnung, Ausgangsrechnung oder Beleg")
    aussteller: str = Field(description="Rechnungssteller bzw. Empfänger")
    datum: str = Field(description="Belegdatum, Format TT.MM.JJJJ")
    betrag_brutto: float = Field(description="Bruttobetrag in Euro")
    umsatzsteuer: float | None = Field(
        default=None, description="Ausgewiesene Umsatzsteuer in Euro, falls vorhanden"
    )
    durchlaufend: bool = Field(
        default=False,
        description=(
            "True, wenn es ein durchlaufender Posten ist: Gelder, die nur "
            "eingesammelt und weitergeleitet werden (z. B. Camp-Teilnahme"
            "gebühren, die an den Verein gehen, sowie deren Weiterleitung). "
            "Kein Umsatz/Aufwand von TurnierPro."
        ),
    )


class Analyse(BaseModel):
    einnahmen_gesamt: float = Field(description="Summe der Geldeingänge im Monat")
    ausgaben_gesamt: float = Field(description="Summe der Geldausgänge im Monat")
    ergebnis: float = Field(description="Einnahmen minus Ausgaben")
    vorsteuer: float = Field(
        description="Summe der abziehbaren Vorsteuer aus Eingangsrechnungen"
    )
    vereinnahmte_umsatzsteuer: float = Field(
        description="Summe der auf Ausgangsrechnungen ausgewiesenen Umsatzsteuer"
    )
    anzahl_transaktionen: int = Field(
        description="Anzahl der Kontobewegungen im Kontoauszug"
    )
    belege: list[Beleg] = Field(description="Alle erkannten Belege/Rechnungen")
    fehlende_belege: list[str] = Field(
        description="Kontobewegungen ohne passenden Beleg (kurze Beschreibung je Eintrag)"
    )
    hinweise: list[str] = Field(
        description="Auffälligkeiten und Hinweise für den Steuerberater"
    )
    vollstaendig: bool = Field(
        description="True, wenn zu allen Kontobewegungen ein Beleg vorliegt"
    )


class BelegListe(BaseModel):
    belege: list[Beleg] = Field(description="Alle erkannten Belege/Rechnungen dieses Teilpakets")


# Die API nimmt höchstens 32 MB pro Anfrage an; Base64 bläht PDFs um ~4/3 auf.
# Mit Puffer für Text und JSON-Overhead bleiben wir pro Anfrage unter ~22 MB Rohdaten.
MAX_ROHBYTES_PRO_ANFRAGE = 22 * 1024 * 1024


# ── Hilfsfunktionen ─────────────────────────────────────────────────────
def _dateien_hash(pfade: list[Path]) -> str:
    h = hashlib.sha256()
    for p in sorted(pfade, key=lambda x: str(x)):
        st = p.stat()
        h.update(p.name.encode("utf-8"))
        h.update(str(st.st_size).encode())
        h.update(str(int(st.st_mtime)).encode())
    h.update(config.CLAUDE_MODEL.encode())
    return h.hexdigest()


def _cache_pfad(jahr: int, monat: int) -> Path:
    return config.geteilter_cache_dir() / f"analyse_{jahr}_{monat:02d}.json"


def _pdf_block(pfad: Path) -> dict:
    data = base64.standard_b64encode(pfad.read_bytes()).decode("utf-8")
    return {
        "type": "document",
        "source": {"type": "base64", "media_type": "application/pdf", "data": data},
    }


SYSTEM_PROMPT = (
    "Du bist ein sorgfältiger Buchhaltungs-Assistent für eine deutsche UG. "
    "Du erhältst den Monats-Kontoauszug und die zugehörigen Ein- und "
    "Ausgangsrechnungen als PDF. Deine Aufgabe:\n"
    "1. Lies alle Kontobewegungen aus dem Kontoauszug (zähle sie).\n"
    "2. Lies aus jeder Rechnung Aussteller, Datum, Bruttobetrag und Umsatzsteuer "
    "und trage sie in 'belege' ein.\n"
    "3. Ordne jede Kontobewegung einem Beleg zu (nach Betrag, Datum, Name). "
    "Liste in 'fehlende_belege' NUR die Kontobewegungen, zu denen KEIN Beleg "
    "vorliegt (jeweils kurz: Datum, Betrag, Gegenpartei).\n"
    "4. Rechne die Summen (Einnahmen, Ausgaben, Ergebnis) und die USt zusammen.\n"
    "5. Markiere durchlaufende Posten mit durchlaufend=true: Gelder, die "
    "TurnierPro nur einsammelt und weiterleitet (z. B. Camp-Teilnahmegebühren "
    "für Vereine) sowie die spätere Weiterleitung selbst. Achtung: Die "
    "Weiterleitung erfolgt oft erst im Folgemonat — eingesammelte Gebühren "
    "dieses Monats sind trotzdem durchlaufend.\n"
    "Halte die Ausgabe knapp: keine vollständige Auflistung jeder Bewegung, "
    "nur die Belege und die fehlenden. Sei genau mit Zahlen, erfinde nichts. "
    "Unklarheiten kommen in 'hinweise'. Antworte ausschließlich auf Deutsch."
)


def _teilpakete(rechnungen: list[tuple[str, Path]], kontoauszug: Path | None):
    """Teilt die Rechnungen so auf, dass jede Anfrage unter dem Größenlimit bleibt."""
    limit = MAX_ROHBYTES_PRO_ANFRAGE
    paket: list[tuple[str, Path]] = []
    groesse = 0
    for art, p in rechnungen:
        g = p.stat().st_size
        if g > limit:
            raise ValueError(f"Die Datei {p.name} ist mit {g / 1e6:.1f} MB zu groß für die KI-Prüfung.")
        if paket and groesse + g > limit:
            yield paket
            paket, groesse = [], 0
        paket.append((art, p))
        groesse += g
    if paket:
        yield paket


def _parse(client, inhalt: list[dict], schema, *, max_tokens: int = 16000):
    # Streaming, weil große Teilpakete sonst an das HTTP-Timeout des SDK stoßen.
    with client.messages.stream(
        model=config.CLAUDE_MODEL,
        max_tokens=max_tokens,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": inhalt}],
        output_format=schema,
    ) as stream:
        antwort = stream.get_final_message()
    if antwort.stop_reason == "refusal":
        raise RuntimeError("Die Analyse wurde vom Modell abgelehnt.")
    if antwort.stop_reason == "max_tokens":
        raise RuntimeError("Die Antwort der KI war zu lang und wurde abgeschnitten.")
    return antwort.parsed_output


# ── Öffentliche Funktion ────────────────────────────────────────────────
def analysiere_monat(jahr: int, monat: int, *, force: bool = False) -> dict:
    """Führt die API-Prüfung durch (oder liefert das gecachte Ergebnis).

    Rückgabe: dict mit Schlüsseln 'analyse', 'aus_cache', 'anzahl_pdfs'.
    """
    kontoauszug = config.kontoauszug_pfad(monat)
    eingang = config.pdfs_im_ordner(config.eingangsrechnungen_ordner(jahr, monat))
    ausgang = config.pdfs_im_ordner(config.ausgangsrechnungen_ordner(jahr, monat))

    alle_pdfs: list[Path] = []
    if kontoauszug:
        alle_pdfs.append(kontoauszug)
    alle_pdfs += eingang + ausgang

    if not alle_pdfs:
        raise ValueError(
            "Für diesen Monat liegen keine PDF-Dateien vor "
            "(weder Kontoauszug noch Rechnungen)."
        )

    if not config.get_anthropic_key():
        raise RuntimeError(
            "Kein Claude-API-Key gesetzt. Bitte unter Einstellungen › Zugänge eintragen."
        )

    aktueller_hash = _dateien_hash(alle_pdfs)
    cache = _cache_pfad(jahr, monat)

    if cache.exists() and not force:
        gespeichert = json.loads(cache.read_text(encoding="utf-8"))
        if gespeichert.get("hash") == aktueller_hash:
            return {
                "analyse": bereinigung.bereinige(jahr, monat, gespeichert["analyse"], hat_kontoauszug=bool(kontoauszug)),
                "aus_cache": True,
                "anzahl_pdfs": len(alle_pdfs),
            }

    # Import erst hier, damit die App auch ohne installierte Bibliothek startet.
    import anthropic

    # timeout: hartes Limit, damit die App bei API-Problemen nicht ewig hängt.
    client = anthropic.Anthropic(api_key=config.get_anthropic_key(), timeout=300.0, max_retries=1)

    monat_text = f"Monat: {config.MONATSNAMEN[monat]} {jahr}. "
    rechnungen = [("EINGANGSRECHNUNG", p) for p in eingang] + [
        ("AUSGANGSRECHNUNG", p) for p in ausgang
    ]
    kontoauszug_blocks: list[dict] = []
    if kontoauszug:
        kontoauszug_blocks.append({"type": "text", "text": f"KONTOAUSZUG — Datei: {kontoauszug.name}"})
        kontoauszug_blocks.append(_pdf_block(kontoauszug))
    else:
        kontoauszug_blocks.append(
            {"type": "text", "text": "WARNUNG: Für diesen Monat liegt kein Kontoauszug vor."}
        )

    gesamt = sum(p.stat().st_size for p in alle_pdfs)
    if gesamt <= MAX_ROHBYTES_PRO_ANFRAGE:
        # Normalfall: alles in einer Anfrage.
        inhalt: list[dict] = [
            {"type": "text", "text": monat_text + "Es folgen die Unterlagen. Analysiere sie gemäß deiner Anweisung."}
        ]
        inhalt += kontoauszug_blocks
        for art, p in rechnungen:
            inhalt.append({"type": "text", "text": f"{art} — Datei: {p.name}"})
            inhalt.append(_pdf_block(p))
        analyse_dict = _parse(client, inhalt, Analyse).model_dump()
    else:
        # Zu groß für eine Anfrage (z. B. >100 Stripe-Abo-Belege im Monat):
        # 1) Rechnungen in Teilpaketen auslesen, 2) Abgleich mit dem Kontoauszug
        #    anhand der ausgelesenen Belegdaten.
        belege: list[dict] = []
        for paket in _teilpakete(rechnungen, kontoauszug):
            inhalt = [
                {
                    "type": "text",
                    "text": monat_text
                    + "Dies ist ein Teilpaket der Rechnungen. Lies NUR die Belege aus "
                    "(Schritt 2 deiner Anweisung) und trage sie in 'belege' ein.",
                }
            ]
            for art, p in paket:
                inhalt.append({"type": "text", "text": f"{art} — Datei: {p.name}"})
                inhalt.append(_pdf_block(p))
            belege += [b.model_dump() for b in _parse(client, inhalt, BelegListe).belege]

        inhalt = [
            {
                "type": "text",
                "text": monat_text
                + "Die Rechnungen wurden bereits ausgelesen und liegen unten als JSON vor "
                "(Feld 'belege'). Übernimm diese Liste unverändert in 'belege' und "
                "führe mit dem Kontoauszug die übrigen Schritte deiner Anweisung aus.\n\n"
                "BELEGE (JSON):\n" + json.dumps(belege, ensure_ascii=False),
            }
        ]
        inhalt += kontoauszug_blocks
        analyse_dict = _parse(client, inhalt, Analyse, max_tokens=32000).model_dump()
        # Die ausgelesenen Belege sind maßgeblich – nicht die Abschrift des Modells.
        analyse_dict["belege"] = belege

    cache.write_text(
        json.dumps({"hash": aktueller_hash, "analyse": analyse_dict}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    return {
        "analyse": bereinigung.bereinige(jahr, monat, analyse_dict, hat_kontoauszug=bool(kontoauszug)),
        "aus_cache": False,
        "anzahl_pdfs": len(alle_pdfs),
    }
