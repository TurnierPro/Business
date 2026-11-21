# Bauplan Levarex OS und Kundenportal „Mein Levarex“

Stand 21.11.2026 · zur Freigabe durch Maximilian Steiner und Daniel Lück

## 1. Ausgangslage

Maximilian hat am 21.11.2026 entschieden. **Wirksam wird das erst mit Zustimmung von Daniel** (Gesellschafter-Festlegung, 50/50).

| Entscheidung | Wirkung | Zustimmung Daniel |
|---|---|---|
| Das CRM wird dieser Code (bisher „Nexova OS“), umbenannt auf **Levarex OS**. | Hebt die Festlegung „eigenes Levarex OS entfällt, Code nicht weiterverwenden“ auf. | offen |
| **Website und Kundenportal werden getrennt.** Auf der Website steht nur ein Link „Kundenportal“. | Das Portal läuft in Levarex OS. **Portal und Admin-Center aus den Lovable-Etappen 1–11f werden damit aufgegeben**, ebenso die Arbeit daran und die offenen Abnahmen dort. | offen |
| **Kunden lesen im Portal Unterlagen und sehen den Stand**, ohne Zugriff auf das CRM. | Das Portal ist ein Lese-Zugang. Ausnahmen klären F1 und F2. | offen |
| **n8n läuft bei Hostinger** und greift über die Schnittstelle zu. | Hebt die Festlegung „n8n entfällt“ auf. n8n legt nur Entwürfe an und versendet nie selbst. | offen |
| Erst Bauplan, dann bauen. | Dieses Dokument. | offen |

**Dokumente, die nach eurer Zustimmung nachgezogen werden.** Das macht die Teamleitung, Freigabe durch die Gründer:

| Dok. | Was nachgezogen wird |
|---|---|
| 20 | Service-Level, Kundenportal |
| 21 | Unterschrift im Portal (siehe F1) |
| 26 | Architektur |
| 28 | Portal-Bauplan, wird hinfällig |
| 37 | AV-Kette und Unterauftragsverarbeiter |
| 40 | Notfallhandbuch |
| 43 | Kosten |
| 45 | IT-Landschaft |

Außerdem das Gründungs-Cockpit und die Skills `levarex-lieferung` und `levarex-qs-technik`. Dort steht noch „Entfallen: n8n, eigenes Levarex OS“.

## 2. Abgrenzung

- **Levarex OS ist nur zweierlei:**
  - unser internes CRM für Vertrieb, Lieferung, Geld und Postausgang;
  - das Kundenportal „Mein Levarex“.
- **Kunden-Websites** werden weiter wie festgelegt gebaut und in Lovable gehostet. Levarex OS liefert heute Kunden-Websites unter fremden Domains aus (`middleware.ts` → `/kunde-seite/<host>`). **Diese Funktion wird abgeschaltet**, außer ihr entscheidet anders (F8).
- **Das verkaufte Modul Kundenmanagement** (Terminbuchung, Erinnerungen, Telefonassistent der Betriebe) ist nicht Teil von Levarex OS. Wo es läuft, entscheidet ihr (F8). Bis dahin gilt die bisherige Planung mit Lovable und Supabase.

## 3. Zielbild

```
levarex-consulting.de            → Website (Lovable, nur Marketing), Link „Kundenportal“
portal.levarex-consulting.de     → Mein Levarex (Kunden, nur ihr Betrieb, Lese-Zugang)
os.levarex-consulting.de         → Levarex OS (Daniel und Maximilian, mit zweitem Faktor)
n8n.levarex-consulting.de        → n8n (Hostinger), spricht nur mit /api/v1 von Levarex OS
```

**Grundregeln, die bleiben:**
- Nichts verlässt das System ohne Qualitätskontrolle und Freigabe durch Daniel oder Maximilian. Das gilt auch für alles, was n8n anstößt.
- Jeder Fremddienst bekommt einen Adapter mit Simulator.
- Abnahmefiktion nach 14 Kalendertagen.
- Livegang nur durch Maximilian mit zweitem Faktor.
- Den zweiten Faktor (TOTP) für Team-Konten gibt es schon.

