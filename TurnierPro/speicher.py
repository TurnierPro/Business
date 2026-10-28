"""Geteilter Datenspeicher für mehrere Macs (iCloud-tauglich).

Die Idee in einfachen Worten:

* Jeder Mac schreibt NUR in seine eigene Datei: journal/<geraet>.jsonl.
  Zwei Macs bearbeiten also nie dieselbe Datei, und iCloud muss nichts
  zusammenführen (keine Konfliktkopien, kein Datenverlust).
* Jede Zeile ist eine Änderung („Verein angelegt“, „Status geändert“ …) mit
  Zeitstempel. Beim Lesen werden die Zeilen aller Macs nach Zeit sortiert und
  der Reihe nach angewendet. Das Ergebnis ist auf beiden Macs gleich.
* Bei gleichzeitigen Änderungen am selben Feld gewinnt die spätere. Änderungen
  an verschiedenen Feldern (Max ändert den Status, Felix die Telefonnummer)
  bleiben beide erhalten.

Der Zeitstempel ist eine „hybride Uhr“: nie kleiner als die größte Zeit, die
dieser Mac schon gesehen hat. So landet eine Änderung immer hinter dem, was
man beim Klicken auf dem Bildschirm hatte, auch wenn die Uhren der Macs ein
paar Sekunden auseinanderliegen.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import threading
import time
import uuid
from pathlib import Path

# Erlaubte Sammlungen. Alles andere lehnt der Speicher ab.
SAMMLUNGEN = {
    "vereine",        # Vertrieb: Vereine mit Ansprechperson, Veranstaltung, Pipeline
    "aktivitaeten",   # Vertrieb: jeder Anruf, jede Mail
    "aufgaben",
    "projekte",
    "kommentare",     # Kommentare zu Projekten
    "team",
    "termine",        # Turniere und Camps (z. B. von turnierpro.de importiert)
    "besuche",        # Website: Besucher und Klicks pro Tag
    "einstellungen",  # geteilte Einstellungen (Umsatzziel, Automatik-Mac …)
}
AKTIONEN = {"set", "upd", "del"}
MAX_ZEILE = 200_000  # Bytes; schützt vor versehentlich riesigen Einträgen


def neue_id() -> str:
    return uuid.uuid4().hex[:16]


class SpeicherFehler(ValueError):
    pass


class Speicher:
    def __init__(self, ordner: Path, geraet: str):
        self.ordner = Path(ordner)
        self.journal_dir = self.ordner / "journal"
        self.geraete_dir = self.ordner / "geraete"
        self.journal_dir.mkdir(parents=True, exist_ok=True)
        self.geraete_dir.mkdir(parents=True, exist_ok=True)
        self.geraet = geraet
        self._lock = threading.RLock()
        self._dateien: dict[str, dict] = {}   # Dateiname → {groesse, mtime, offset, ops}
        self._zustand: dict[str, dict[str, dict]] = {k: {} for k in SAMMLUNGEN}
        self._uhr = 0          # größter bekannter Zeitstempel (hybride Uhr)
        self._seq = 0          # laufende Nummer in der eigenen Datei
        self._anzahl = 0       # Anzahl angewendeter Änderungen
        self._letzte = ""      # Schlüssel der letzten Änderung (für den Stand)
        self._icloud_wartet: list[str] = []
        self._icloud_angestossen: dict[str, float] = {}
        self.aktualisieren(erzwingen=True)

    # ── Lesen ──────────────────────────────────────────────────────────
    @property
    def eigene_datei(self) -> Path:
        return self.journal_dir / f"{self.geraet}.jsonl"

    def _lies_neu(self, pfad: Path, eintrag: dict | None) -> dict:
        """Liest eine Journaldatei. Ist sie nur gewachsen, wird nur das Neue gelesen."""
        st = pfad.stat()
        if eintrag and st.st_size >= eintrag["offset"] and st.st_size >= eintrag["groesse"]:
            start, ops = eintrag["offset"], list(eintrag["ops"])
        else:
            start, ops = 0, []
        with open(pfad, "rb") as f:
            f.seek(start)
            daten = f.read()
        # Nur vollständige Zeilen verwenden. Eine halbe letzte Zeile (iCloud
        # überträgt gerade) wird beim nächsten Mal gelesen.
        ende = daten.rfind(b"\n") + 1
        for zeile in daten[:ende].splitlines():
            zeile = zeile.strip()
            if not zeile:
                continue
            try:
                op = json.loads(zeile)
            except ValueError:
                continue  # kaputte Zeile überspringen statt alles zu blockieren
            if isinstance(op, dict) and op.get("k") in SAMMLUNGEN and op.get("a") in AKTIONEN:
                ops.append(op)
        return {"groesse": st.st_size, "mtime": st.st_mtime, "offset": start + ende, "ops": ops}

    def _icloud_platzhalter(self) -> None:
        """iCloud lagert selten genutzte Dateien aus („.name.jsonl.icloud“).

        Dann fehlt die echte Datei auf diesem Mac. Wir bitten macOS, sie zu
        laden, und melden das in der Oberfläche.
        """
        wartet = []
        for p in self.journal_dir.glob(".*.icloud"):
            echt = p.parent / p.name[1:-len(".icloud")]
            wartet.append(echt.name)
            jetzt = time.time()
            if jetzt - self._icloud_angestossen.get(echt.name, 0) > 60 and shutil.which("brctl"):
                self._icloud_angestossen[echt.name] = jetzt
                try:
                    subprocess.Popen(["brctl", "download", str(echt)],
                                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                except OSError:
                    pass
        self._icloud_wartet = wartet

    def aktualisieren(self, erzwingen: bool = False) -> bool:
        """Prüft, ob ein Mac etwas Neues geschrieben hat. True, wenn ja."""
        with self._lock:
            self._icloud_platzhalter()
            gefunden = {}
            for pfad in sorted(self.journal_dir.glob("*.jsonl")):
                try:
                    st = pfad.stat()
                except OSError:
                    continue
                alt = self._dateien.get(pfad.name)
                if alt and alt["groesse"] == st.st_size and alt["mtime"] == st.st_mtime:
                    gefunden[pfad.name] = alt
                    continue
                try:
                    gefunden[pfad.name] = self._lies_neu(pfad, alt)
                except OSError:
                    if alt:
                        gefunden[pfad.name] = alt
            geaendert = erzwingen or gefunden.keys() != self._dateien.keys() or any(
                gefunden[n] is not self._dateien.get(n) for n in gefunden)
            self._dateien = gefunden
            if geaendert:
                self._neu_aufbauen()
            return geaendert

    def _neu_aufbauen(self) -> None:
        # Doppelte Zeilen (z. B. aus einer iCloud-Konfliktkopie) nur einmal zählen.
        alle: dict[tuple, dict] = {}
        for eintrag in self._dateien.values():
            for op in eintrag["ops"]:
                # Zeit gehört zum Schlüssel: Nach einem Neustart mit ausgelagerter
                # Datei könnte dieselbe laufende Nummer sonst zweimal vorkommen.
                alle[(op.get("g", ""), op.get("n", 0), op.get("z", 0))] = op
        ops = sorted(alle.values(), key=lambda o: (o.get("z", 0), o.get("g", ""), o.get("n", 0)))
        self._zustand = {k: {} for k in SAMMLUNGEN}
        self._anzahl = 0
        for op in ops:
            self._anwenden(op)
        eigene = [o.get("n", 0) for o in alle.values() if o.get("g") == self.geraet]
        self._seq = max([self._seq, *eigene]) if eigene else self._seq

    def _anwenden(self, op: dict) -> None:
        sammlung = self._zustand[op["k"]]
        doc_id = str(op.get("id") or "")
        if not doc_id:
            return
        if op["a"] == "del":
            sammlung.pop(doc_id, None)
        elif op["a"] == "set":
            sammlung[doc_id] = {**(op.get("w") or {}), "id": doc_id}
        elif op["a"] == "upd":
            if doc_id not in sammlung:
                return  # Änderung an einem gelöschten Eintrag: ignorieren
            for feld, wert in (op.get("w") or {}).items():
                if feld == "id":
                    continue
                if wert is None:
                    sammlung[doc_id].pop(feld, None)
                else:
                    sammlung[doc_id][feld] = wert
        if doc_id in sammlung:
            sammlung[doc_id]["_geaendert"] = op.get("z", 0)
            if op.get("von"):
                sammlung[doc_id]["_von"] = op["von"]
        self._uhr = max(self._uhr, int(op.get("z", 0)))
        self._anzahl += 1
        self._letzte = f'{op.get("z", 0)}.{op.get("g", "")}.{op.get("n", 0)}'

    # ── Schreiben ──────────────────────────────────────────────────────
    def _zeit(self) -> int:
        self._uhr = max(int(time.time() * 1000), self._uhr + 1)
        return self._uhr

    def schreibe(self, aenderungen: list[dict], von: str = "") -> list[str]:
        """Schreibt Änderungen. Gibt die IDs zurück (neu vergebene bei „set“ ohne ID)."""
        if not isinstance(aenderungen, list) or not aenderungen:
            raise SpeicherFehler("Keine Änderungen übergeben.")
        if len(aenderungen) > 2000:
            raise SpeicherFehler("Zu viele Änderungen auf einmal.")
        with self._lock:
            self.aktualisieren()
            if self.eigene_datei.name in self._icloud_wartet:
                raise SpeicherFehler("iCloud lädt die Daten dieses Macs gerade herunter. Bitte in einer Minute noch einmal speichern.")
            zeilen, ops, ids = [], [], []
            for a in aenderungen:
                k, aktion = a.get("k"), a.get("a")
                if k not in SAMMLUNGEN:
                    raise SpeicherFehler(f"Unbekannter Bereich: {k}")
                if aktion not in AKTIONEN:
                    raise SpeicherFehler(f"Unbekannte Aktion: {aktion}")
                doc_id = str(a.get("id") or "")
                if not doc_id:
                    if aktion != "set":
                        raise SpeicherFehler("Für Ändern und Löschen fehlt die ID.")
                    doc_id = neue_id()
                if len(doc_id) > 64 or not doc_id.replace("-", "").replace("_", "").isalnum():
                    raise SpeicherFehler("Ungültige ID.")
                werte = a.get("w") or {}
                if not isinstance(werte, dict):
                    raise SpeicherFehler("Ungültige Werte.")
                werte = {f: w for f, w in werte.items() if not str(f).startswith("_") and f != "id"}
                self._seq += 1
                op = {"z": self._zeit(), "g": self.geraet, "n": self._seq, "k": k,
                      "a": aktion, "id": doc_id}
                if aktion != "del":
                    op["w"] = werte
                if von:
                    op["von"] = von
                zeile = json.dumps(op, ensure_ascii=False, separators=(",", ":"))
                if len(zeile.encode("utf-8")) > MAX_ZEILE:
                    raise SpeicherFehler("Eintrag ist zu groß.")
                zeilen.append(zeile)
                ops.append(op)
                ids.append(doc_id)
            # Alles in einem Rutsch anhängen und auf die Platte zwingen.
            text = ("\n".join(zeilen) + "\n").encode("utf-8")
            fd = os.open(self.eigene_datei, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o644)
            try:
                os.write(fd, text)
                os.fsync(fd)
            finally:
                os.close(fd)
            # Eigene Änderungen sind immer die neuesten → direkt anwenden.
            for op in ops:
                self._anwenden(op)
            eintrag = self._dateien.get(self.eigene_datei.name)
            st = self.eigene_datei.stat()
            if eintrag and eintrag["offset"] == st.st_size - len(text):
                eintrag.update(groesse=st.st_size, mtime=st.st_mtime, offset=st.st_size)
                eintrag["ops"].extend(ops)
            else:
                self._dateien[self.eigene_datei.name] = self._lies_neu(self.eigene_datei, None)
            return ids

    # ── Abfragen ───────────────────────────────────────────────────────
    def stand(self) -> str:
        with self._lock:
            return f"{self._anzahl}:{self._letzte}"

    def alles(self) -> dict[str, list[dict]]:
        with self._lock:
            return {k: [dict(d) for d in v.values()] for k, v in self._zustand.items()}

    def liste(self, sammlung: str) -> list[dict]:
        with self._lock:
            return [dict(d) for d in self._zustand.get(sammlung, {}).values()]

    def hole(self, sammlung: str, doc_id: str) -> dict | None:
        with self._lock:
            d = self._zustand.get(sammlung, {}).get(doc_id)
            return dict(d) if d else None

    def icloud_wartet(self) -> list[str]:
        return list(self._icloud_wartet)

    # ── Welche Macs nutzen den Ordner? ─────────────────────────────────
    def melde_geraet(self, name: str, mitglied: str = "") -> None:
        """Jeder Mac schreibt seine eigene kleine Datei mit Name und letzter Aktivität."""
        datei = self.geraete_dir / f"{self.geraet}.json"
        inhalt = {"id": self.geraet, "name": name, "mitglied": mitglied,
                  "zuletzt": int(time.time() * 1000)}
        tmp = datei.with_name(f".{datei.name}.tmp")
        tmp.write_text(json.dumps(inhalt, ensure_ascii=False), encoding="utf-8")
        tmp.replace(datei)

    def geraete(self) -> list[dict]:
        liste = []
        for p in self.geraete_dir.glob("*.json"):
            try:
                d = json.loads(p.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                continue
            if isinstance(d, dict) and d.get("id"):
                d["dieser"] = d["id"] == self.geraet
                liste.append(d)
        return sorted(liste, key=lambda d: -int(d.get("zuletzt", 0)))
