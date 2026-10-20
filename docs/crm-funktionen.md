# Stelax OS im Vergleich zu großen CRM- und Branchen-Systemen (Stand 20.10.2026)

Ziel: Stelax OS bildet unsere gesamte Lieferung ab, wird bei uns erprobt und später an Kunden verkauft, die nur noch ihre Schnittstellen anbinden.

Verglichen mit: Salesforce, HubSpot, Pipedrive (Vertrieb), MOCO und awork (Agenturen: Projekt, Zeit, Abrechnung), HERO (Handwerk: Projektmappe, Plantafel, mobile Zeiterfassung). Quellen am Ende.

**Legende:** ✅ vorhanden · 🟡 teilweise · ⏳ geplant

## 1. Kontakte und Firmen

| Funktion | Große Systeme | Stelax OS |
|---|---|---|
| Firmen mit Stammdaten, Status, Quelle | alle | ✅ Betriebe, Quelle nach Art. 14 DSGVO |
| Mehrere Ansprechpartner je Firma, Hauptkontakt | alle | ✅ |
| Zuständige Person, Schlagworte (Tags) | alle | ✅ |
| Doppelte erkennen | HubSpot, Salesforce | ✅ beim Anlegen, Import und über die Schnittstelle |
| Import und Export (CSV) | alle | ✅ |
| Eigene Felder je Firma | Salesforce, HubSpot | ⏳ (für das Produkt) |
| Globale Suche | alle | ✅ Betriebe, Kontakte, Projekte, Rechnungen, Tickets, Dokumente |

## 2. Vertrieb

| Funktion | Große Systeme | Stelax OS |
|---|---|---|
| Pipeline als Spalten (Kanban) mit Wert je Stufe | Pipedrive (Kern), HubSpot | ✅ |
| Prognose aus Wert × Wahrscheinlichkeit | alle | ✅ Wahrscheinlichkeit „Termin“ aus dem Business Case (40 %) |
| Warnung bei liegengebliebenen Chancen („Deal Rotting“) | Pipedrive | ✅ rot markiert, je Stufe eigene Grenze |
| Nächster Schritt je Chance | Pipedrive | ✅ aus den offenen Aufgaben |
| Lead-Recherche und Bewertung | HubSpot (Zusatz) | ✅ Wochenlauf mit Score |
| Angebot mit Bausteinen, live vor Ort | HubSpot Quotes, Salesforce CPQ | ✅ Konfigurator, Bearbeiten vor Versand |
| Online annehmen und bezahlen | HubSpot Payments | ✅ Kundenportal und Stripe |
| E-Mail-Sequenzen und Marketing | HubSpot (Kern) | bewusst nicht: Erstkontakt nur per Brief (§ 7 UWG) |

## 3. Aktivitäten und Aufgaben

| Funktion | Große Systeme | Stelax OS |
|---|---|---|
| Notizen, Anrufe, Termine, Aufgaben je Firma | alle | ✅ Chronik auf der Betriebsseite |
| „Meine Aufgaben“, überfällig, heute, Woche | alle | ✅ Seite Aufgaben, Startseite, Zähler im Menü |
| Automatisch angelegte Nachfass-Aufgaben | HubSpot/Salesforce (Workflows) | ✅ Besuch, Angebot nachfassen, Inhalte nachfassen; schließen sich selbst |
| Kalender-Synchronisation | alle | 🟡 Kalender-Abo (ICS) für iPhone, Outlook, Google; noch nicht in beide Richtungen |
| Anrufe automatisch protokollieren | Salesforce, HubSpot (Telefonie) | ⏳ mit Telefonanlage, nach Klärung § 201 StGB |

## 4. Lieferung und Projekte

| Funktion | Große Systeme | Stelax OS |
|---|---|---|
| Projekt mit Phasen und Checkliste | awork, HERO | ✅ Vorlage je Paket, Stelax OS hakt Ereignisse selbst ab |
| Projektmappe (Dokumente, Fotos, Verlauf) | HERO | ✅ Unterlagen, Archiv-PDFs, Verlauf |
| Zeiterfassung je Projekt und Tätigkeit | MOCO, awork, HERO | ✅ mit Ziel aus dem Business Case |
| Kunden-Einbindung (Portal) | awork Connect, HERO | ✅ Portal: Fortschritt, Unterlagen, Rechnungen, Abnahme, Wünsche, Anfragen |
| Abnahme mit Frist und Protokoll | selten | ✅ inkl. Abnahmefiktion |
| Website-Bau, Prüfung, Livegang, Domain-Umzug | – (eigene Stärke) | ✅ |
| Plantafel und Ressourcen (wer macht wann was) | HERO, awork | ⏳ sobald es eine zweite Person in der Lieferung gibt |
| Urlaub und Abwesenheit | MOCO, HERO | ⏳ |

## 5. Betreuung und Service