**Strikte Trennung (gilt als Abnahmekriterium):**
- **Eigene Cookies:** Jede Adresse hat ihr eigenes Anmelde-Cookie (`lvx_portal`, `lvx_os`). Ein Portal-Cookie wird am OS abgelehnt und umgekehrt.
- **Eigene Seiten:** Die Portal-Adresse liefert nur Portal-Seiten, die OS-Adresse nur interne Seiten.
- **Trennung je Betrieb ohne Row-Level Security:** Mit eigenem PostgreSQL statt Supabase gibt es keine RLS. Deshalb filtert jede Portal-Abfrage serverseitig auf die `betriebId` der Sitzung, über eine gemeinsame Funktion und nie über einen Parameter aus der Adresse.
- **Nachweis:** zwei Testkonten verschiedener Betriebe als Tests in `tests/sicherheit.test.ts`. Konto A darf keine Seite, kein Dokument und keine Rechnung von Betrieb B sehen.

## 4. Etappen

Alle Etappen außer 9 baut Claude Code in diesem Repository. Dafür fallen keine Lovable-Credits an. Jede Etappe endet mit vier Schritten:
1. Typprüfung und Tests;
2. Sichtprüfung am Handy (360 px) und am Rechner;
3. QS Technik;
4. Bericht an Maximilian.

Größe in Bautagen [Einschätzung]: S bis 1, M 2–3, L 4–6. **Summe etwa 25–40 Bautage [Einschätzung].**

| Nr. | Etappe | Inhalt | Größe |
|---|---|---|---|
| 1 | **Umbenennung und Aufräumen** | Siehe unten. | S |
| 2 | **Baukasten statt Pakete** | Siehe unten. | M |
| 3 | **Verträge** | Siehe unten. | M |
| 4 | **Geld nach Festlegung** | Siehe unten. | M |
| 5 | **Mein Levarex (Kundenportal)** | Siehe unten. | L |
| 6 | **Levarex OS intuitiver** | Siehe unten. | L |
| 7 | **Schnittstelle für n8n** | Siehe unten. | M |
| 8 | **Betrieb bei Hostinger** | Siehe unten. | M |
| 9 | **Website trennen (Lovable)** | Siehe unten. | S |

**Etappe 1: Umbenennung und Aufräumen**
- **Firma und Marke:**
  - Levarex Consulting GmbH i. G., Sitz Stutensee, levarex-consulting.de.
  - `brand/tokens.json` anpassen (Name, Sitz Karlsruhe → Stutensee, Kontakt).
  - Pflichtangaben § 35a.
  - „Maximilian“ statt „Maximilian“, auch in `portal/k/[token]/page.tsx`.
  - Farben und Schriften bleiben.
- **Logo:** aus den Originaldateien `Levarex_Logos.zip`. Die Kopien im Lovable-Projekt (`public/marke/`) erst nach Abgleich mit der Zip verwenden. Nichts nachzeichnen.
- **Technische Kennungen:** Cookies `nexova_*` → `lvx_*`, `NEXOVA_HOSTS` → `LEVAREX_HOSTS`, API-Präfix `nxv_` → `lvx_`.
- **Aufräumen:** Hinweise auf Hetzner und Coolify in `dienste.ts`, `docker-compose.yml` und `.env.example` entfernen.

**Etappe 2: Baukasten statt Pakete**
- **Katalog nach `levarex-baukasten`:**
  - Online-Check kostenlos.
  - Prozess-Check 690 €, angerechnet bei Auftrag binnen 60 Tagen.
  - Webauftritt Kompakt und Professional.
  - Module Personal & Bewerbung und Marketing & Sichtbarkeit.
  - Kundenmanagement, mit Pilotpreis nur für die ersten zwei Betriebe.
  - Zusatzmodule.
- **Angebot:** zwei Zahlen (einmalig, monatlich), dazu „Gesamt 24 Monate“ und „Ø pro Monat“. Die sechs Ausbaustufen als Vorlagen.
- **Alte Werte raus:** Pakete S/M/L, KI-Module, Jobbörsen.

**Etappe 3: Verträge**
- Rahmenvertrag als Deckblatt.
- Je Baustein ein Leistungsschein Erstellung und ein Leistungsschein Betrieb, als PDF im Levarex-Design.
- Laufzeit 24 Monate ab Livegang, danach je 12 Monate. Kündigung 3 Monate vor Ende in Textform. Änderungen 95 €/h nach Freigabe in Textform.
- **Braucht die Texte aus Dok. 21.**

**Etappe 4: Geld nach Festlegung**
- **Stripe raus:** Adapter, Webhook und Simulator werden entfernt.
- **Lexware Office:** Rechnungen und E-Rechnung (Adapter mit Simulator).
- **Zahlung:** 50 % bei Unterschrift (fällig 7 Tage nach Vertragsschluss, nicht vor Arbeitsbeginn), 50 % beim Livegang nach der Abnahme.
- **Monatsbeitrag:** per SEPA über Qonto mit Vorabankündigung 5 Kalendertage. Bis Gläubiger-ID und Einzug stehen: Überweisung.
- **Eingehende Meldungen** von Lexware und Qonto prüfen die Signatur, mit Test in `tests/sicherheit.test.ts`.

