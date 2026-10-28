"""Tests für den geteilten Speicher: zwei Macs, ein Ordner."""
import json
import shutil
import time

import pytest

from speicher import Speicher, SpeicherFehler


@pytest.fixture
def ordner(tmp_path):
    return tmp_path / "daten"


def test_zwei_macs_sehen_dieselben_daten(ordner):
    max_mac = Speicher(ordner, "max")
    felix_mac = Speicher(ordner, "felix")
    [vid] = max_mac.schreibe([{"k": "vereine", "a": "set", "w": {"name": "SV Muster"}}])
    assert felix_mac.aktualisieren() is True
    assert felix_mac.hole("vereine", vid)["name"] == "SV Muster"
    # Jeder Mac schreibt nur in seine eigene Datei
    assert sorted(p.name for p in (ordner / "journal").glob("*.jsonl")) == ["max.jsonl"]


def test_aenderungen_an_verschiedenen_feldern_bleiben_beide(ordner):
    a, b = Speicher(ordner, "a"), Speicher(ordner, "b")
    [vid] = a.schreibe([{"k": "vereine", "a": "set", "w": {"name": "FC Test", "status": "Erstkontakt"}}])
    b.aktualisieren()
    a.schreibe([{"k": "vereine", "a": "upd", "id": vid, "w": {"status": "Gewonnen"}}])
    b.schreibe([{"k": "vereine", "a": "upd", "id": vid, "w": {"telefon": "0721 1"}}])
    a.aktualisieren(); b.aktualisieren()
    for s in (a, b):
        v = s.hole("vereine", vid)
        assert v["status"] == "Gewonnen" and v["telefon"] == "0721 1"


def test_spaetere_aenderung_gewinnt_trotz_falscher_uhr(ordner, monkeypatch):
    a = Speicher(ordner, "a")
    # Uhr von Mac A geht 10 Minuten vor
    echt = time.time
    monkeypatch.setattr(time, "time", lambda: echt() + 600)
    [vid] = a.schreibe([{"k": "aufgaben", "a": "set", "w": {"titel": "Alt"}}])
    monkeypatch.setattr(time, "time", echt)
    b = Speicher(ordner, "b")  # sieht A's Eintrag, Uhr läuft richtig
    b.schreibe([{"k": "aufgaben", "a": "upd", "id": vid, "w": {"titel": "Neu"}}])
    a.aktualisieren()
    assert a.hole("aufgaben", vid)["titel"] == "Neu"
    assert b.hole("aufgaben", vid)["titel"] == "Neu"


def test_loeschen_und_aenderung_an_geloeschtem(ordner):
    a, b = Speicher(ordner, "a"), Speicher(ordner, "b")
    [vid] = a.schreibe([{"k": "projekte", "a": "set", "w": {"titel": "X"}}])
    a.schreibe([{"k": "projekte", "a": "del", "id": vid}])
    b.aktualisieren()
    b.schreibe([{"k": "projekte", "a": "upd", "id": vid, "w": {"titel": "Y"}}])
    assert b.hole("projekte", vid) is None


def test_halbe_zeile_wird_spaeter_gelesen(ordner):
    a = Speicher(ordner, "a")
    zeile = json.dumps({"z": 1, "g": "x", "n": 1, "k": "team", "a": "set", "id": "m1", "w": {"name": "Max"}})
    datei = ordner / "journal" / "x.jsonl"
    datei.write_text(zeile[:20])
    a.aktualisieren()
    assert a.hole("team", "m1") is None
    datei.write_text(zeile + "\n")
    a.aktualisieren()
    assert a.hole("team", "m1")["name"] == "Max"


def test_konfliktkopie_zaehlt_nicht_doppelt(ordner):
    a = Speicher(ordner, "a")
    a.schreibe([{"k": "team", "a": "set", "id": "m1", "w": {"name": "Max"}}])
    shutil.copy(ordner / "journal" / "a.jsonl", ordner / "journal" / "a 2.jsonl")
    b = Speicher(ordner, "b")
    assert len(b.liste("team")) == 1


def test_ungueltiges_wird_abgelehnt(ordner):
    a = Speicher(ordner, "a")
    with pytest.raises(SpeicherFehler):
        a.schreibe([{"k": "geheim", "a": "set", "w": {}}])
    with pytest.raises(SpeicherFehler):
        a.schreibe([{"k": "team", "a": "upd", "w": {"name": "ohne id"}}])
    with pytest.raises(SpeicherFehler):
        a.schreibe([{"k": "team", "a": "set", "id": "../x", "w": {}}])


def test_neustart_liest_alles_wieder_ein(ordner):
    a = Speicher(ordner, "a")
    for i in range(50):
        a.schreibe([{"k": "aktivitaeten", "a": "set", "w": {"notiz": f"Anruf {i}"}}])
    neu = Speicher(ordner, "a")
    assert len(neu.liste("aktivitaeten")) == 50
    # laufende Nummer geht nach dem Neustart weiter (keine doppelten Schlüssel)
    neu.schreibe([{"k": "aktivitaeten", "a": "set", "w": {"notiz": "danach"}}])
    assert len(Speicher(ordner, "c").liste("aktivitaeten")) == 51


def test_geraete_melden_sich(ordner):
    a, b = Speicher(ordner, "a"), Speicher(ordner, "b")
    a.melde_geraet("MacBook Max", "m1")
    b.melde_geraet("MacBook Felix", "m2")
    namen = {g["name"]: g["dieser"] for g in a.geraete()}
    assert namen == {"MacBook Max": True, "MacBook Felix": False}


def test_ausgelagerte_eigene_datei_kein_datenverlust(ordner):
    """iCloud lagert die eigene Datei aus, die App startet neu: nichts darf verloren gehen."""
    a = Speicher(ordner, "a")
    a.schreibe([{"k": "vereine", "a": "set", "w": {"name": "SV Alt"}}])
    j = ordner / "journal"
    (j / "a.jsonl").rename(j / ".a.jsonl.icloud")  # so sieht eine ausgelagerte Datei aus
    neu = Speicher(ordner, "a")
    with pytest.raises(SpeicherFehler):
        neu.schreibe([{"k": "vereine", "a": "set", "w": {"name": "SV Neu"}}])
    # iCloud lädt die Datei wieder, danach geht Schreiben normal
    (j / ".a.jsonl.icloud").rename(j / "a.jsonl")
    neu.aktualisieren()
    neu.schreibe([{"k": "vereine", "a": "set", "w": {"name": "SV Neu"}}])
    assert sorted(v["name"] for v in Speicher(ordner, "c").liste("vereine")) == ["SV Alt", "SV Neu"]


def test_gleiche_nummer_mit_anderer_zeit_bleibt_erhalten(ordner):
    j = ordner / "journal"
    j.mkdir(parents=True)
    zeile = lambda z, name: json.dumps({"z": z, "g": "a", "n": 1, "k": "vereine", "a": "set", "id": name, "w": {"name": name}})  # noqa: E731
    (j / "a.jsonl").write_text(zeile(1, "eins") + "\n")
    (j / "a 2.jsonl").write_text(zeile(2, "zwei") + "\n")
    assert len(Speicher(ordner, "b").liste("vereine")) == 2
