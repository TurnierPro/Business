# Sicherheit und Datenschutz: Prüfbericht (Stand 20.10.2026)

Geprüft wurde Stelax OS selbst (eigenes System, lokal): Code-Durchsicht mit Blick eines Angreifers, Angriffe gegen den laufenden Server, Abhängigkeiten, Datenschutz nach DSGVO, BDSG, TDDDG und UWG. **Keine Rechtsberatung**: Die Datenschutz-Dokumente sind Entwürfe; vor dem ersten echten Kunden mit Anwalt oder externem Datenschutzberater abstimmen. Vor dem Verkauf als Produkt einen **externen** Penetrationstest beauftragen. Ein Test durch den eigenen Entwickler ersetzt ihn nicht.

## 1. Penetrationstest

**Vorgehen:** Black-Box-Angriffe gegen den Produktions-Build (`npm start`) mit einem Skript, danach White-Box-Durchsicht aller Stellen, an denen Daten von außen kommen oder nach außen gehen. Jeder Fund hat jetzt einen automatischen Test in `tests/sicherheit.test.ts` und läuft mit jedem `npm test`.

| # | Fund | Schwere | Status |
|---|---|---|---|
| 1 | Start-Passwort stand auf der Login-Seite (auch auf dem Server beim ersten Start) und im Code | **hoch** | behoben: nur auf dem eigenen Rechner sichtbar; Server braucht `STELAX_START_PASSWORT` (≥ 12 Zeichen); Wechsel beim ersten Anmelden ist Pflicht |
| 2 | Keine Sperre nach Fehlversuchen: Passwort und Zwei-Faktor-Code ließen sich durchprobieren | **hoch** | behoben: 5 Fehlversuche je Konto bzw. 20 je Netz → 15 Minuten Sperre; Code: 5 Versuche |
| 3 | Server-seitige Abrufe (Website-Check, Domain-Umzug, Überwachung) konnten auf interne Adressen zielen (SSRF, z. B. Cloud-Metadaten, Datenbank) | **hoch** | behoben: nur öffentliche Adressen, jede Weiterleitung neu geprüft, nur Ports 80/443 |
| 4 | Keine Sicherheits-Header (CSP, Clickjacking, nosniff, Referrer, Permissions) | mittel | behoben: strenge CSP mit Nonce, Kunden-Websites ganz ohne Skripte, Portal-Links nie als Referrer |
| 5 | Formulare (Website-Anfragen, Portal-Wünsche) ohne Mengenbegrenzung: 40 von 40 Spam-Anfragen angenommen | mittel | behoben: 10 je Netz und Stunde, Spam-Falle |
| 6 | Uploads nur nach Dateiname bzw. Browser-Angabe geprüft | mittel | behoben: echter Inhalt wird geprüft (Fotos, PDF), Größen begrenzt |
| 7 | Formularfeld „zurück“ erlaubte Weiterleitung auf fremde Seiten (Open Redirect, für Phishing nutzbar) | mittel | behoben: nur interne Pfade |
| 8 | Sitzungen blieben nach Passwortwechsel gültig | mittel | behoben: Sitzungs-Version; Passwortwechsel und „überall abmelden“ beenden alle Sitzungen |
| 9 | Zwei-Faktor-Geheimnis im Klartext in der Datenbank; Codes mehrfach verwendbar | mittel | behoben: verschlüsselt (AES-256-GCM); jeder Code nur einmal |
| 10 | Backups gingen unverschlüsselt auf die Storage Box | mittel | behoben: außerhalb des Servers nur verschlüsselt; ohne `BACKUP_SCHLUESSEL` keine externe Kopie |
| 11 | Abhängigkeit mit bekannter Schwachstelle (postcss in Next.js) | niedrig | behoben: `npm audit` meldet 0 |
| 12 | Antwortzeit verriet, ob ein Konto existiert | niedrig | behoben: gleiche Rechenzeit |
| 13 | Gesundheits-Endpunkt und Fehlermeldungen zeigten technische Details | niedrig | behoben: Details nur ins Server-Log |
| 14 | `X-Powered-By: Next.js` verriet die Software | niedrig | behoben |
| 15 | PDF-Erzeugung mit JavaScript und Netzzugriff | niedrig (Vorsorge) | behoben: PDF-Browser ohne JavaScript und ohne Internet |

**Ohne Befund geprüft:**
- Zugriff ohne Anmeldung auf 23 geschützte Pfade, darunter Downloads, Exporte und die Datenauskunft.
- Pfad-Traversierung (`../`) in Vorschau, Portal, Kunden-Websites und Host-Header.
- Falsche oder zu kurze Portal-Links.
- API ohne oder mit falschem Schlüssel.
- Kalender-Links.
- Zertifikats-Freigabe für fremde Domains.
- Einschleusen von Code (XSS) über Namen und Texte: React und die Druckvorlagen maskieren alles.
- SQL-Injection über Suche und Filter: Die Datenbankabfragen sind parametrisiert.
- CSRF: Server-Aktionen prüfen die Herkunft, Cookies sind `SameSite=Lax`.

**Wiederholen:** `node scripts/pentest.mjs` gegen einen laufenden Server (nur gegen eigene Systeme!).