**Etappe 5: Mein Levarex (Kundenportal)**
- **Adresse und Layout:** eigene Adresse und eigenes Layout, für das Handy gebaut.
- **Anmeldung per E-Mail-Code statt geheimem Link:**
  - Code höchstens 10 Minuten gültig und nur einmal verwendbar.
  - Mengenbegrenzung je Adresse und je Netz.
  - Sitzungsdauer festgelegt.
  - Die Code-Mail läuft über Resend (USA) und enthält nur den Code.
- **Mehrere Personen je Betrieb.** Das sind neue personenbezogene Daten. Deshalb werden `LOESCHFRISTEN`, `datenschutz-doku.ts` und Auskunft und Löschung in `ablauf/datenschutz.ts` ergänzt.
- **Inhalt:**
  - Stand als Zeitstrahl je Baustein;
  - nächster Schritt;
  - Unterlagen, eingefroren wie versendet;
  - Rechnungen;
  - Monatsberichte;
  - Ansprechpartner.
- **Nur Lesen.** Ausnahmen nach F1 und F2.
- **Konzepte aus dem Lovable-Portal übernehmen:** Zeitstrahl, Servicezeiten mit BW-Feiertagen, Glocke.
- **Abnahmekriterium:** Trennung je Betrieb wie in Abschnitt 3.

**Etappe 6: Levarex OS intuitiver**
- **Lieferablauf nach `levarex-lieferung`:**
  - Mitwirkungsliste;
  - Inhalte-Eingang binnen 2 Werktagen bestätigen;
  - Lieferfrist 3 bzw. 6 Wochen;
  - Prüfliste vor Bereitstellung.
- **Rollen mit technischer Absicherung:**
  - Livegang und Rechte-Änderungen nur mit Rolle „Technik-Leitung“ (Maximilian) und frischem zweiten Faktor, mit Protokoll.
  - Heute haben alle Konten die Rolle „admin“.
- **Stunden je Baustein messen.**
- **Vertrieb nach `levarex-vertrieb`:** Besuchsplanung, Messbogen und Gate, Nachfassen nach 7 und 14 Tagen.
- **Handy-Ansicht für Daniel vor Ort.**
- **Vorher klären:** was konkret stört (F4).

**Etappe 7: Schnittstelle für n8n**
- **Heute vorhanden:** Endpunkte für Betriebe, Projekte, Tickets und Nachrichten, mit gehashten Schlüsseln und vier Rechten.
- **Neue Rechte:**
  - `dokumente:lesen`;
  - `aktivitaeten:schreiben`;
  - `kontakte:schreiben`;
  - `postausgang:entwurf`.

  Es gibt kein Recht zum Versenden.
- **Ein Schlüssel je n8n-Ablauf.** Mengenbegrenzung je Schlüssel, jeder Zugriff wird protokolliert (bisher nur „zuletzt benutzt“).
- **Ausgehende Webhooks** bei Ereignissen, signiert mit HMAC: neuer Lead, Angebot angenommen, Abnahme, Rechnung fällig.
- **OpenAPI-Beschreibung**, damit n8n die Felder kennt.

**Etappe 8: Betrieb bei Hostinger**
- **Ein VPS (siehe F5):**
  - Levarex OS, PostgreSQL und Caddy;
  - n8n in einem eigenen Container ohne Zugriff auf das Datenbank-Netz und ohne Datenbank-Zugangsdaten, nur über `/api/v1`;
  - Community-Knoten in n8n gesperrt, eigener zweiter Faktor für n8n.
- **Härtung:**
  - Firewall, Anmeldung nur per SSH-Schlüssel;
  - Plan für Updates und Patches.
- **Sicherung:**
  - täglich verschlüsselt bei IONOS Object Storage für 30 Tage;
  - umfasst Datenbank und das Datenverzeichnis (Uploads, PDFs);
  - der Schlüssel liegt in Bitwarden.
- **Bus-Faktor:**
  - Daniel ist Owner im Hostinger-Konto, Notfallzugang in Bitwarden.
  - Runbook „Server neu aufsetzen und aus IONOS wiederherstellen“, das Daniel allein ausführen kann.
  - Restore-Test mit gemessener Dauer, Überwachung mit Better Stack.
  - Zugangsdaten in n8n stehen in der Schlüsselliste von Dok. 40.
