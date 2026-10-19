# Betriebshandbuch Stelax OS

Was jede Meldung bedeutet und was du tust. Meldungen erscheinen unter **System → Meldungen** und, mit `NTFY_URL`, als Push auf dem Handy.

| Meldung | Bedeutung | Was tun |
|---|---|---|
| Backup erstellt, nur lokal | Backup liegt nur auf dem Server | `BACKUP_ZIEL` (Storage Box) einrichten. Bis dahin ist ein Serverausfall ein Datenverlust. |
| Probe-Rücksicherung fehlgeschlagen | Das letzte Backup ließ sich nicht einspielen | Sofort prüfen. System → Zeitplan → Backup „Jetzt“, dann Rücksicherung „Jetzt“. Klappt es nicht: Logs in Coolify ansehen. |
| Seite(n) nicht erreichbar | Eine Kunden-Website antwortet nicht | Coolify öffnen: läuft der Dienst? DNS beim Kunden geändert? SSL abgelaufen? |
| Tagesbericht: bitte prüfen | Fehlgeschlagene Jobs oder Warnungen in den letzten 24 h | System → Hintergrund-Jobs, Fehlertext lesen, „Wiederholen“. |
| Job mit Status Fehler | Ein Ablauf ist nach 3 Versuchen gescheitert | Fehlertext lesen. Häufig: fehlende Zugangsdaten eines Dienstes oder Dienst nicht erreichbar. |

## Feste Zeiten (deutsche Zeit)

| Wann | Was |
|---|---|
| Montag 6 Uhr | Wochenlauf: neue Leads |
| täglich 2 Uhr | Backup, 30 Tage Aufbewahrung |
| täglich 3 Uhr | Aufräumen: Demos nach 60 Tagen, Leads ohne Reaktion nach 6 Monaten |
| Sonntag 4 Uhr | Probe-Rücksicherung des neuesten Backups |
| täglich 7 Uhr | Tagesbericht |
| alle 10 Minuten | Erreichbarkeit der Live-Seiten |

## Kunden-Domains (Umzug bestehender Websites)

Stelax OS liefert Kunden-Websites unter ihrer eigenen Domain aus: Jeder Host, der nicht Stelax OS selbst ist (`BASE_URL`, `STELAX_HOSTS`), bekommt die passende Kunden-Website. `www.` leitet auf die Domain ohne `www` um, alte Adressen der früheren Website per 301 auf die neuen Seiten.

**Was einmal eingerichtet werden muss (vor dem ersten Umzug testen):**

1. `SERVER_IP` in Coolify setzen (öffentliche IPv4 des Servers). Diese Adresse steht in der Anleitung für den Kunden.
2. Zertifikate automatisch: Vor die App gehört ein Proxy mit „on-demand TLS“, der vor jedem neuen Zertifikat fragt, ob die Domain zu uns gehört. Mit Caddy:

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
stelax.de, os.stelax.de {
  reverse_proxy app:3000
}
```

   `/api/tls-erlaubt?domain=…` antwortet nur für Domains von Live-Projekten mit 200. So kann niemand Zertifikate für fremde Domains auslösen. Alternative ohne Caddy: jede Kunden-Domain in Coolify bei der App eintragen (Traefik holt dann das Zertifikat); das ist ein Handgriff je Kunde.
3. Für Weg B (Domain zu uns holen): Registrar-Konto, z. B. Hetzner Robot. Providerwechsel einer .de-Domain mit der AuthInfo des Kunden; die AuthInfo gilt höchstens 30 Tage. Vorher die komplette DNS-Zone aus der Bestandsaufnahme im Projekt anlegen (MX, SPF, DKIM, DMARC, Bestätigungs-Einträge), sonst fällt die E-Mail des Kunden aus.

**Ablauf (automatisch):** Kunde gibt die Domain im Portal an, mit Auftrag. Der Umzugs-Agent macht die DNS-Bestandsaufnahme, sichert die alte Seite unter `data/umzug/` und plant Weiterleitungen. Beim Livegang geht die Anleitung durch die Freigabe an den Kunden. Alle 15 Minuten wird geprüft, ob die Domain auf `SERVER_IP` zeigt. Danach: Hinweis zur Kündigung des alten Webhostings (durch die Freigabe), dann Bitte um Abnahme. Nach 7 Tagen ohne Umstellung kommt eine Push-Meldung: Kunde anrufen.

## Notfall: Server ist weg

1. Neuen Server bei Hetzner anlegen, Coolify installieren (Modul 2 und 3).
2. Repo verbinden, Umgebungsvariablen aus dem Passwortmanager eintragen.
3. Neuestes Backup von der Storage Box holen und einspielen:
   `pg_restore --clean --no-owner --dbname="$DATABASE_URL" stelax-JJJJ-MM-TT-HH-MM.dump`
4. Ordner `/data/sites` und `/data/uploads` von der Storage Box zurückkopieren.
5. Anmelden, unter System prüfen, ob alles grün ist. Dauer notieren (Ziel: unter 2 Stunden).

## Sicherheitsregeln

- Geheimnisse nur in Coolify und im Passwortmanager, nie im Repo.
- Echte Kundendaten erst nach: Gründung, AV-Verträgen, Zwei-Faktor-Anmeldung, externer Sicherheitsprüfung.
- `AKQUISE_FREIGESCHALTET=ja` erst nach dem Notartermin und dem Bescheid zum Gründungszuschuss.