## 2. Datenschutz: Was in Stelax OS umgesetzt ist

Unter **Datenschutz** im Menü:
- **Verzeichnis der Verarbeitungstätigkeiten** als Verantwortliche (Art. 30 Abs. 1). Das Verzeichnis als Auftragsverarbeiter je Kunde steht unter System.
- **Technische und organisatorische Maßnahmen** (Art. 32), mit Stand „umgesetzt“ oder „offen“.
- **Dienstleister** mit AV-Pflicht und Drittland-Hinweis.
- **Löschkonzept**: Der Aufräum-Agent löscht täglich.
- **Datenpannen-Register** mit 72-Stunden-Frist (Art. 33/34), Push-Meldung und Hinweis auf „Heute“.
- **Anfragen von Betroffenen** (Art. 15–21) mit Monatsfrist. Auskunft als Datei und Löschung je Betrieb, mit Aufbewahrungsregel.

Dazu wie bisher:
- Hinweis nach Art. 14/21 im Akquise-Brief.
- Sperrliste.
- Aufnahme nur mit Einwilligung, Löschung nach spätestens 30 Tagen.
- Kundenportal ohne Cookies und Tracking, mit Links zu Impressum und Datenschutz.
- IP-Adressen nur gekürzt.

## 3. Checkliste Datenschutz bei der Gründung (Deutschland)

| Pflicht | Grundlage | Stand |
|---|---|---|
| Verzeichnis der Verarbeitungstätigkeiten | Art. 30 DSGVO | Entwurf in Stelax OS, mit Berater prüfen |
| TOM dokumentiert | Art. 32 DSGVO | in Stelax OS; organisatorische Punkte offen |
| AV-Verträge mit Hetzner, Anthropic, Resend, Briefdienst abschließen und ablegen | Art. 28 DSGVO | offen (Register „Unterlagen“) |
| Drittland: Anthropic und Resend (USA). Grundlage prüfen: Data Privacy Framework, sonst Standardvertragsklauseln; Alternative: EU-Anbieter | Art. 44 ff. DSGVO | offen |
| AV-Vertrag-Muster für eure Kunden (Stelax als Auftragsverarbeiter), mit TOM und Unterauftragnehmern | Art. 28 DSGVO | offen, Anwalt |
| Datenschutzerklärung und Impressum auf stelax.de, Datenschutzhinweise fürs Kundenportal | Art. 13 DSGVO, § 5 DDG | offen |
| Entscheidung Datenschutzbeauftragter schriftlich festhalten (unter 20 Personen nicht Pflicht) | § 38 BDSG | offen |
| Schwellwertanalyse Datenschutz-Folgenabschätzung für KI-Auswertung von Gesprächsaufnahmen | Art. 35 DSGVO | offen; Empfehlung: kurz dokumentieren, Einwilligung und schnelle Löschung sind umgesetzt |
| Verpflichtung auf Vertraulichkeit für alle mit Zugang | Art. 29, 32 Abs. 4 DSGVO | offen |
| Datenpannen-Prozess, Zuständige benennen | Art. 33/34 DSGVO | Register umgesetzt, Zuständige festlegen |
| Prozess für Anfragen von Betroffenen | Art. 12–22 DSGVO | umgesetzt |
| Löschkonzept | Art. 5, 17 DSGVO | umgesetzt |
| Keine Cookies ohne Einwilligung (Stelax OS und Kunden-Websites setzen keine) | § 25 TDDDG | umgesetzt |
| Werbung nur per Brief, Widerspruch sofort beachten | § 7 UWG, Art. 21 DSGVO | umgesetzt (Sperrliste) |
| Aufbewahrung Rechnungen 8 Jahre, Handelsbriefe 6 Jahre, GoBD-Verfahrensdokumentation | § 147 AO, § 257 HGB, GoBD | Löschregeln beachten das; Doku offen |
| Mitarbeiterdaten (ab erster Einstellung) | § 26 BDSG | später |

## 4. Server härten (Hetzner, vor dem ersten echten Kunden)

1. SSH nur mit Schlüssel, Passwort-Anmeldung und Root-Login aus; Hetzner-Firewall: nur 22 (besser nur eure IP), 80, 443.
2. Automatische Sicherheitsupdates (`unattended-upgrades`), Coolify regelmäßig aktualisieren.
3. Datenbank nicht nach außen öffnen (nur im Docker-Netz).
4. Umgebungsvariablen nur in Coolify und im Passwortmanager:
   - `SESSION_SECRET` mit mindestens 32 zufälligen Zeichen
   - `STELAX_START_PASSWORT`
   - `BACKUP_SCHLUESSEL`
   - Stripe-Schlüssel
5. Caddy oder Traefik mit HTTPS. `BASE_URL` mit `https://` setzen, dann sind HSTS und HTTPS-Pflicht aktiv.
6. Zwei-Faktor für alle Konten einschalten: Stelax OS, Hetzner, Coolify, GitHub, Stripe, Domain-Anbieter, E-Mail.
7. Backups: Rücksicherung einmal von Hand üben, mit `scripts/backup-entschluesseln.ts`.
8. Geräte: Festplattenverschlüsselung (FileVault), Bildschirmsperre, Passwortmanager, keine Firmendaten auf Arbeitgeber-Geräten.
