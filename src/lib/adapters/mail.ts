import crypto from "node:crypto";
import { getDb, schema } from "../db";
import { marke } from "../marke";

// E-Mail-Versand. Wird nur vom Postausgang aufgerufen (nach Qualitätskontrolle und Freigabe).
// Wege, je nachdem welche Zugangsdaten gesetzt sind (oder fest mit MAIL_DIENST):
//   microsoft: Microsoft 365 / Outlook über Microsoft Graph (Mail landet auch in „Gesendete Elemente“)
//   google:    Google Workspace / Gmail über die Gmail-API (Dienstkonto mit domänenweiter Delegierung)
//   resend:    Resend (API)
//   smtp:      jeder andere Anbieter (IONOS, STRATO, Outlook/Gmail per SMTP mit App-Passwort)
//   simulator: nichts verlässt das System, die Mail liegt im Simulator-Postfach
// Die Dienst-Adressen sind fest (keine Eingaben von außen), deshalb hier normales fetch.

export type Mail = { an: string; betreff: string; text: string; html?: string; anhaenge: { name: string; inhalt: Buffer }[] };
export type MailDienst = "microsoft" | "google" | "resend" | "smtp" | "simulator";

export const MAIL_DIENSTE: Record<MailDienst, { name: string; braucht: string[]; hinweis: string }> = {
  microsoft: { name: "Microsoft 365 (Outlook)", braucht: ["MS_TENANT_ID", "MS_CLIENT_ID", "MS_CLIENT_SECRET", "MS_ABSENDER"], hinweis: "App-Registrierung in Entra ID mit Anwendungsberechtigung Mail.Send, Zugriff per Application Access Policy auf das Absender-Postfach beschränken." },
  google: { name: "Google Workspace (Gmail)", braucht: ["GOOGLE_CLIENT_EMAIL", "GOOGLE_PRIVATE_KEY", "GOOGLE_ABSENDER"], hinweis: "Dienstkonto in der Google Cloud, Gmail-API aktivieren, in der Admin-Konsole domänenweite Delegierung mit Bereich gmail.send." },
  resend: { name: "Resend", braucht: ["RESEND_API_KEY", "MAIL_FROM"], hinweis: "Domain bei Resend bestätigen (SPF, DKIM). Server in den USA: AV-Vertrag und Drittland prüfen." },
  smtp: { name: "SMTP (beliebiger Anbieter)", braucht: ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"], hinweis: "Zugangsdaten vom Mail-Anbieter. Bei Outlook oder Gmail per SMTP: App-Passwort statt Hauptpasswort." },
  simulator: { name: "Simulator", braucht: [], hinweis: "Nichts verlässt das System. Mails liegen unter Logs → Simulator-Postfach." },
};

const gesetzt = (d: MailDienst) => MAIL_DIENSTE[d].braucht.every((k) => !!process.env[k]);

/** Welcher Weg ist aktiv? MAIL_DIENST erzwingt einen, sonst der erste mit vollständigen Zugangsdaten. */
export function aktiverMailDienst(): MailDienst {
  const fest = process.env.MAIL_DIENST as MailDienst | undefined;
  if (fest && fest in MAIL_DIENSTE) return fest;
  return (["microsoft", "google", "resend", "smtp"] as MailDienst[]).find(gesetzt) ?? "simulator";
}

const absenderName = () => process.env.MAIL_ABSENDER_NAME ?? marke.name;

export async function sendeMail(m: Mail): Promise<string> {
  const dienst = aktiverMailDienst();
  if (dienst !== "simulator" && !gesetzt(dienst)) throw new Error(`${MAIL_DIENSTE[dienst].name}: es fehlen ${MAIL_DIENSTE[dienst].braucht.filter((k) => !process.env[k]).join(", ")}`);
  switch (dienst) {
    case "microsoft":
      return sendeUeberMicrosoft(m);
    case "google":
      return sendeUeberGoogle(m);
    case "resend":
      return sendeUeberResend(m);
    case "smtp":
      return sendeUeberSmtp(m);
    default: {
      const db = await getDb();
      await db.insert(schema.simulatorPost).values({ kanal: "mail", an: m.an, betreff: m.betreff, text: m.text, anhaenge: m.anhaenge.map((a) => a.name) });
      return "Simulator: Mail im Simulator-Postfach abgelegt";
    }
  }
}

// ---------- Microsoft 365 (Graph) ----------

async function sendeUeberMicrosoft(m: Mail): Promise<string> {
  const e = process.env;
  const tok = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(e.MS_TENANT_ID!)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: e.MS_CLIENT_ID!, client_secret: e.MS_CLIENT_SECRET!, scope: "https://graph.microsoft.com/.default" }).toString(),
    signal: AbortSignal.timeout(20_000),
  });
  const t = (await tok.json().catch(() => ({}))) as { access_token?: string; error_description?: string };
  if (!tok.ok || !t.access_token) throw new Error(`Microsoft-Anmeldung: ${t.error_description?.split("\n")[0] ?? tok.status}`);
  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(e.MS_ABSENDER!)}/sendMail`, {
    method: "POST",
    headers: { Authorization: `Bearer ${t.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        subject: m.betreff,
        body: m.html ? { contentType: "HTML", content: m.html } : { contentType: "Text", content: m.text },
        toRecipients: [{ emailAddress: { address: m.an } }],
        ...(e.MAIL_ANTWORT_AN ? { replyTo: [{ emailAddress: { address: e.MAIL_ANTWORT_AN } }] } : {}),
        attachments: m.anhaenge.map((a) => ({ "@odata.type": "#microsoft.graph.fileAttachment", name: a.name, contentType: "application/pdf", contentBytes: a.inhalt.toString("base64") })),
      },
      saveToSentItems: true,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (res.status !== 202) throw new Error(`Microsoft Graph: ${res.status} ${((await res.json().catch(() => ({}))) as { error?: { message?: string } }).error?.message ?? ""}`);
  return `Versendet über Microsoft 365 (${e.MS_ABSENDER})`;
}

