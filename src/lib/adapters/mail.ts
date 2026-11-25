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
  smtp: { name: "SMTP (beliebiger Anbieter)", braucht: ["SMTP_HOST", "SMTP_USER", "SMTP_PASS"], hinweis: "Zugangsdaten vom Mail-Anbieter. Bei Outlook oder Gmail per SMTP: App-Passwort statt Hauptpasswort." },
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

/** Mail senden. Mit `konto` vom eigenen Postfach einer Person (und Ablage in deren „Gesendet“), sonst über den allgemeinen Weg. */
export async function sendeMail(m: Mail, konto?: import("../postfach").SmtpKonto | null): Promise<string> {
  if (konto) return sendeUeberKonto(m, konto);
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

/**
 * Absender für den allgemeinen SMTP-Zugang. SMTP_FROM gilt nur, wenn seine Adresse zur Domain des Postfachs (SMTP_USER) passt.
 * Sonst (fehlt, alte Domain wie „levax.de“, Tippfehler) schicken wir als „Levarex Consulting <SMTP_USER>“: Der Mailserver
 * würde fremde Absender ohnehin ablehnen, und der Kunde sähe keine falsche Adresse.
 */
export function smtpAbsender(): string {
  const user = (process.env.SMTP_USER ?? "").trim();
  const roh = (process.env.SMTP_FROM ?? "").trim();
  const adresse = (roh.match(/<([^>]+)>/)?.[1] ?? roh).trim().toLowerCase();
  const domain = (a: string) => a.split("@")[1] ?? "";
  if (adresse.includes("@") && domain(adresse) === domain(user.toLowerCase())) return roh;
  return user.includes("@") ? `Levarex Consulting <${user}>` : roh;
}

async function sendeUeberSmtp(m: Mail): Promise<string> {
  const nodemailer = await import("nodemailer");
  const port = Number(process.env.SMTP_PORT ?? 587);
  const transport = nodemailer.createTransport({ host: process.env.SMTP_HOST, port, secure: port === 465, requireTLS: port !== 465, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } });
  const info = await transport.sendMail({
    from: smtpAbsender(),
    to: m.an,
    replyTo: process.env.MAIL_ANTWORT_AN,
    subject: m.betreff,
    text: m.text,
    html: m.html,
    attachments: m.anhaenge.map((a) => ({ filename: a.name, content: a.inhalt })),
  });
  return `Versendet über SMTP: ${info.messageId}`;
}

// ---------- Eigenes Postfach einer Person (SMTP + Ablage in „Gesendet“ per IMAP) ----------

type Versand = (k: import("../postfach").SmtpKonto, umschlag: { from: string; to: string[] }, mime: Buffer) => Promise<string>;
let testVersand: Versand | null = null;
let testAblage: ((k: import("../postfach").SmtpKonto, mime: Buffer) => Promise<string>) | null = null;
/** Nur für Tests: SMTP und IMAP ersetzen. */
export function setzeTestPostfach(versand: Versand | null, ablage: typeof testAblage): void {
  testVersand = versand;
  testAblage = ablage;
}

