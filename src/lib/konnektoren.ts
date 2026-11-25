import { isNull } from "drizzle-orm";
import { getDb, schema } from "./db";
import { aktiverMailDienst, MAIL_DIENSTE, type MailDienst } from "./adapters/mail";
import { WHATSAPP_BRAUCHT, whatsappEcht } from "./adapters/whatsapp";
import { LEXWARE_BRAUCHT, lexwareEcht } from "./adapters/lexware";
import { QONTO_BRAUCHT, qontoEcht } from "./adapters/qonto";

// Alle Anschlüsse an fremde Werkzeuge an einer Stelle. Jeder Konnektor ist ein Adapter mit Simulator:
// Fehlen die Zugangsdaten, läuft der Simulator und nichts verlässt das System.
// Zugangsdaten stehen nur in der Umgebung des Servers (.env bzw. Passwortmanager), nie in der Datenbank oder im Code.

export type KonnektorStatus = "aktiv" | "simulator" | "bereit" | "bewusst_aus";
export type Konnektor = {
  key: string;
  kategorie: string;
  name: string;
  zweck: string;
  status: KonnektorStatus;
  braucht: string[];
  schritte: string[];
  datenschutz?: string;
};

const gesetzt = (keys: string[]) => keys.length > 0 && keys.every((k) => !!process.env[k]);
const s = (keys: string[]): KonnektorStatus => (gesetzt(keys) ? "aktiv" : "simulator");

export const KATEGORIEN = ["E-Mail", "Nachrichten-Eingang", "Geld", "Kalender", "KI und Sprache", "Technik", "Schnittstelle"];

