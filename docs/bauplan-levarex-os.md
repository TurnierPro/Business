# Bauplan Levarex OS und Kundenportal „Mein Levarex“

Stand 21.11.2026 · zur Freigabe durch Maximilian Steiner und Daniel Lück

## 1. Ausgangslage und Entscheidungen vom 21.11.2026

Maximilian hat festgelegt:

| Nr. | Entscheidung | Wirkung |
|---|---|---|
| E1 | Das CRM wird **dieser Code (bisher „Nexova OS“)**, umbenannt auf Levarex. | Neuer Name intern: **Levarex OS**. Ersetzt die Festlegung „eigenes Levarex OS entfällt“. |
| E2 | **Website und Kundenportal werden getrennt.** Die Website (Lovable-Projekt) enthält nur einen Link „Kundenportal“. | Portal läuft in Levarex OS unter eigener Adresse, z. B. `portal.levarex-consulting.de`. Portal- und Admin-Teile im Lovable-Projekt werden stillgelegt. |
| E3 | **Kunden lesen im Portal Unterlagen und sehen den Stand.** Sie haben keinen Zugriff auf das CRM. | Das Portal ist standardmäßig ein Lese-Zugang. Ausnahmen klärt Abschnitt 6. |
| E4 | **n8n läuft bei Hostinger** und greift über eine Schnittstelle auf Levarex OS zu. | Ersetzt die Festlegung „n8n entfällt“. n8n darf nur Entwürfe anlegen, nie selbst versenden. |
| E5 | Erst Bauplan, dann bauen. | Dieses Dokument. Gebaut wird erst nach Freigabe. |

**Folge für die Projektdokumente.** Diese Dokumente widersprechen den Entscheidungen und müssen nachgezogen werden. Das macht die Teamleitung nach eurer Zustimmung:

- Dok. 26 Architektur;
- Dok. 45 IT-Landschaft;
- Dok. 37 AV-Kette und Unterauftragsverarbeiter (neu: Hostinger; Lovable nur noch für die Website);
- Dok. 40 Notfallhandbuch;
- Dok. 43 Pflichtkosten;
- das Gründungs-Cockpit.

**Daniel muss zustimmen.** Es sind Gesellschafter-Festlegungen (50/50).

## 2. Zielbild

```
levarex-consulting.de            → Website (Lovable, nur Marketing), Link „Kundenportal“
portal.levarex-consulting.de     → Mein Levarex (Kunden, nur ihr Betrieb, Lese-Zugang)
os.levarex-consulting.de         → Levarex OS (Daniel und Maximilian, mit zweitem Faktor)
n8n.levarex-consulting.de        → n8n (Hostinger), spricht nur mit /api/v1 von Levarex OS
```

**Grundregeln, die bleiben:**
- Nichts verlässt das System ohne Qualitätskontrolle und Freigabe durch Daniel oder Maximilian. Das gilt auch für alles, was n8n anstößt.
- Jeder Fremddienst bekommt einen Adapter mit Simulator.
- Lieferablauf, Abnahmefiktion nach 14 Kalendertagen und „Livegang nur durch Maximilian mit zweitem Faktor“ gelten wie in `levarex-lieferung`.

**Strikte Trennung der Adressen:**
- Die Portal-Adresse liefert nur Portal-Seiten.
- Die OS-Adresse liefert nur interne Seiten.
- Jede Adresse hat eigene Anmelde-Cookies.
- Ein Kunden-Konto kann sich am OS nicht anmelden, ein Team-Konto nicht am Portal.

## 3. Etappen

Alle Etappen außer 9 baut Claude Code in diesem Repository. Dafür fallen keine Lovable-Credits an. Jede Etappe endet mit vier Schritten:
1. Typprüfung und Tests;
2. Sichtprüfung am Handy (360 px) und am Rechner;
3. QS Technik;
4. Bericht an Maximilian.

Größe: S = bis 1 Tag, M = 2–3 Tage, L = 4–6 Tage Bauzeit [Einschätzung].

| Nr. | Etappe | Inhalt | Größe |
|---|---|---|---|
| 1 | **Umbenennung auf Levarex** | Siehe unten. | S |
| 2 | **Baukasten statt Pakete** | Siehe unten. | M |
| 3 | **Verträge** | Siehe unten. | M |
| 4 | **Geld nach Festlegung** | Siehe unten. | M |
| 5 | **Mein Levarex (Kundenportal)** | Siehe unten. | L |
| 6 | **Levarex OS intuitiver** | Siehe unten. | L |
| 7 | **Schnittstelle für n8n** | Siehe unten. | M |
| 8 | **Betrieb bei Hostinger** | Siehe unten. | M |
| 9 | **Website trennen (Lovable)** | Siehe unten. | S |

