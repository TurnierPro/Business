import { getDb, schema } from "../db";

export type Mail = { an: string; betreff: string; text: string; anhaenge: { name: string; inhalt: Buffer }[] };

export async function sendeMail(m: Mail): Promise<string> {
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