export async function konnektoren(): Promise<Konnektor[]> {
  const mail = aktiverMailDienst();
  const db = await getDb();
  const schluessel = await db.select({ rechte: schema.apiSchluessel.rechte }).from(schema.apiSchluessel).where(isNull(schema.apiSchluessel.widerrufenAm));
  const apiFuer = (r: string) => schluessel.some((x) => x.rechte.includes(r));
  const mailKonnektor = (k: Exclude<MailDienst, "simulator">, schritte: string[], datenschutz: string): Konnektor => ({
    key: `mail-${k}`,
    kategorie: "E-Mail",
    name: MAIL_DIENSTE[k].name,
    zweck: "Mails aus dem Postausgang im Levarex-Design (HTML und Text, PDFs im Anhang)",
    status: mail === k ? "aktiv" : gesetzt(MAIL_DIENSTE[k].braucht) ? "bereit" : "simulator",
    braucht: MAIL_DIENSTE[k].braucht,
    schritte,
    datenschutz,
  });

  return [
    { ...mailKonnektor("smtp", [
      "Eigenes Postfach je Person: Einstellungen → Mein Postfach. Mails, die Daniel unterschreibt, gehen von Daniels Postfach raus, die von Maximilian von seinem, und liegen danach im Ordner „Gesendet“.",
      "Allgemeiner Absender (info@) für alles andere: in Coolify SMTP_HOST (netcup: mx9810.netcup.net), SMTP_PORT 465, SMTP_USER (volle Adresse), SMTP_PASS setzen. Absender ist automatisch „Levarex Consulting <SMTP_USER>“.",
      "Zugangsdaten stehen bei netcup im Kundenbereich (Webhosting → E-Mail).",
    ], "Postfächer bei netcup (Deutschland), AV-Vertrag im netcup-Kundenbereich."), name: "E-Mail (netcup per SMTP)" },
    {
      key: "whatsapp",
      kategorie: "Nachrichten-Eingang",
      name: "WhatsApp Business (Cloud API von Meta)",
      zweck: "Nachrichten von Kunden empfangen, Antwortentwurf im Postausgang, Versand nach Freigabe. Nur Antworten innerhalb von 24 Stunden, kein Erstkontakt.",
      status: whatsappEcht() ? "aktiv" : "simulator",
      braucht: WHATSAPP_BRAUCHT,
      schritte: [
        "Meta Business-Konto verifizieren, im Meta-Entwicklerportal eine App vom Typ „Business“ mit WhatsApp anlegen.",
        "Eigene Telefonnummer hinzufügen (nicht die im normalen WhatsApp genutzte), Telefonnummer-ID notieren.",
        "Dauerhaftes Zugriffstoken über einen Systembenutzer erzeugen.",
        "Webhook: Rückruf-URL <BASE_URL>/api/whatsapp, Prüftoken frei wählen, Feld „messages“ abonnieren.",
        "WHATSAPP_TOKEN, WHATSAPP_TELEFON_ID, WHATSAPP_APP_SECRET (App-Geheimnis für die Signaturprüfung), WHATSAPP_VERIFY_TOKEN setzen.",
      ],
      datenschutz: "Meta Platforms Ireland als Auftragsverarbeiter (WhatsApp Business Data Processing Terms). Im Datenschutzhinweis der Website erwähnen.",
    },
    {
      key: "telefon",
      kategorie: "Nachrichten-Eingang",
      name: "Telefonanlage (sipgate, Placetel …)",
      zweck: "Verpasste Anrufe und Gesprächsnotizen landen beim Betrieb, mit Rückruf-Aufgabe für heute.",
      status: apiFuer("nachrichten") ? "aktiv" : "bereit",
      braucht: [],
      schritte: [
        "API-Schlüssel mit Recht „Nachrichten einliefern“ erzeugen.",
        "Webhook der Telefonanlage (z. B. sipgate „Anruf beendet“) an n8n.",
        "n8n: POST /api/v1/nachrichten mit { kanal: \"telefon\", absender: Nummer, inhalt: \"Verpasster Anruf\" oder Notiz, externeId: Anruf-ID, dauerSek }.",
      ],
      datenschutz: "Gespräche nie ohne ausdrückliche Einwilligung aufzeichnen (§ 201 StGB).",
    },
    { key: "qonto", kategorie: "Geld", name: "Qonto (SEPA-Lastschrift)", zweck: "Monatsbeitrag per Lastschrift; der Kunde unterschreibt das Mandat über einen Link von Qonto, Qonto kündigt jeden Einzug an", status: qontoEcht() ? "aktiv" : "simulator", braucht: QONTO_BRAUCHT, schritte: ["SEPA-Lastschrift im Qonto-Konto freischalten lassen (Gläubiger-ID).", "Qonto Business API: OAuth-App anlegen, Bereich sepa_direct_debit.write, Zugriffstoken erzeugen.", "QONTO_ACCESS_TOKEN und QONTO_KONTO_ID (Bankkonto-ID) setzen.", "Bis dahin: Monatsbeitrag per Überweisung, Levarex OS schreibt das automatisch in die Rechnung."], datenschutz: "Kontodaten des Kunden liegen nur bei Qonto, Levarex OS speichert nur die IDs." },
    { key: "lexware", kategorie: "Geld", name: "Lexware Office", zweck: "Rechnungen und E-Rechnung: angelegt beim freigegebenen Versand, Nummer und PDF von Lexware, täglicher Zahlstatus", status: lexwareEcht() ? "aktiv" : "simulator", braucht: LEXWARE_BRAUCHT, schritte: ["In Lexware Office: Einstellungen → Öffentliche API → Schlüssel erzeugen.", "LEXWARE_API_KEY setzen (optional LEXWARE_BASIS_URL).", "Mit dem Steuerberater klären: Nummernkreis, E-Rechnung (ZUGFeRD/XRechnung), Kontenrahmen.", "Ohne Schlüssel: eigene Rechnungsnummern und PDFs aus Levarex OS."], datenschutz: "AV-Vertrag in Lexware Office abschließen." },
    { key: "kalender", kategorie: "Kalender", name: "Kalender (Outlook, Google, Apple)", zweck: "Termine und Aufgaben als Kalender-Abo", status: "aktiv", braucht: [], schritte: ["Unter Stammdaten → Benutzer und Sicherheit den persönlichen Kalender-Link kopieren und in Outlook oder Google Kalender abonnieren."] },
    { key: "ki", kategorie: "KI und Sprache", name: "Claude (Anthropic)", zweck: "Entwürfe, Antwortvorschläge, Protokolle, zweite Qualitätskontrolle", status: s(["ANTHROPIC_API_KEY"]), braucht: ["ANTHROPIC_API_KEY"], schritte: ["API-Schlüssel in der Anthropic Console, AV-Vertrag (DPA) abschließen.", "ANTHROPIC_API_KEY setzen."] },
    { key: "ntfy", kategorie: "Technik", name: "Push aufs Handy (ntfy)", zweck: "Uploads, SEPA-Mandate und Tickets von Kunden, Fehler beim Versand, Tagesbericht", status: s(["NTFY_URL"]), braucht: ["NTFY_URL"], schritte: ["Eigener ntfy-Server in Coolify: New Resource → Service → ntfy, Domain z. B. https://ntfy.levarex-consulting.de (DNS-Eintrag A auf den Server).", "Zugang absichern: im ntfy-Container Benutzer anlegen, Lese- und Schreibrecht nur auf euer Thema, Zugangsschlüssel (Token) erzeugen.", "In Coolify NTFY_URL=https://ntfy.levarex-consulting.de/<geheimes-thema> und NTFY_TOKEN=<Token> setzen, neu deployen.", "App ntfy auf beiden Handys: Server ntfy.levarex-consulting.de, mit Benutzer anmelden, Thema abonnieren. Dann hier „Push testen“."], datenschutz: "Auf dem eigenen Server bleibt alles bei euch. Die Nachrichten enthalten nur Titel wie „Neue Dateien von …“, keine Inhalte. Zum Ausliefern ans iPhone nutzt ntfy Apples Push-Dienst." },
    { key: "gespraeche", kategorie: "KI und Sprache", name: "Gespräche aus Plaud", zweck: "Transkripte und Zusammenfassungen von Plaud beim Betrieb ablegen; daraus entstehen Protokoll und Angebotsentwurf (zur Freigabe)", status: "bereit", braucht: [], schritte: ["Von Hand: Kundenakte → Aktivitäten → Erfassen → „Gespräch importieren“, Transkript oder Zusammenfassung aus der Plaud-App einfügen.", "Automatisch: in n8n einen API-Schlüssel mit dem Recht „Gespräche einliefern“ nutzen und POST /api/v1/gespraeche aufrufen (Betrieb per E-Mail oder Telefon).", "Nur mit Einwilligung des Betriebs mitschreiben; der Text wird wie eine Aufnahme behandelt und nach dem Versand des Protokolls gelöscht."], datenschutz: "Gesprächsinhalte: gleiche Löschfrist wie Gesprächsaufnahmen (30 Tage)." },
    { key: "api", kategorie: "Schnittstelle", name: "Levarex-API und n8n", zweck: "Werkzeuge wie n8n anbinden: Leads, Kontakte, Aufgaben, Tickets, Nachrichten einliefern, Unterlagen lesen, Mail-Entwürfe in den Postausgang; Webhooks bei Ereignissen", status: schluessel.length ? "aktiv" : "bereit", braucht: [], schritte: ["Unter Benutzer und Sicherheit einen API-Schlüssel je n8n-Ablauf mit genau den nötigen Rechten erzeugen.", "In n8n die Beschreibung /api/v1/openapi.json importieren oder den HTTP-Knoten mit Authorization: Bearer lvx_… nutzen.", "Webhooks anlegen (https), Geheimnis in n8n hinterlegen und die Signatur prüfen.", "Versenden geht nie über die Schnittstelle: Entwürfe landen in den Freigaben."] },
  ];
}
