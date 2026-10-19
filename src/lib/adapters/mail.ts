import { getDb, schema } from "../db";

export type Mail = { an: string; betreff: string; text: string; anhaenge: { name: string; inhalt: Buffer }[] };

// Versandweg: Resend (wenn RESEND_API_KEY gesetzt), sonst SMTP, sonst Simulator.
export async function sendeMail(m: Mail): Promise<string> {
  if (process.env.RESEND_API_KEY) return sendeUeberResend(m);
  if (!process.env.SMTP_HOST) {
    const db = await getDb();
    await db.insert(schema.simulatorPost).values({
      kanal: "mail",
      an: m.an,
      betreff: m.betreff,
      text: m.text,
      anhaenge: m.anhaenge.map((a) => a.name),
    });
    return "Simulator: Mail im Simulator-Postfach abgelegt";
  }
  const nodemailer = await import("nodemailer");
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: Number(process.env.SMTP_PORT ?? 587) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  const info = await transport.sendMail({
    from: process.env.SMTP_FROM,
    to: m.an,
    subject: m.betreff,
    text: m.text,
    attachments: m.anhaenge.map((a) => ({ filename: a.name, content: a.inhalt })),
  });
  return `Versendet: ${info.messageId}`;
}

async function sendeUeberResend(m: Mail): Promise<string> {
  const absender = process.env.MAIL_FROM ?? process.env.SMTP_FROM;
  if (!absender) throw new Error("MAIL_FROM fehlt, z. B. \"Stelax Consulting <hallo@stelax.de>\" (Domain muss bei Resend bestätigt sein).");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: absender,
      to: [m.an],
      ...(process.env.MAIL_ANTWORT_AN ? { reply_to: process.env.MAIL_ANTWORT_AN } : {}),
      subject: m.betreff,
      text: m.text,
      attachments: m.anhaenge.map((a) => ({ filename: a.name, content: a.inhalt.toString("base64") })),
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const antwort = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!res.ok) throw new Error(`Resend: ${res.status} ${antwort.message ?? "unbekannter Fehler"}`);
  return `Versendet über Resend: ${antwort.id}`;
}