- **Freigabe-Sperre:** Erst wenn der Restore-Test bestanden ist und die Service-Level aus Dok. 20 gedeckt sind (99,5 %, Stufe 1 Reaktion 2 h und Lösung 8 h, Wiederherstellung 1 Werktag), kommt ein Kunde ins Portal.
- **Externer Sicherheitstest:** vor dem ersten Kunden im Portal. Das ist bewusst strenger als die bisherige Festlegung („vor dem ersten Kundenmanagement-Piloten“). Kosten und Termin legt ihr fest.

**Etappe 9: Website trennen (Lovable)**
- **Ein Lovable-Auftrag:**
  - Portal- und Admin-Routen aus dem Website-Projekt entfernen.
  - Link „Kundenportal“ in Kopf und Fuß.
  - Das Anfrageformular der Website schickt an `POST /api/v1/betriebe` (Recht `leads`), mit Mengenbegrenzung.
- **Vorher und nachher:** Credits vorher schätzen, `get_diff` danach lesen. Nichts veröffentlichen ohne Freigabe von Maximilian.
- **Archiv:** Der bisherige Portal-Code bleibt in der Git-Historie.

**Reihenfolge:** 1 → 2 → 3 → 4 → 5 → 7 → 6 → 8 → 9.

## 5. Zeitplan

| Termin | Was |
|---|---|
| 15.12.2026 | Beurkundung |
| bis 23.12.2026 | Notfallhandbuch einsatzbereit (Dok. 40). Bis dahin nur Runbook und Eintrag in Dok. 40. Der Server wird erst mit Etappe 8 Teil des Notfallhandbuchs; vorher kommt kein Kunde ins Portal |
| ab Januar 2027 | Verkauf (Beweisphase: nur Webauftritt) |

Bis Januar 2027 müssen die Etappen 1–4 stehen (Angebot, Verträge, Rechnungen).

**Übergang:** Läuft das Portal im Januar noch nicht, gehen Angebot, Verträge und Unterlagen als PDF per Mail über den Postausgang, mit Freigabe.

## 6. Was wegfällt oder umgestellt wird

| Heute in Nexova OS | Künftig |
|---|---|
| Stripe (Anzahlung, Abo) | Lexware Office und Qonto-SEPA |
| Anthropic direkt (KI) | Amazon Bedrock Frankfurt; keine Zusage „KI in der EU“ |
| Pakete S/M/L, KI-Module | Baukasten (Etappe 2) |
| Portal über geheimen Link | Anmeldung per E-Mail-Code (Etappe 5) |
| Kunden-Websites über `/kunde-seite` | abgeschaltet, Kunden-Websites in Lovable (F8) |
| Docker-Datei „für Coolify“, Hetzner-Hinweise | Hostinger (Etappe 1 und 8) |
| E-Signatur Docuseal „auf Hetzner“ | entfällt bis zur Entscheidung F1 (Unterschrift im Portal oder auf dem Tablet) |
| Transkription Whisper „auf Hetzner“ | entfällt; Gesprächsprotokoll von Hand, später über einen Dienst mit AV-Vertrag und Standort EU [offen, Gründer] |
| Push ntfy „auf Hetzner“ | Better Stack für Warnungen; Tagesbericht in Levarex OS (Startseite) statt Push; ntfy entfällt |
| DNS-Prüfung mit `SERVER_IP` des Hetzner-Servers | bleibt für den Domain-Umzug der Kunden, Zieladresse wird die von Lovable/Cloudflare (F8) |
| Briefdienst | Simulator bis zur Auswahl eines Anbieters |
| WhatsApp (Meta), Mail über Microsoft 365 und Google Workspace | Simulator bis zur Freigabe; festgelegt sind Resend für Systemmails und netcup für die Postfächer |

**Bleibt unverändert:** Postausgang, Qualitätskontrolle, Nachrichten-Tabelle, Datenschutz-Werkzeuge, PDF-Prüfung, zweiter Faktor.

## 7. Datenschutz und Recht

