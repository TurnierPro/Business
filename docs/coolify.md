# Levarex OS mit Coolify (Hostinger-Server)

Auf dem Hostinger-Server läuft Coolify. Coolify übernimmt Domains, HTTPS-Zertifikate und das Weiterleiten.
Deshalb nutzt Coolify die `docker-compose.yml` im Hauptordner: **ohne Caddy, ohne Ports nach außen**.
(Für einen Server ohne Coolify gibt es `deploy/docker-compose.ohne-coolify.yml` mit Caddy und `deploy/server-einrichten.sh`.)

## Einmal einrichten

1. **Coolify → Projekt → Resource → Docker Compose** mit dem Repository `Levarex/Levarex-Plattform`, Branch `main`,
   Compose-Datei `docker-compose.yml`.
2. **Domains** je Dienst eintragen (Coolify zeigt sie nach dem ersten Einlesen der Datei an):
   | Dienst | Domain(s) |
   |---|---|
   | app | `https://os.levarex-consulting.de,https://portal.levarex-consulting.de` |
   | n8n | `https://n8n.levarex-consulting.de` |
   | db | keine (nur intern) |

   Bei netcup zeigen `os`, `portal` und `n8n` per A-Eintrag auf die IP des Hostinger-Servers.
3. **Environment Variables** in Coolify (nicht ins Git, Werte zusätzlich in Bitwarden „Levarex Server“):
   | Variable | Pflicht | Wert |
   |---|---|---|
   | `SESSION_SECRET` | ja | `openssl rand -base64 32` |
   | `LEVAREX_START_PASSWORT` | ja | Passwort für die erste Anmeldung, danach ändern |
   | `N8N_VERSION` | ja | feste Version, z. B. aus github.com/n8n-io/n8n/releases (nie `latest`) |
   | `N8N_ENCRYPTION_KEY` | ja | `openssl rand -base64 32`, **unbedingt in Bitwarden**, sonst sind die Zugangsdaten in n8n bei einer Wiederherstellung verloren |
   | `SERVICE_PASSWORD_POSTGRES` | – | erzeugt Coolify selbst; nach dem ersten Deploy in Bitwarden sichern |
   | `BASE_URL`, `PORTAL_URL`, `LEVAREX_HOSTS`, `N8N_DOMAIN` | – | nur ändern, wenn die Domains anders heißen |
   | alle anderen (Mail, Lexware, Qonto, S3 …) | – | leer lassen = Simulator; erst eintragen, wenn der Dienst angebunden wird |
4. **Deploy.** Nach ein paar Minuten `https://os.levarex-consulting.de` öffnen, mit dem Start-Passwort anmelden,
   Passwort ändern, Zwei-Faktor einrichten.

## Unterschiede zur Fassung mit Caddy

- **Kunden-Websites:** Caddy hat für jede Kunden-Domain automatisch ein Zertifikat geholt. Mit Coolify trägst du
  die Domain eines Kunden beim Livegang zusätzlich bei **app → Domains** ein (kommagetrennt), dann holt Coolify das Zertifikat.
- **Updates:** Coolify baut neu, wenn du in Coolify auf „Redeploy“ klickst (oder automatisch bei jedem Push, wenn eingeschaltet).
  Vorher müssen `npm run typecheck` und `npm test` grün sein.
- **Sicherung und Wiederherstellung** wie im Runbook (`docs/runbook-server.md`, Teil B); Befehle in Coolify unter
  **app → Terminal** statt `docker compose exec app`.
