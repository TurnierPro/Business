import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb, schema } from "./db";
import { protokolliere } from "./protokoll";
import { einreihen } from "./jobs/warteschlange";
import { entschluessele, verschluessele } from "./geheim";
import { sicheresFetch } from "./sicherheit";

// Ausgehende Webhooks, z. B. an n8n. Inhalt: nur Ereignis und IDs. Details holt der Empfänger mit seinem API-Schlüssel
// (dort gelten Rechte und Protokoll). Signatur: X-Levarex-Signatur = sha256=HMAC(geheimnis, `${zeit}.${body}`).
// Zustellung über die Warteschlange (bei Fehlern wiederholt) und nur über sicheresFetch (keine internen Adressen).

export const EREIGNISSE: Record<string, string> = {
  "betrieb.neu": "Neuer Lead angelegt",
  "angebot.unterschrieben": "Verträge unterschrieben",
  "projekt.gestartet": "Erste Rate bezahlt, Projekt angelegt",
  "projekt.live": "Website live",
  "abnahme.erklaert": "Abnahme erklärt oder durch Frist erteilt",
  "nachricht.eingang": "Neue Nachricht (Mail, WhatsApp, Telefon)",
};

export async function webhookAnlegen(o: { name: string; url: string; ereignisse: string[] }, wer: string): Promise<{ id: number; geheimnis: string }> {
  const name = o.name.trim();
  if (!name) throw new Error("Name fehlt");
  let url: URL;
  try {
    url = new URL(o.url.trim());
  } catch {
    throw new Error("Adresse ungültig");
  }
  if (url.protocol !== "https:") throw new Error("Nur https-Adressen");
  const ereignisse = o.ereignisse.filter((e) => EREIGNISSE[e]);
  if (!ereignisse.length) throw new Error("Mindestens ein Ereignis wählen");
  const geheimnis = crypto.randomBytes(32).toString("base64url");
  const db = await getDb();
  const [w] = await db.insert(schema.webhooks).values({ name, url: url.toString(), ereignisse, geheimnis: verschluessele(geheimnis), erstelltVon: wer }).returning();
  await protokolliere(wer, `Webhook angelegt: ${name} (${ereignisse.join(", ")})`);
  return { id: w.id, geheimnis };
}

export async function webhookLoeschen(id: number, wer: string): Promise<void> {
  const db = await getDb();
  await db.delete(schema.webhooks).where(eq(schema.webhooks.id, id));
  await protokolliere(wer, `Webhook ${id} gelöscht`);
}

/** Ereignis melden: für jeden passenden Webhook einen Zustell-Job einreihen. Fehler hier stören den Ablauf nie. */
export async function ereignis(art: keyof typeof EREIGNISSE | string, daten: Record<string, number | string | null>): Promise<void> {
  try {
    const db = await getDb();
    const ziele = (await db.select().from(schema.webhooks)).filter((w) => w.aktiv && w.ereignisse.includes(art));
    for (const w of ziele) await einreihen("webhook", { webhookId: w.id, art, daten, am: new Date().toISOString() });
  } catch (e) {
    console.error("[webhook] Ereignis nicht eingereiht:", e);
  }
}

export function signatur(geheimnis: string, zeit: string, body: string): string {
  return `sha256=${crypto.createHmac("sha256", geheimnis).update(`${zeit}.${body}`).digest("hex")}`;
}

/** Job: einen Webhook zustellen. Wirft bei Fehler, damit die Warteschlange wiederholt. */
export async function webhookZustellen(d: { webhookId: number; art: string; daten: Record<string, unknown>; am: string }): Promise<string> {
  const db = await getDb();
  const [w] = await db.select().from(schema.webhooks).where(eq(schema.webhooks.id, Number(d.webhookId)));
  if (!w || !w.aktiv) return "Webhook nicht mehr aktiv";
  const body = JSON.stringify({ ereignis: d.art, am: d.am, daten: d.daten });
  const zeit = String(Math.floor(Date.now() / 1000));
  try {
    const res = await sicheresFetch(w.url, { method: "POST", body, timeoutMs: 10_000, headers: { "Content-Type": "application/json", "X-Levarex-Ereignis": d.art, "X-Levarex-Zeit": zeit, "X-Levarex-Signatur": signatur(entschluessele(w.geheimnis), zeit, body) } });
    if (!res.ok) throw new Error(`Antwort ${res.status}`);
    await db.update(schema.webhooks).set({ letzterVersand: new Date(), letzterFehler: null }).where(eq(schema.webhooks.id, w.id));
    return `${d.art} an ${w.name} zugestellt`;
  } catch (e) {
    const fehler = e instanceof Error ? e.message : String(e);
    await db.update(schema.webhooks).set({ letzterFehler: `${new Date().toISOString().slice(0, 16)} ${fehler}`.slice(0, 300) }).where(eq(schema.webhooks.id, w.id));
    throw e;
  }
}