| Was | Wer |
|---|---|
| Hostinger: AV-Vertrag, Vertragspartner, Rechenzentrumsstandort, Unterauftragnehmer, Fernzugriff aus Drittländern prüfen [Annahme, nicht geprüft] | Maximilian |
| Hostinger in Verarbeitungsverzeichnis und Unterauftragsverarbeiter-Liste (Dok. 37 Anlage 2) eintragen | Teamleitung, Freigabe Gründer |
| n8n wird selbst betrieben und bekommt keinen eigenen Eintrag. Jeder Dienst, den ein n8n-Ablauf anspricht (z. B. netcup-Postfach, Lexware), wird einzeln eingetragen | Teamleitung |
| Resend verarbeitet in den USA (Drittland), wie in Dok. 37; Mails enthalten nur Code oder Link | bleibt |
| Amazon Web Services (Bedrock Frankfurt): AV-Vertrag | Gründer |
| Betriebe bei neuen Unterauftragsverarbeitern vorab informieren (14 Tage Widerspruch); vor dem ersten Kunden genügt die richtige Liste im Vertrag | Gründer |
| Muss die geänderte Liste (Hostinger statt Supabase/Lovable) in Dok. 37 und im AV-Vertrag mit den Betrieben neu gefasst werden, bevor der erste Vertrag geschlossen wird? | Anwalt (nbs partners) |

## 8. Offene Fragen an Maximilian und Daniel

| Nr. | Frage | Warum |
|---|---|---|
| F1 | **Unterschrift der Leistungsscheine:** Das Vertragswerk sieht sie „auf dem Tablet im Kundenportal“ vor. Bleibt das so (dann ist das eine Ausnahme vom Lese-Zugang), oder unterschreibt der Kunde beim Termin auf Daniels Tablet in Levarex OS? | Widerspricht sonst „nur lesen“; bestimmt auch, ob eine E-Signatur nötig ist. | **Beantwortet 21.11.2026:** Unterschrift auf Daniels Tablet in Levarex OS (Seite in Portal-Optik, je Dokument eigene Unterschrift); die unterschriebenen Unterlagen liegen danach im Portal zum Lesen. Umgesetzt in Etappe 3.
| F2 | **Inhalte und Abnahme:** Sollen Kunden Fotos und Texte im Portal hochladen und die Abnahme dort erklären? Oder läuft beides per Mail, und ihr tragt es ein? | Die Abnahmefiktion funktioniert auch per Mail, im Portal ist sie leichter nachweisbar. |
| F3 | **Welche n8n-Abläufe zuerst?** Vorschläge: Postfach (netcup) → Nachrichten, Lexware-Zahlungseingang → Rechnung bezahlt, Kalender → Termine. | Bestimmt Rechte und Ereignisse in Etappe 7. |
| F4 | **„Intuitiver“:** Welche zwei oder drei Stellen nerven heute am meisten? Gern als Bildschirmfoto mit Stichwort. | Sonst baue ich nach Vermutung. |
| F5 | **Hostinger-Tarif:** ein VPS für alles (Empfehlung) oder fertiges n8n-Hosting und Levarex OS woanders? | Weniger Teile, aber Updates und Sicherung liegen bei Maximilian (Bus-Faktor, siehe Etappe 8). |
| F6 | **Kosten:** Wie hoch sind die Monatskosten für Hostinger, den Sicherheitstest und einen technischen Dienstleister auf Abruf? Werden Supabase Pro und Lovable Business gekündigt oder verkleinert? Lovable Business mit AV-Vertrag braucht ihr nur, wenn das Website-Formular personenbezogene Daten verarbeitet; künftig gehen die Daten an Levarex OS. | Laut Dok. 32 liegen die Pflichtkosten bei 824 €/Monat. Im Plan stehen 500 €/Monat für Software; die Werkzeugliste Dok. 45 liegt ab Mai 2027 bei ≈ 570 €/Monat. Der Sicherheitstest (2.000–5.000 €) steht nicht im Plan. Neue Monatskosten über 150 € brauchen die Zustimmung beider Geschäftsführer. Zahlen im Business Case ändern nur die Gründer. |
| F7 | **Material:** Dok. 20, 21, 26, 28, 37, 40, die Logo-Zip und eure echten Kontaktdaten. | Kann ich aus dem Claude-Projekt nicht selbst lesen. |
| F8 | **Kunden-Websites und Kundenmanagement:** Bleibt beides wie geplant in Lovable/Supabase? | Bestimmt, ob die Funktion `kunde-seite` und der Domain-Umzug in Levarex OS bleiben. |

## 9. Nächster Schritt

Nach eurer Zustimmung (Abschnitt 1) starte ich mit den Etappen 1 und 2. Sie hängen an keiner offenen Frage. F1 bis F8 brauche ich bis zum Start von Etappe 3.
