"""Schnittstelle des Servers: Schutzregeln und Datenfluss."""
import pytest

import app as server


@pytest.fixture
def client():
    server.app.config["TESTING"] = True
    return server.app.test_client()


KOPF = {"X-TurnierPro": "1"}


def test_startseite_und_sicherheitskoepfe(client):
    r = client.get("/")
    assert r.status_code == 200
    assert "frame-ancestors 'none'" in r.headers["Content-Security-Policy"]
    assert r.headers["X-Frame-Options"] == "DENY"


def test_fremder_host_wird_abgelehnt(client):
    assert client.get("/api/start", headers={"Host": "boese.example"}).status_code == 403


def test_aendern_nur_mit_app_kopf(client):
    body = {"aenderungen": [{"k": "team", "a": "set", "w": {"name": "Test"}}]}
    assert client.post("/api/daten", json=body).status_code == 403
    r = client.post("/api/daten", json=body, headers=KOPF)
    assert r.status_code == 200 and r.get_json()["ok"]
    daten = client.get("/api/daten").get_json()["daten"]
    assert any(t["name"] == "Test" for t in daten["team"])


def test_ich_nur_mit_bekanntem_mitglied(client):
    assert client.post("/api/ich", json={"mitglied": "gibtsnicht"}, headers=KOPF).status_code == 400
    [mid] = client.post("/api/daten", json={"aenderungen": [{"k": "team", "a": "set", "w": {"name": "Felix"}}]}, headers=KOPF).get_json()["ids"]
    assert client.post("/api/ich", json={"mitglied": mid}, headers=KOPF).get_json()["ich"] == mid
    assert client.get("/api/start").get_json()["ich"] == mid


def test_ungueltige_aenderung(client):
    r = client.post("/api/daten", json={"aenderungen": [{"k": "passwoerter", "a": "set", "w": {}}]}, headers=KOPF)
    assert r.status_code == 400


def test_export_routen(client):
    assert client.get("/api/export/vertrieb.xlsx").status_code == 200
    assert client.get("/api/export/sicherung.json").status_code == 200
    assert client.get("/api/export/geheim.txt").status_code == 404


def test_download_ohne_pfad_tricks(client):
    assert client.get("/download/../einstellungen.json").status_code == 404


def test_automatik_uebernehmen(client):
    r = client.post("/api/automatik/uebernehmen", json={}, headers=KOPF).get_json()
    assert r["dieser"] is True and r["besitzer"]["geraet"]


def test_abschluss_datum_nur_vorwaerts_und_bleibt_bei_besitzerwechsel(client):
    import geteilt

    geteilt.merke_abschluss(2026, 9)
    geteilt.merke_abschluss(2026, 7)  # älterer Monat darf nichts zurückdrehen
    assert geteilt.letzter_abschluss() == "2026-09"
    geteilt.automatik_uebernehmen()   # Besitzerwechsel überschreibt das Datum nicht
    assert geteilt.letzter_abschluss() == "2026-09"


def test_ersetze_datei_bei_icloud_sperre(tmp_path, monkeypatch):
    """iCloud meldet „Resource deadlock avoided“: alte Datei weg, neuer Versuch, Datei liegt danach richtig."""
    import errno
    import os

    import config

    ziel, neu = tmp_path / "Uebersicht.pdf", tmp_path / ".Uebersicht.pdf.neu"
    ziel.write_text("alt"); neu.write_text("neu")
    echt, aufrufe = os.replace, []

    def replace(a, b):
        aufrufe.append(1)
        if len(aufrufe) == 1:
            raise OSError(errno.EDEADLK, "Resource deadlock avoided")
        return echt(a, b)

    monkeypatch.setattr(os, "replace", replace)
    monkeypatch.setattr("time.sleep", lambda s: None)
    config.ersetze_datei(neu, ziel)
    assert ziel.read_text() == "neu" and not neu.exists() and len(aufrufe) == 2
