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