// ---------- Google Workspace (Gmail-API) ----------

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");

async function googleToken(): Promise<string> {
  const e = process.env;
  const jetzt = Math.floor(Date.now() / 1000);
  const kopf = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const inhalt = b64url(JSON.stringify({ iss: e.GOOGLE_CLIENT_EMAIL, sub: e.GOOGLE_ABSENDER, scope: "https://www.googleapis.com/auth/gmail.send", aud: "https://oauth2.googleapis.com/token", iat: jetzt, exp: jetzt + 3600 }));
  const schluessel = e.GOOGLE_PRIVATE_KEY!.replace(/\\n/g, "\n");
  const signatur = crypto.createSign("RSA-SHA256").update(`${kopf}.${inhalt}`).sign(schluessel).toString("base64url");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${kopf}.${inhalt}.${signatur}` }).toString(),
    signal: AbortSignal.timeout(20_000),
  });
  const t = (await res.json().catch(() => ({}))) as { access_token?: string; error_description?: string };
  if (!res.ok || !t.access_token) throw new Error(`Google-Anmeldung: ${t.error_description ?? res.status}`);
  return t.access_token;
}

/** Fertige MIME-Nachricht (Text, HTML, Anhänge) mit nodemailer bauen, ohne sie zu senden. */
export async function mimeNachricht(m: Mail, absender: string): Promise<Buffer> {
  const nodemailer = await import("nodemailer");
  const t = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "unix" });
  const info = await t.sendMail({
    from: { name: absenderName(), address: absender },
    to: m.an,
    replyTo: process.env.MAIL_ANTWORT_AN,
    subject: m.betreff,
    text: m.text,
    html: m.html,
    attachments: m.anhaenge.map((a) => ({ filename: a.name, content: a.inhalt, contentType: "application/pdf" })),
  });
  return info.message as Buffer;
}

async function sendeUeberGoogle(m: Mail): Promise<string> {
  const absender = process.env.GOOGLE_ABSENDER!;
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(absender)}/messages/send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await googleToken()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: b64url(await mimeNachricht(m, absender)) }),
    signal: AbortSignal.timeout(30_000),
  });
  const antwort = (await res.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
  if (!res.ok) throw new Error(`Gmail: ${res.status} ${antwort.error?.message ?? ""}`);
  return `Versendet über Google Workspace: ${antwort.id}`;
}

// ---------- Resend ----------

async function sendeUeberResend(m: Mail): Promise<string> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.MAIL_FROM,
      to: [m.an],
      ...(process.env.MAIL_ANTWORT_AN ? { reply_to: process.env.MAIL_ANTWORT_AN } : {}),
      subject: m.betreff,
      text: m.text,
      ...(m.html ? { html: m.html } : {}),
      attachments: m.anhaenge.map((a) => ({ filename: a.name, content: a.inhalt.toString("base64") })),
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const antwort = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!res.ok) throw new Error(`Resend: ${res.status} ${antwort.message ?? "unbekannter Fehler"}`);
  return `Versendet über Resend: ${antwort.id}`;
}

// ---------- SMTP ----------

async function sendeUeberSmtp(m: Mail): Promise<string> {
  const nodemailer = await import("nodemailer");
  const port = Number(process.env.SMTP_PORT ?? 587);
  const transport = nodemailer.createTransport({ host: process.env.SMTP_HOST, port, secure: port === 465, requireTLS: port !== 465, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } });
  const info = await transport.sendMail({
    from: process.env.SMTP_FROM,
    to: m.an,
    replyTo: process.env.MAIL_ANTWORT_AN,
    subject: m.betreff,
    text: m.text,
    html: m.html,
    attachments: m.anhaenge.map((a) => ({ filename: a.name, content: a.inhalt })),
  });
  return `Versendet über SMTP: ${info.messageId}`;
}
