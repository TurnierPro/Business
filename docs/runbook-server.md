# Runbook: Server aufsetzen und aus der Sicherung wiederherstellen

Für Daniel und Maximilian. Jeder Schritt lässt sich ohne Programmierkenntnisse ausführen. Was du brauchst, steht in Bitwarden in der Sammlung **„Levarex Server“** (Notfallzugang für beide).

**Ziel:** Nach einem Totalausfall läuft Levarex OS innerhalb eines Werktags wieder (Service-Level Dok. 20). Jede echte Wiederherstellung und jeder Probelauf wird mit Dauer unten in der Tabelle eingetragen.

## Was wo liegt

| Was | Wo |
|---|---|
| Server (VPS) | Hostinger, Konto der GmbH. Daniel ist Owner, Maximilian Admin |
| Sicherung (täglich 2 Uhr, 30 Tage) | IONOS Object Storage, Bucket `levarex-sicherung`, Rechenzentrum Deutschland |
| Schlüssel zum Entschlüsseln der Sicherung | Bitwarden: „Levarex Backup-Schlüssel“ (`BACKUP_SCHLUESSEL`). Ohne ihn ist jede Sicherung wertlos |
| Schlüssel für die Zugangsdaten in n8n | Bitwarden: „n8n Encryption Key“ (`N8N_ENCRYPTION_KEY`) |
| Inhalt der `.env` | Bitwarden: Notiz „Levarex .env“ (Vorlage: `deploy/server.env.example`) |
| Code | GitHub, Repository Business |
| Überwachung | Better Stack prüft alle 3 Minuten `https://<OS_DOMAIN>/api/gesundheit` und meldet per App und SMS |

## A. Server neu aufsetzen (ca. 60 Minuten)

1. **VPS anlegen:** Hostinger → VPS → Ubuntu 24.04, Standort Deutschland oder Niederlande (EU). Im Panel unter „SSH-Schlüssel“ deinen öffentlichen Schlüssel hinterlegen (Bitwarden: „SSH Daniel“ bzw. „SSH Maximilian“).
2. **Anmelden:** im Terminal `ssh root@<IP-des-Servers>`. Klappt das ohne Passwort, weiter.
3. **Grundeinrichtung:** Code holen und Einrichtung starten:
   ```
   git clone https://github.com/TurnierPro/Business.git /opt/levarex
   bash /opt/levarex/deploy/server-einrichten.sh
   ```
   Das richtet Firewall, Anmeldung nur per Schlüssel, automatische Sicherheits-Updates und Docker ein.
4. **DNS:** bei netcup die A-Einträge von `os`, `portal` und `n8n` (levarex-consulting.de) auf die neue IP setzen. Kunden-Domains zeigen auf `SERVER_IP`; ändert sich die IP, müssen die Kunden umstellen (deshalb IP im Hostinger-Panel möglichst behalten).
5. **Zugangsdaten:** `nano /opt/levarex/.env`, Inhalt aus Bitwarden („Levarex .env“) einfügen, speichern, dann `chmod 600 /opt/levarex/.env`.
6. **Starten:**
   ```
   cd /opt/levarex
   docker compose run --rm caddy caddy validate --config /etc/caddy/Caddyfile
   docker compose up -d --build
   ```
   Die erste Zeile prüft die Caddy-Einstellungen; sie muss mit „Valid configuration“ enden.
   Nach etwa 5 Minuten: `https://os.levarex-consulting.de` öffnen. Die Anmeldeseite erscheint.

Beim allerersten Aufsetzen (keine Sicherung vorhanden) ist hier Schluss: anmelden, Start-Passwort ändern, Zwei-Faktor einrichten.

## B. Aus der Sicherung wiederherstellen (nach A, ca. 30 Minuten)

1. **Probelauf** (zeigt nur, welche Sicherung genommen würde):
   ```
   cd /opt/levarex
   docker compose stop n8n
   docker compose exec app npx tsx scripts/wiederherstellen.ts
   ```
   Prüfen: Ist das Datum von heute Nacht oder gestern? Wenn nicht, Maximilian anrufen.
2. **Einspielen:**
   ```
   docker compose exec app npx tsx scripts/wiederherstellen.ts --wirklich
   docker compose restart app
   docker compose start n8n
   ```
3. **Prüfen:** anmelden, unter **Logs → Technik und Agenten** ist alles grün; drei Betriebe stichprobenartig öffnen; ein Kundenportal-Link funktioniert; eine Kunden-Website lädt.
4. **Dauer eintragen** (Tabelle unten) und Maximilian Bescheid geben.

## C. Updates und Patches

- **Betriebssystem:** spielt Sicherheits-Updates selbst ein, Neustart falls nötig um 4 Uhr.
- **Levarex OS:** nur Maximilian, nach grünen Tests: `cd /opt/levarex && git pull && docker compose up -d --build`.
- **PostgreSQL, Caddy, n8n:** einmal im Monat (erster Montag) prüfen, ob es Sicherheits-Updates gibt. n8n: Version in der `.env` (`N8N_VERSION`) erhöhen, vorher die Änderungsliste lesen, dann `docker compose up -d n8n`. Nie „latest“.
- Jedes Update steht mit Datum im Änderungsprotokoll (Bitwarden-Notiz „Server-Änderungen“ oder Dok. 40).

## D. n8n absichern (einmalig nach dem ersten Start)

1. `https://n8n.levarex-consulting.de` öffnen, Inhaber-Konto anlegen (E-Mail der GmbH, langes Passwort in Bitwarden).
2. Unter **Einstellungen → Persönlich** die Zwei-Faktor-Anmeldung einschalten.
3. In Levarex OS unter **Stammdaten → Benutzer und Sicherheit** je n8n-Ablauf einen eigenen API-Schlüssel mit den nötigsten Rechten erzeugen (Code aus der Authenticator-App nötig) und in n8n als Zugangsdaten „Header Auth“ (`Authorization: Bearer …`) speichern. Adresse in n8n: `http://app:3000/api/v1/…`.
4. Jeder Schlüssel kommt in die Schlüsselliste (Dok. 40) mit Ablauf und Austauschanleitung.

n8n hat keinen Zugang zur Datenbank und kann nichts versenden: Entwürfe landen im Postausgang und brauchen eine Freigabe.

## E. Probe-Wiederherstellung (vor dem ersten Kunden, danach jedes Quartal)

Auf einem zweiten, kleinen Test-VPS Schritte A und B durchspielen, Zeit stoppen, danach den Test-VPS löschen. **Bestanden** heißt: alle Prüfungen aus B.3 grün, Dauer unter 4 Stunden.

| Datum | Wer | Art (Probe/Echt) | Sicherung vom | Dauer | Ergebnis |
|---|---|---|---|---|---|
| | | | | | |

**Freigabe-Sperre:** Erst wenn hier eine bestandene Probe steht, Better Stack eingerichtet ist und der externe Sicherheitstest gemacht ist, kommt ein echter Kunde ins Portal (Bauplan Etappe 8).
