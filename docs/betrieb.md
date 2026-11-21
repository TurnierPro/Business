# Betriebshandbuch Levarex OS

Levarex OS läuft bei Hostinger auf einem Server (VPS) mit Docker Compose: Caddy (HTTPS), App, PostgreSQL und n8n. Aufsetzen, Wiederherstellen und Updates stehen im **Runbook** `docs/runbook-server.md`.

Was jede Meldung bedeutet und was du tust. Meldungen erscheinen unter **Logs → Technik und Agenten**; Ausfälle meldet Better Stack aufs Handy.

| Meldung | Bedeutung | Was tun |
|---|---|---|
| Backup erstellt, nicht extern | Sicherung liegt nur auf dem Server | `S3_*` und `BACKUP_SCHLUESSEL` in der `.env` prüfen. Bis das läuft, ist ein Serverausfall ein Datenverlust. |
| Probe-Rücksicherung fehlgeschlagen | Das letzte Backup ließ sich nicht einspielen | Sofort prüfen: Logs → Technik und Agenten → Backup „Jetzt“, dann Rücksicherung „Jetzt“. Klappt es nicht: `docker compose logs app` auf dem Server. |
| Seite(n) nicht erreichbar | Eine Kunden-Website antwortet nicht | Auf dem Server `docker compose ps`: laufen alle Dienste? DNS beim Kunden geändert? Zertifikat: `docker compose logs caddy`. |
| Lieferfrist knapp / verfehlt | Vorschau nicht rechtzeitig beim Kunden | Projekt öffnen, Kunden anrufen. Verfehlt: ein Monat Betreuung ohne Berechnung vormerken. |
| Tagesbericht: bitte prüfen | Fehlgeschlagene Jobs oder Warnungen in den letzten 24 h | System → Hintergrund-Jobs, Fehlertext lesen, „Wiederholen“. |
| Job mit Status Fehler | Ein Ablauf ist nach 3 Versuchen gescheitert | Fehlertext lesen. Häufig: fehlende Zugangsdaten eines Dienstes oder Dienst nicht erreichbar. |

## Feste Zeiten (deutsche Zeit)

| Wann | Was |
|---|---|
| Montag 6 Uhr | Wochenlauf: neue Leads |
| täglich 2 Uhr | Sicherung: Datenbank, Dateien und n8n, verschlüsselt zu IONOS, 30 Tage |
| täglich 3 Uhr | Aufräumen: Demos nach 60 Tagen, Leads ohne Reaktion nach 6 Monaten |
| Sonntag 4 Uhr | Probe-Rücksicherung des neuesten Backups |
| täglich 7 Uhr | Tagesbericht |
| alle 10 Minuten | Erreichbarkeit der Live-Seiten |
| täglich 5 Uhr | Abnahme nach Fristablauf, Vertragsende |
| täglich 6 Uhr | Lieferfristen |
| täglich 7 Uhr | Zahlstatus aus Lexware |

## Kunden-Domains (Umzug bestehender Websites)

Levarex OS liefert Kunden-Websites unter ihrer eigenen Domain aus: Jeder Host, der nicht Levarex OS selbst ist (`BASE_URL`, `LEVAREX_HOSTS`), bekommt die passende Kunden-Website. `www.` leitet auf die Domain ohne `www` um, alte Adressen der früheren Website per 301 auf die neuen Seiten.

**Was einmal eingerichtet werden muss (vor dem ersten Umzug testen):**

1. `SERVER_IP` in der `.env` setzen (öffentliche IPv4 des Servers). Diese Adresse steht in der Anleitung für den Kunden.
2. Zertifikate automatisch: Caddy (`deploy/Caddyfile`) fragt vor jedem neuen Zertifikat, ob die Domain zu uns gehört („on-demand TLS“). Kern davon:

```
{
  on_demand_tls {
    ask http://app:3000/api/tls-erlaubt
  }
}
https:// {
  tls { on_demand }
  reverse_proxy app:3000
}
levarex-consulting.de, os.levarex-consulting.de {
  reverse_proxy app:3000
}
```

   `/api/tls-erlaubt?domain=…` antwortet nur für Domains von Live-Projekten mit 200. So kann niemand Zertifikate für fremde Domains auslösen.
3. Für Weg B (Domain zu uns holen): Registrar-Konto bei netcup. Providerwechsel einer .de-Domain mit der AuthInfo des Kunden; die AuthInfo gilt höchstens 30 Tage. Vorher die komplette DNS-Zone aus der Bestandsaufnahme im Projekt anlegen (MX, SPF, DKIM, DMARC, Bestätigungs-Einträge), sonst fällt die E-Mail des Kunden aus.

**Ablauf (automatisch):** Kunde gibt die Domain im Portal an, mit Auftrag. Der Umzugs-Agent macht die DNS-Bestandsaufnahme, sichert die alte Seite unter `data/umzug/` und plant Weiterleitungen. Die Abnahme passiert vorher an der Vorschau. Beim Livegang geht die Anleitung durch die Freigabe an den Kunden. Alle 15 Minuten wird geprüft, ob die Domain auf `SERVER_IP` zeigt. Danach: Hinweis zur Kündigung des alten Webhostings (durch die Freigabe). Nach 7 Tagen ohne Umstellung kommt eine Push-Meldung: Kunde anrufen.

## Notfall: Server ist weg

Runbook `docs/runbook-server.md`, Teil A (neu aufsetzen) und B (aus IONOS wiederherstellen). Ziel: in unter 4 Stunden wieder da, Zusage an Kunden: ein Werktag.

## Sicherheitsregeln

- Geheimnisse nur in der `.env` auf dem Server (Rechte 600) und in Bitwarden, nie im Repo und nie im Chat.
- Von außen offen sind nur die Ports 22 (SSH, nur mit Schlüssel), 80 und 443. Datenbank und n8n-Netz sind getrennt: n8n erreicht nur `/api/v1`.
- Echte Kundendaten erst nach: Gründung, AV-Verträgen, Zwei-Faktor-Anmeldung, externer Sicherheitsprüfung.
- `AKQUISE_FREIGESCHALTET=ja` erst nach dem Notartermin und dem Bescheid zum Gründungszuschuss.