**Etappe 1: Umbenennung auf Levarex**
- Firma Levarex Consulting GmbH i. G., Sitz Stutensee, Domain levarex-consulting.de.
- Logo aus den Originaldateien (`Levarex_Logos.zip`, im Lovable-Projekt liegen sie unter `public/marke/levarex-*.svg`). Nichts nachzeichnen.
- „Maximilian“ statt „Max“ in allen Texten.
- Pflichtangaben § 35a.
- Farben und Schriften bleiben (Stein und Messing).

**Etappe 2: Baukasten statt Pakete**
- **Katalog nach `levarex-baukasten`:**
  - Vorab: Online-Check (kostenlos) und Prozess-Check (690 €, wird bei Auftrag angerechnet).
  - Webauftritt: Kompakt und Professional.
  - Module: Personal & Bewerbung, Marketing & Sichtbarkeit, Kundenmanagement mit Pilotpreis.
  - Zusatzmodule.
- **Angebot:** genau zwei Zahlen (einmalig, monatlich), dazu „Gesamt 24 Monate“ und „Ø pro Monat“. Die sechs Ausbaustufen sind als Vorlagen auswählbar.
- **Alte Werte raus:** Pakete S/M/L, KI-Module und Jobbörsen werden entfernt.

**Etappe 3: Verträge**
- Rahmenvertrag als Deckblatt.
- Je Baustein ein Leistungsschein Erstellung und ein Leistungsschein Betrieb, als PDF im Levarex-Design.
- Laufzeit 24 Monate ab Livegang, Kündigung 3 Monate vor Ende, Änderungen 95 €/h.
- **Braucht die Texte aus Dok. 21 (Vertragswerk).**

**Etappe 4: Geld nach Festlegung**
- Stripe fliegt raus.
- Rechnungen und E-Rechnung über Lexware Office (Adapter mit Simulator).
- Zahlungsplan 50 % bei Unterschrift (fällig 7 Tage nach Vertragsschluss) und 50 % beim Livegang.
- Monatsbeitrag per SEPA über Qonto mit Vorabankündigung 5 Kalendertage. Bis Gläubiger-ID und Einzug stehen: Überweisung.
- Mahnwesen bleibt, mit Freigabe.

**Etappe 5: Mein Levarex (Kundenportal)**
- **Eigene Adresse und eigenes Layout**, hell oder dunkel nach Marke, für das Handy gebaut.
- **Anmeldung per E-Mail-Code statt geheimem Link.** Mehrere Personen je Betrieb sind möglich.
- **Inhalt:**
  - Stand als Zeitstrahl je Baustein;
  - nächster Schritt;
  - Unterlagen: Angebot, Verträge, Rechnungen, Protokolle, Monatsberichte, eingefroren wie versendet;
  - Ansprechpartner.
- **Nur Lesen.** Ausnahmen nach Abschnitt 6.
- Konzepte aus dem Lovable-Portal übernehmen: Startcode-Brief, Zeitstrahl, Servicezeiten mit BW-Feiertagen, Glocke.

**Etappe 6: Levarex OS intuitiver**
- **Lieferablauf nach `levarex-lieferung`:**
  - Mitwirkungsliste;
  - Inhalte-Eingang binnen 2 Werktagen bestätigen;
  - Lieferfrist 3 bzw. 6 Wochen;
  - Prüfliste vor Bereitstellung;
  - Livegang nur Maximilian mit zweitem Faktor.
- **Stunden je Baustein messen.**
- **Vertrieb nach `levarex-vertrieb`:** Besuchsplanung, Messbogen und Gate, Nachfassen nach 7 und 14 Tagen.
- **Handy-Ansicht für Daniel vor Ort.**
- **Was konkret stört, klären wir vorher (Abschnitt 6, Frage F4).**

**Etappe 7: Schnittstelle für n8n**
- `/api/v1` vollständig:
  - Betriebe, Kontakte, Aktivitäten und Nachrichten lesen und anlegen;
  - Projekte und Dokumente lesen;
  - Entwürfe in den Postausgang legen.
- Schlüssel mit einzelnen Rechten und Mengenbegrenzung.
- Ausgehende Webhooks bei Ereignissen, mit HMAC-Signatur: neuer Lead, Angebot angenommen, Abnahme, Rechnung fällig.
- OpenAPI-Beschreibung, damit n8n die Felder kennt.
- Jeder Zugriff wird protokolliert.

**Etappe 8: Betrieb bei Hostinger**
- **Ein Server (VPS) mit:**
  - Levarex OS;
  - PostgreSQL;
  - n8n;
  - Caddy für die Zertifikate.
- **Absicherung:**
  - tägliche verschlüsselte Sicherung bei IONOS Object Storage für 30 Tage, mit Restore-Test;
  - Überwachung mit Better Stack;
  - Notfallhandbuch nachziehen;
  - externer Sicherheitstest vor dem ersten Kunden.

**Etappe 9: Website trennen (Lovable)**
- Ein Lovable-Auftrag: Portal- und Admin-Routen aus dem Website-Projekt entfernen, Link „Kundenportal“ in Kopf und Fuß.
- Nichts veröffentlichen ohne Freigabe von Maximilian.
- Der bisherige Portal-Code bleibt in der Git-Historie als Archiv.

