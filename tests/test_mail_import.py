"""Mail-Import: Rechnungen wie von Zoom erkennen und Gründe für Übersprungenes melden."""
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import pytest

import config
import mail_import_service as m


class FakeImap:
    """Ein Ordner voller Mails, ohne echten Server."""

    def __init__(self, mails):
        self.mails = [x.as_bytes() for x in mails]

    def select(self, name, readonly=False):
        return "OK", [b""]

    def search(self, *_):
        return "OK", [" ".join(str(i + 1) for i in range(len(self.mails))).encode()]

    def fetch(self, num, _):
        return "OK", [(b"", self.mails[int(num) - 1])]


def mail(betreff, von, pdf=False, ohne_disposition=False, text="Rechnung INV-1001 über 14,99 EUR"):
    msg = MIMEMultipart()
    msg["Subject"], msg["From"], msg["Date"] = betreff, von, "Tue, 15 Sep 2026 10:00:00 +0200"
    msg["Message-ID"] = f"<{abs(hash(betreff + von))}@test>"
    msg.attach(MIMEText(text, "plain", "utf-8"))
    if pdf:
        teil = MIMEApplication(b"%PDF-1.4\n" + b"0" * 5000, "pdf")
        if not ohne_disposition:
            teil.add_header("Content-Disposition", "attachment", filename="Zoom_Invoice_INV-1001.pdf")
        teil.set_param("name", "Zoom_Invoice_INV-1001.pdf")
        msg.attach(teil)
    return msg


@pytest.fixture
def finanzen(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "get_finanzen_root", lambda: tmp_path)
    monkeypatch.setattr(m, "_email_als_pdf", lambda *a: False)  # kein Chrome wie auf manchen Macs
    return tmp_path


def test_pdf_ohne_content_disposition_wird_abgelegt(finanzen):
    imap = FakeImap([mail("Ihre Zoom-Rechnung", "Zoom <billing@zoom.us>", pdf=True, ohne_disposition=True)])
    erg = m._verarbeite_ordner(imap, "Rechnungen Eingang", "ausgaben", set(), 2026, [9])
    assert len(erg["abgelegt"]) == 1
    assert list(finanzen.rglob("*.pdf"))


def test_zahlungsbestaetigung_wird_mit_grund_gemeldet(finanzen):
    imap = FakeImap([mail("Ihre Zahlung war erfolgreich", "Zoom <billing@zoom.us>")])
    erg = m._verarbeite_ordner(imap, "INBOX", "auto", set(), 2026, [9], nur_relevante=True)
    assert not erg["abgelegt"]
    assert "Zahlungsbestätigung" in erg["nicht_uebernommen"][0]["grund"]


def test_rechnungsabsender_ohne_stichwort_im_betreff(finanzen):
    """Zoom schreibt z. B. „Your subscription has been renewed“ von billing@zoom.us."""
    imap = FakeImap([mail("Your Zoom plan has been updated", "Zoom <billing@zoom.us>")])
    erg = m._verarbeite_ordner(imap, "INBOX", "auto", set(), 2026, [9], nur_relevante=True)
    assert len(erg["abgelegt"]) == 1  # ohne Chrome als schlichtes Text-PDF
    datei = next(finanzen.rglob("*.pdf"))
    assert datei.read_bytes()[:4] == b"%PDF"


def test_anderer_monat_wird_nicht_angefasst(finanzen):
    imap = FakeImap([mail("Ihre Zoom-Rechnung", "Zoom <billing@zoom.us>", pdf=True)])
    erg = m._verarbeite_ordner(imap, "Rechnungen Eingang", "ausgaben", set(), 2026, [10])
    assert not erg["abgelegt"] and not erg["nicht_uebernommen"]
