# Workflow-Analyse (Stand 19.10.2026)

Ich habe jeden Ablauf in Stelax OS gegen den Business Case und den Bericht „Dokumente für die Stelax GmbH“ geprüft. Gefundene Lücken sind behoben, sofern sie ohne eure Entscheidung lösbar waren. Alle Punkte sind mit Tests abgesichert (`npm test`, 15 Tests).

## Behoben

| Lücke | Was jetzt passiert |
|---|---|
| Schlusszahlung beim Livegang, obwohl sie erst mit der Abnahme fällig ist (§ 641 BGB) | Nach dem Livegang bittet Stelax OS um Abnahme im Portal, mit 14 Tagen Frist ab Versand. Danach folgen Abnahmeprotokoll und Schlusszahlung. Ohne Antwort und ohne Mangel greift die Abnahmefiktion (Agent, täglich). |
| Keine Auftragsbestätigung | Sie entsteht nach der Annahme automatisch, mit Nachweis (Name, Zeit, AGB-Version, Unternehmer). |
| Annahme ohne Unternehmer-Bestätigung und ohne AGB-Hinweis | Pflichthäkchen im Portal, AGB-Kasten und Leistungsbeschreibung (inkl. „nicht enthalten“, Abnahme, Mitwirkung, KI und BFSG) im Angebot |
| Rechnungen mit „14 Tagen“ statt Datum | „zahlbar bis TT.MM.JJJJ“: Verzug tritt ohne Mahnung ein. Die Schlussrechnung zieht Anzahlung und deren Steuer ab. Die Anzahlungsrechnung hat den Hinweis auf Vereinnahmung. |
| Nur eine Erinnerung | Drei Stufen: Erinnerung, 1. Mahnung (10,52 % Zins, 40 € Pauschale), letzte Mahnung. Jede Stufe zählt erst nach dem Versand hoch. Hinweis, wenn der Basiszins veraltet ist. |
| Anfrageformular der Kunden-Websites schickte ins Leere (`action="#"`) | Anfragen werden gespeichert und im Kundenportal gezeigt. Sie zählen für den Monatsreport. Eine Spam-Falle ist eingebaut. In Demos wird nichts gespeichert. |
| Monatsreport im Paket versprochen, aber nicht gebaut | Report-Agent zum Monatsanfang: Anfragen, Vormonat, Erreichbarkeit. Geht als PDF durch die Freigabe. |
| Nachtrag-Angebot für Bestandskunden setzte den Status auf „Angebot“ und die Portal-Häkchen zurück | Status bleibt „Kunde“. Die Häkchen hängen am Angebot des laufenden Projekts. |
| Keine Kündigung, kein Vertragsende | Kündigung erfassen: Ende wird berechnet, Bestätigung geht durch die Freigabe, das Stripe-Abo endet nach Freigabe. Zum Ende kommt eine Erinnerung an die Übergabe. |
| § 35a GmbHG fehlte in Mails und unvollständig im Briefbogen | Fußzeile und Mail-Signatur kommen aus `brand/tokens.json`. |
| Akquise-Brief ohne ausdrücklichen Art.-21-Hinweis und ohne konkrete Quelle | Ausdrücklicher Widerspruchshinweis. Die Quelle je Lead wird gespeichert und steht im Brief. |
| Betroffenenrechte nur als Widerspruch | Datenauskunft als Datei. Löschung mit Aufbewahrungsregel. Verzeichnis der Verarbeitungen je Kunde. |
| BFSG-Abfrage fehlte | Im Portal werden Mitarbeiterzahl, Umsatz und Verbraucherfunktion abgefragt. Der Hinweis erscheint beim Livegang. |
| Kunden-Websites konnten nicht unter der eigenen Domain laufen, Umzug bestehender Domains fehlte ganz | Auslieferung je Domain (www → ohne www, alte Adressen per 301), Zertifikatsfreigabe für Caddy, Umzugs-Agent mit DNS-Bestandsaufnahme, Anleitung, Prüfung der Umstellung und Kündigungshinweis. Auftrag und Rechte an Inhalten werden im Portal bestätigt. |
| Löschfristen nur für Demos und Leads | Auch Angebote ohne Auftrag (1 Jahr) und Website-Anfragen (12 Monate, Annahme) werden gelöscht. |

## Braucht eure Entscheidung (steht auch unter Unterlagen → Zu entscheiden)

1. **Anfragen sofort an den Kunden weiterleiten?** Heute liegen sie nur im Portal. Eine Weiterleitung per Mail ginge an der Freigabe vorbei. Vorschlag: als Ausnahme für die eigenen Anfragen des Kunden erlauben, als eigener, protokollierter Weg.
2. **Projektzahlungen per Stripe oder per Überweisung?** Der Bericht empfiehlt Überweisung, wegen der 8 Wochen Rückgaberecht bei SEPA-Basislastschrift. Die Umstellung geht mit einem Schalter: `ZAHLUNGSWEG=ueberweisung`.
3. **Nachtrag-Angebote** (weiteres Modul für Bestandskunden) legen nach der Zahlung heute ein neues Website-Projekt an. Hier braucht es einen eigenen Projekttyp „Modul“. Das baue ich, sobald ihr wisst, wie ihr Module liefert.
4. **Kündigungsfrist:** Angenommen sind 12 Monate Mindestlaufzeit, danach Kündigung zum Ende des Folgemonats. Der Anwalt legt das in den AGB fest.
5. **AGB-Text:** Version „Entwurf 10/2026“. Nach der Prüfung durch den Anwalt `AGB_VERSION` setzen und die AGB unter stelax.de/agb veröffentlichen.

## Noch offen (technisch)

- Zertifikate für Kunden-Domains: Caddy mit on-demand TLS vor die App setzen (Anleitung in `docs/betrieb.md`), einmal mit einer Test-Domain üben
- Weg B (Domain zu uns holen): Registrar-Konto anlegen; Zone und Providerwechsel sind bisher Handarbeit mit Anleitung, ein Adapter für Hetzner folgt nach dem ersten Fall
- Neue Domain für Kunden ohne Domain registrieren (heute: Meldung, Handarbeit)

- Zwei-Faktor-Anmeldung vor dem ersten echten Kunden
- Anruf-Messung („Klick zum Anruf“) für den Monatsreport
- Echte Adapter testen: Resend, Stripe, Briefdienst, Whisper, Claude
- Change Request (Mehraufwand im laufenden Projekt) als eigene Vorlage