**Reihenfolge:** 1 → 2 → 3 → 4 → 5 → 7 → 6 → 8 → 9.
- Etappe 6 folgt nach Etappe 7, weil eure Rückmeldung zu „intuitiver“ (F4) Zeit braucht.
- Etappe 9 kommt zuletzt, damit die Website erst dann auf das Portal verlinkt, wenn es läuft.

## 4. Was wegfällt oder umgestellt wird

| Bisher in Nexova OS | Künftig |
|---|---|
| Stripe (Anzahlung, Abo) | Lexware Office und Qonto-SEPA |
| Anthropic direkt (KI) | Amazon Bedrock Frankfurt (Festlegung); keine Zusage „KI in der EU“ |
| Pakete S/M/L, KI-Module | Baukasten (Etappe 2) |
| Portal über geheimen Link | Anmeldung per E-Mail-Code (Etappe 5) |
| Akquise-Brief als Erstkontakt | bleibt, dazu Besuchsplanung vor Ort |
| Hosting offen | Hostinger (Etappe 8) |

Postausgang, Qualitätskontrolle, Nachrichten-Tabelle, Datenschutz-Werkzeuge, PDF-Prüfung und Mail-Konnektoren bleiben. Für Systemmails ist Resend festgelegt, für die Postfächer netcup per SMTP.

## 5. Datenschutz und Recht

Wer muss was tun:

| Was | Wer |
|---|---|
| AV-Verträge mit Hostinger und gegebenenfalls Amazon Web Services (Bedrock) abschließen | Gründer |
| Hostinger und n8n ins Verarbeitungsverzeichnis und in die Unterauftragsverarbeiter-Liste (Dok. 37 Anlage 2) eintragen | Teamleitung, Freigabe durch Gründer |
| Betriebe bei neuen Unterauftragsverarbeitern vorab informieren (14 Tage Widerspruch); vor dem ersten Kunden entfällt das | Gründer |
| Rechenzentrumsstandort bei Hostinger auf Deutschland oder EU festlegen | Maximilian |
| Prüfen, ob ein Standort in Deutschland angeboten wird [A] | Maximilian |
| n8n bekommt nur die Rechte, die ein Ablauf braucht; kein Versand an der Freigabe vorbei | wird so gebaut |
| Löschfristen, Auskunft und Löschung decken auch die Portal-Konten ab | wird so gebaut |

## 6. Offene Fragen an Maximilian und Daniel

| Nr. | Frage | Warum |
|---|---|---|
| F1 | **Unterschrift der Leistungsscheine:** Das Vertragswerk sieht die Unterschrift „auf dem Tablet im Kundenportal“ vor. Bleibt das so (dann darf der Kunde im Portal unterschreiben), oder unterschreibt er beim Termin auf Daniels Tablet in Levarex OS? | Widerspricht sonst „nur lesen“. |
| F2 | **Inhalte und Abnahme:** Sollen Kunden Fotos und Texte im Portal hochladen und die Abnahme dort erklären? Oder läuft beides per Mail, und ihr tragt es in Levarex OS ein? | Die Abnahmefiktion funktioniert auch per Mail, im Portal ist sie aber leichter nachweisbar. |
| F3 | **Welche n8n-Abläufe zuerst?** Vorschläge: Postfach (netcup) → Nachrichten, Lexware-Zahlungseingang → Rechnung bezahlt, Kalender → Termine. | Bestimmt die Rechte und Ereignisse in Etappe 7. |
| F4 | **„Intuitiver“:** Welche zwei oder drei Stellen nerven heute am meisten? Gern als Bildschirmfoto mit Stichwort. | Ohne das baue ich nach Vermutung. |
| F5 | **Hostinger-Tarif:** VPS (wir betreiben alles selbst) oder fertiges n8n-Hosting bei Hostinger und Levarex OS woanders? | Empfehlung: ein VPS für beides. Weniger Teile, aber Updates und Sicherung liegen bei Maximilian (Bus-Faktor). |
| F6 | **Kosten:** Der Server ersetzt Lovable Business und Supabase Pro nur teilweise, die Website bleibt in Lovable. Die neuen Monatskosten müssen in Dok. 43 (Pflichtkosten 824 €/Monat). | Zahlen im Business Case ändern nur die Gründer. |
| F7 | **Material:** Dok. 21 (Vertragswerk), Dok. 20 (Leistungskatalog), Dok. 26 und 28, die Logo-Zip und eure echten Kontaktdaten. | Kann ich aus dem Claude-Projekt nicht selbst lesen. |

## 7. Nächster Schritt

Nach eurer Freigabe starte ich mit den Etappen 1 und 2. Sie hängen an keiner offenen Frage. F1 bis F7 brauche ich bis zum Start von Etappe 3.