| Funktion | Große Systeme | Stelax OS |
|---|---|---|
| Tickets mit Status, Priorität, Zuständigkeit | HubSpot Service, Salesforce Service | ✅ |
| Tickets vom Kunden im Portal | HubSpot Kundenportal | ✅ |
| Kontingent je Vertrag (Retainer) | MOCO | ✅ Minuten je Paket, Anzeige auch für den Kunden |
| Antworten an Kunden | alle | ✅ über den Postausgang mit Freigabe |
| Monatsreport | – | ✅ |
| Überwachung der Websites | – | ✅ alle 10 Minuten |
| Wissensdatenbank für Kunden (FAQ) | HubSpot | ⏳ |

## 6. Finanzen

| Funktion | Große Systeme | Stelax OS |
|---|---|---|
| Rechnungen, Abos, Mahnwesen | MOCO, HERO (mit lexoffice) | ✅ inkl. Mahnstufen, Stripe |
| Ausgaben mit Belegen, Berichte | MOCO (teilweise) | ✅ inkl. Plan-Ist aus dem Business Case |
| Buchhaltung, E-Rechnung | lexoffice, DATEV | 🟡 Export für den Steuerberater, E-Rechnung über lexoffice geplant |

## 7. Auswertungen

| Funktion | Große Systeme | Stelax OS |
|---|---|---|
| Vertriebstrichter und Umwandlungsraten | alle | ✅ |
| Kennzahlen-Dashboard | alle | ✅ Messgrößen aus dem Business Case |
| Eigene Berichte zusammenklicken | Salesforce, HubSpot | ⏳ (für das Produkt; bis dahin CSV-Export) |

## 8. Automatisierung, Schnittstellen, Sicherheit

| Funktion | Große Systeme | Stelax OS |
|---|---|---|
| Automatische Abläufe (Workflows) | Salesforce Flow, HubSpot Workflows | ✅ 18 Agenten mit Zeitplan; alles nach außen nur nach Freigabe |
| Qualitätskontrolle vor dem Versand | – | ✅ eigene Stärke |
| Schnittstelle (REST) mit Schlüsseln und Rechten | alle | ✅ /api/v1: Betriebe lesen/anlegen, Projekte lesen, Tickets anlegen |
| Webhooks nach außen | alle | ⏳ bewusst später, wegen „nichts geht ungeprüft raus“ |
| Marktplatz für Erweiterungen | HubSpot (1.500+), Pipedrive (400+) | über n8n und die Schnittstelle |
| Rollen und Rechte | alle | ✅ Admin, Vertrieb, Technik, Nur lesen |
| Zwei-Faktor-Anmeldung | alle | ✅ TOTP (Authenticator-App) |
| Protokoll aller Änderungen | Salesforce, HubSpot Enterprise | ✅ |
| DSGVO: Auskunft, Löschung, Verzeichnis | teilweise | ✅ |
| Hosting in Deutschland | selten | ✅ Hetzner |

## Vom eigenen Werkzeug zum Produkt

Was für den Verkauf an andere Firmen noch fehlt, in sinnvoller Reihenfolge:

1. **Firmendaten in der Oberfläche statt in `brand/tokens.json`** (Name, Logo, Farben, Absender, Pakete und Preise). Heute ist das Code, später eine Einstellungsseite.
2. **Mandanten:** Jede Kundenfirma bekommt eine eigene Datenbank. Mit einer Instanz je Kunde auf Hetzner ist das am einfachsten und am sichersten (Daten sauber getrennt, AV-Vertrag einfach).
3. **Eigene Felder und eigene Pipeline-Stufen** je Firma.
4. **Adapter-Bibliothek:** Jeder Dienst hat heute schon einen Adapter mit Simulator. Für Kunden kommen DATEV, sevDesk, Google und Microsoft Kalender und Telefonanlagen dazu.
5. **Einrichtungs-Assistent:** Firmendaten, Benutzer, Zugangsdaten der Dienste und ein Probelauf mit Beispieldaten.
6. **Rechtliches für das Produkt:** SaaS-Vertrag, AV-Vertrag, SLA, Preisblatt. Vorher klären: n8n-Lizenz, Haftung für KI-Ausgaben.

## Quellen

- Pipedrive und HubSpot im Vergleich: [eesel.ai](https://www.eesel.ai/blog/pipedrive-vs-hubspot), [automationatlas.io](https://automationatlas.io/guides/pipedrive-vs-hubspot-2026-comparison/), [Capterra](https://capterra.com/compare/132666-152373/Pipedrive-vs-HubSpot-CRM), [hayot-expertise.fr](https://hayot-expertise.fr/en/blog/hubspot-vs-pipedrive-2026-which-crm-is-right-for-your-team)
- HERO: [softguide.de](https://www.softguide.de/programm/hero/vorschau), [Handwerksblatt](https://www.handwerksblatt.de/betriebsfuehrung/handwerkersoftware-fuenf-loesungen-im-kurzportraet), [fuer-gruender.de](https://www.fuer-gruender.de/wissen/unternehmen-fuehren/buchhaltung/handwerker-software-vergleich/hero-test/)
- MOCO und awork: [OMR Reviews Agentursoftware](https://omr.com/de/reviews/contenthub/beste-agentursoftware), [OMR MOCO](https://omr.com/de/reviews/product/moco/all/2), [fastlancer.org](https://www.fastlancer.org/fastlancer-blog/zeiterfassung-agentur/)
