import { isNull } from "drizzle-orm";
import { getDb, schema } from "./db";
import { aktiverMailDienst, MAIL_DIENSTE, type MailDienst } from "./adapters/mail";
import { WHATSAPP_BRAUCHT, whatsappEcht } from "./adapters/whatsapp";

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

export const KATEGORIEN = ["E-Mail", "Nachrichten-Eingang", "Geld", "Dokumente und Post", "KI und Sprache", "Technik", "Schnittstelle"];

export async function konnektoren(): Promise<Konnektor[]> {
  const mail = aktiverMailDienst();
  const db = await getDb();
  const schluessel = await db.select({ rechte: schema.apiSchluessel.rechte }).from(schema.apiSchluessel).where(isNull(schema.apiSchluessel.widerrufenAm));
  const apiFuer = (r: string) => schluessel.some((x) => x.rechte.includes(r));
  const mailKonnektor = (k: Exclude<MailDienst, "simulator">, schritte: string[], datenschutz: string): Konnektor => ({
    key: `mail-${k}`,
    kategorie: "E-Mail",
    name: MAIL_DIENSTE[k].name,
    zweck: "Mails aus dem Postausgang im Nexova-Design (HTML und Text, PDFs im Anhang)",
    status: mail === k ? "aktiv" : gesetzt(MAIL_DIENSTE[k].braucht) ? "bereit" : "simulator",
    braucht: MAIL_DIENSTE[k].braucht,
    schritte,
    datenschutz,
  });

  return [
    mailKonnektor("microsoft", [
      "Im Microsoft Entra Admin Center: App-Registrierung „Nexova OS“ anlegen.",
      "API-Berechtigungen → Microsoft Graph → Anwendungsberechtigung „Mail.Send“ → Administratorzustimmung erteilen.",
      "Zertifikate & Geheimnisse → Neuer geheimer Clientschlüssel. Wert sofort in den Passwortmanager.",
      "Mit einer Application Access Policy (Exchange Online PowerShell) den Zugriff auf das Absender-Postfach beschränken, z. B. hallo@nexova…",
      "MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET, MS_ABSENDER setzen. Gesendete Mails liegen danach auch in Outlook unter „Gesendete Elemente“.",
    ], "Microsoft 365 mit EU-Datengrenze; Auftragsverarbeitung über die Microsoft-Produktbedingungen (DPA)."),
    mailKonnektor("google", [
      "Google Cloud Console: Projekt anlegen, Gmail-API aktivieren.",
      "Dienstkonto anlegen, JSON-Schlüssel erzeugen (client_email und private_key daraus).",
      "Google Admin-Konsole → Sicherheit → API-Steuerung → Domainweite Delegierung: Client-ID des Dienstkontos mit Bereich https://www.googleapis.com/auth/gmail.send.",
      "GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY, GOOGLE_ABSENDER setzen.",
    ], "Google Workspace: Auftragsverarbeitung (Cloud Data Processing Addendum) in der Admin-Konsole annehmen."),
    mailKonnektor("smtp", [
      "Zugangsdaten beim Mail-Anbieter (IONOS, STRATO, Hetzner, mailbox.org …) nachsehen.",
      "Bei Outlook.com oder Gmail per SMTP: App-Passwort erzeugen, nie das Hauptpasswort.",
      "SMTP_HOST, SMTP_PORT (587 oder 465), SMTP_USER, SMTP_PASS, SMTP_FROM setzen.",
    ], "Am einfachsten mit einem deutschen Anbieter, AV-Vertrag abschließen."),
    mailKonnektor("resend", ["Konto bei Resend, Domain bestätigen (SPF, DKIM).", "RESEND_API_KEY und MAIL_FROM setzen."], "Sitz USA: AV-Vertrag und Drittlandübermittlung prüfen."),
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
      key: "mail-eingang",
      kategorie: "Nachrichten-Eingang",
      name: "Mail-Eingang (Outlook oder Gmail über n8n)",
      zweck: "Neue Mails im Postfach landen als Nachricht beim richtigen Betrieb, mit Aufgabe und Antwortentwurf.",
      status: apiFuer("nachrichten") ? "aktiv" : "bereit",
      braucht: [],
      schritte: [
        "Unter Stammdaten → Benutzer und Sicherheit einen API-Schlüssel mit Recht „Nachrichten einliefern“ erzeugen.",
        "In n8n: Auslöser „Microsoft Outlook Trigger“ oder „Gmail Trigger“.",
        "HTTP-Knoten: POST <BASE_URL>/api/v1/nachrichten, Kopfzeile Authorization: Bearer nxv_…, Inhalt { kanal: \"mail\", absender, betreff, inhalt, externeId: Message-ID }.",
      ],
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
    {
      key: "telefonbot",
      kategorie: "Nachrichten-Eingang",
      name: "KI-Telefon- oder WhatsApp-Bot",
      zweck: "Datenstruktur und Schnittstelle sind vorbereitet: Ein Bot liefert Nachrichten über /api/v1/nachrichten ein, Antworten gehen nur über den Postausgang.",
      status: "bewusst_aus",
      braucht: [],
      schritte: [
        "Laut Business Case nicht angeboten (AI Act Art. 50 Kennzeichnung, § 201 StGB, DSGVO, Haftung). Neue Entscheidung im Herbst 2027.",
        "Wenn ja: Bot muss sich als KI zu erkennen geben, darf nichts zusagen und schreibt nur Entwürfe.",
      ],
    },
    { key: "stripe", kategorie: "Geld", name: "Stripe", zweck: "Anzahlung im Portal, Schlusszahlung, Betreuungs-Abo per SEPA-Lastschrift", status: s(["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"]), braucht: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_STEUERSATZ_ID"], schritte: ["Konto bei Stripe, zum Üben Testmodus (sk_test_…).", "Webhook <BASE_URL>/api/stripe/webhook anlegen, Geheimnis als STRIPE_WEBHOOK_SECRET."] },
    { key: "lexoffice", kategorie: "Geld", name: "lexoffice", zweck: "Rechnungen und E-Rechnung (ZUGFeRD) in die Buchhaltung", status: s(["LEXOFFICE_API_KEY"]), braucht: ["LEXOFFICE_API_KEY"], schritte: ["Mit dem Steuerberater abstimmen (lexoffice, sevDesk oder DATEV).", "API-Schlüssel in lexoffice erzeugen, LEXOFFICE_API_KEY setzen."] },
    { key: "docuseal", kategorie: "Dokumente und Post", name: "E-Signatur (Docuseal)", zweck: "Angebote digital unterschreiben", status: s(["DOCUSEAL_URL", "DOCUSEAL_TOKEN"]), braucht: ["DOCUSEAL_URL", "DOCUSEAL_TOKEN"], schritte: ["Docuseal auf dem eigenen Server starten.", "DOCUSEAL_URL und DOCUSEAL_TOKEN setzen."] },
    { key: "brief", kategorie: "Dokumente und Post", name: "Briefdienst", zweck: "Akquise-Briefe drucken und versenden (erst nach dem Notartermin)", status: s(["BRIEFDIENST_API_KEY"]), braucht: ["BRIEFDIENST_API_KEY", "AKQUISE_FREIGESCHALTET"], schritte: ["Anbieter mit Sitz in Deutschland wählen, AV-Vertrag.", "BRIEFDIENST_API_KEY setzen; AKQUISE_FREIGESCHALTET=ja erst nach Gründung."] },
    { key: "kalender", kategorie: "Dokumente und Post", name: "Kalender (Outlook, Google, Apple)", zweck: "Termine und Aufgaben als Kalender-Abo", status: "aktiv", braucht: [], schritte: ["Unter Stammdaten → Benutzer und Sicherheit den persönlichen Kalender-Link kopieren und in Outlook oder Google Kalender abonnieren."] },
    { key: "ki", kategorie: "KI und Sprache", name: "Claude (Anthropic)", zweck: "Entwürfe, Antwortvorschläge, Protokolle, zweite Qualitätskontrolle", status: s(["ANTHROPIC_API_KEY"]), braucht: ["ANTHROPIC_API_KEY"], schritte: ["API-Schlüssel in der Anthropic Console, AV-Vertrag (DPA) abschließen.", "ANTHROPIC_API_KEY setzen."] },
    { key: "whisper", kategorie: "KI und Sprache", name: "Transkription (Whisper, eigener Server)", zweck: "Vor-Ort-Gespräche zu Text", status: s(["WHISPER_URL"]), braucht: ["WHISPER_URL"], schritte: ["faster-whisper-server auf dem eigenen Server starten, WHISPER_URL setzen."] },
    { key: "dns", kategorie: "Technik", name: "Server und Domain-Umzug", zweck: "Kunden-Domains prüfen und umziehen, Zertifikate", status: s(["SERVER_IP"]), braucht: ["SERVER_IP"], schritte: ["Öffentliche IPv4 des Servers als SERVER_IP setzen."] },
    { key: "ntfy", kategorie: "Technik", name: "Push aufs Handy (ntfy)", zweck: "Warnungen und Tagesbericht", status: s(["NTFY_URL"]), braucht: ["NTFY_URL"], schritte: ["ntfy selbst betreiben oder ntfy.sh, Thema als NTFY_URL setzen."] },
    { key: "api", kategorie: "Schnittstelle", name: "Nexova-API und n8n", zweck: "Beliebige Werkzeuge anbinden: Leads, Tickets, Nachrichten einliefern; Betriebe und Projekte lesen", status: schluessel.length ? "aktiv" : "bereit", braucht: [], schritte: ["API-Schlüssel mit genau den nötigen Rechten erzeugen.", "Endpunkte: /api/v1/betriebe, /api/v1/projekte, /api/v1/tickets, /api/v1/nachrichten (Authorization: Bearer nxv_…)."] },
  ];
}