async function sendeUeberKonto(m: Mail, k: import("../postfach").SmtpKonto): Promise<string> {
  const nodemailer = await import("nodemailer");
  const MailComposer = (await import("nodemailer/lib/mail-composer")).default;
  // Einmal zusammenbauen: genau diese Fassung geht raus und liegt danach in „Gesendet“
  const mime = await new MailComposer({
    from: { name: k.name, address: k.absender },
    to: m.an,
    subject: m.betreff,
    text: m.text,
    html: m.html,
    date: new Date(),
    attachments: m.anhaenge.map((a) => ({ filename: a.name, content: a.inhalt })),
  })
    .compile()
    .build();
  const umschlag = { from: k.absender, to: [m.an] };
  let id: string;
  if (testVersand) id = await testVersand(k, umschlag, mime);
  else {
    const t = nodemailer.createTransport({ host: k.host, port: k.port, secure: k.port === 465, requireTLS: k.port !== 465, auth: { user: k.benutzer, pass: k.passwort }, connectionTimeout: 20_000 });
    id = (await t.sendMail({ envelope: umschlag, raw: mime })).messageId;
  }
  // Ablage in „Gesendet“: Fehler hier stoppen den Versand nicht (die Mail ist schon raus), aber wir melden es
  let ablage = "";
  try {
    const ordner = testAblage ? await testAblage(k, mime) : await (await import("../postfach")).imGesendetAblegen(k, mime);
    ablage = `, abgelegt in „${ordner}“`;
  } catch (err) {
    ablage = ", nicht in „Gesendet“ abgelegt";
    await (await import("./push")).melde("mail", false, `Mail an ${m.an} nicht in „Gesendet“ abgelegt`, err instanceof Error ? err.message : String(err));
  }
  return `Versendet von ${k.absender}${id ? ` (${id})` : ""}${ablage}`;
}

/**
 * Verbindungsprüfung für den allgemeinen SMTP-Zugang (Coolify-Variablen), ohne etwas zu senden.
 * Zeigt, was die App wirklich bekommt; das Passwort nie, nur Länge und auffällige Zeichen
 * (z. B. Leerzeichen am Rand oder Anführungszeichen, typische Kopierfehler; ein „$“ verschluckt Coolify ohne „Is Literal“).
 */
export async function smtpDiagnose(): Promise<{ host: string; port: number; benutzer: string; absender: string; passwortLaenge: number; auffaellig: string[]; ergebnis: string; ok: boolean }> {
  const host = process.env.SMTP_HOST ?? "";
  const port = Number(process.env.SMTP_PORT ?? 587);
  const benutzer = process.env.SMTP_USER ?? "";
  const pass = process.env.SMTP_PASS ?? "";
  const auffaellig: string[] = [];
  if (!host) auffaellig.push("SMTP_HOST fehlt.");
  if (!benutzer.includes("@")) auffaellig.push("SMTP_USER ist keine volle Adresse (bei netcup z. B. info@levarex-consulting.de).");
  if (benutzer !== benutzer.trim()) auffaellig.push("SMTP_USER hat Leerzeichen am Anfang oder Ende.");
  if (!pass) auffaellig.push("SMTP_PASS fehlt oder ist leer.");
  if (pass !== pass.trim()) auffaellig.push("SMTP_PASS hat Leerzeichen am Anfang oder Ende.");
  if (/^["']|["']$/.test(pass)) auffaellig.push("SMTP_PASS beginnt oder endet mit einem Anführungszeichen (mitkopiert?).");
  if (![465, 587].includes(port)) auffaellig.push(`SMTP_PORT ist ${port}; üblich sind 465 (SSL) oder 587 (STARTTLS).`);
  if ((process.env.SMTP_FROM ?? "").trim() && smtpAbsender() !== (process.env.SMTP_FROM ?? "").trim()) auffaellig.push(`SMTP_FROM („${process.env.SMTP_FROM}“) passt nicht zum Postfach und wird ignoriert; verschickt wird als ${smtpAbsender()}. Bitte in Coolify korrigieren oder löschen.`);
  let ergebnis = "nicht geprüft";
  let ok = false;
  if (host && benutzer && pass) {
    const nodemailer = await import("nodemailer");
    const t = nodemailer.createTransport({ host, port, secure: port === 465, requireTLS: port !== 465, auth: { user: benutzer, pass }, connectionTimeout: 15_000, greetingTimeout: 15_000 });
    try {
      await t.verify();
      ok = true;
      ergebnis = "Anmeldung beim Mailserver erfolgreich.";
    } catch (err) {
      ergebnis = err instanceof Error ? err.message : String(err);
    }
  }
  return { host, port, benutzer, absender: smtpAbsender(), passwortLaenge: pass.length, auffaellig, ergebnis, ok };
}
