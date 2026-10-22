import crypto from "node:crypto";
import { getDb, schema } from "../db";

// WhatsApp über die offizielle WhatsApp Business Cloud API (Meta).
// Echt nur mit WHATSAPP_TOKEN und WHATSAPP_TELEFON_ID, sonst Simulator-Postfach.
// Wichtig: Freie Texte erlaubt WhatsApp nur innerhalb von 24 Stunden nach der letzten Nachricht des Kunden.
// Das prüft die Qualitätskontrolle im Postausgang. Erstkontakt per WhatsApp gibt es bei Nexova nicht (§ 7 UWG).
// Die Dienst-Adresse ist fest (keine Eingaben von außen), deshalb hier normales fetch.

export const WHATSAPP_BRAUCHT = ["WHATSAPP_TOKEN", "WHATSAPP_TELEFON_ID", "WHATSAPP_APP_SECRET", "WHATSAPP_VERIFY_TOKEN"];
export const whatsappEcht = () => !!process.env.WHATSAPP_TOKEN && !!process.env.WHATSAPP_TELEFON_ID;

/** Telefonnummer einheitlich als +49… (E.164). Gibt null zurück, wenn es keine Nummer ist. */
export function telefonNormal(roh: string | null | undefined): string | null {
  if (!roh) return null;
  let n = roh.replace(/[^\d+]/g, "");
  if (n.startsWith("00")) n = `+${n.slice(2)}`;
  else if (n.startsWith("0")) n = `+49${n.slice(1)}`;
  else if (!n.startsWith("+")) n = `+${n}`;
  return /^\+[1-9]\d{6,14}$/.test(n) ? n : null;
}

export async function sendeWhatsApp(w: { an: string; text: string }): Promise<{ ergebnis: string; externeId: string | null }> {
  const an = telefonNormal(w.an);
  if (!an) throw new Error("Keine gültige Telefonnummer für WhatsApp.");
  if (!whatsappEcht()) {
    const db = await getDb();
    await db.insert(schema.simulatorPost).values({ kanal: "whatsapp", an, betreff: "WhatsApp", text: w.text, anhaenge: [] });
    return { ergebnis: "Simulator: WhatsApp im Simulator-Postfach abgelegt", externeId: null };
  }
  const res = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(process.env.WHATSAPP_TELEFON_ID!)}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: an.slice(1), type: "text", text: { body: w.text, preview_url: false } }),
    signal: AbortSignal.timeout(20_000),
  });
  const antwort = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string } };
  if (!res.ok) throw new Error(`WhatsApp: ${res.status} ${antwort.error?.message ?? ""}`);
  const id = antwort.messages?.[0]?.id ?? null;
  return { ergebnis: `Versendet über WhatsApp: ${id}`, externeId: id };
}

/** Echtheit eines Webhooks von Meta prüfen (Kopfzeile X-Hub-Signature-256 = HMAC-SHA256 des Rohtexts). */
export function whatsappSignaturOk(rohtext: string, signatur: string | null): boolean {
  const geheim = process.env.WHATSAPP_APP_SECRET;
  if (!geheim || !signatur?.startsWith("sha256=")) return false;
  const soll = Buffer.from(crypto.createHmac("sha256", geheim).update(rohtext).digest("hex"));
  const ist = Buffer.from(signatur.slice(7));
  return soll.length === ist.length && crypto.timingSafeEqual(soll, ist);
}

export type WhatsAppEingang = { externeId: string; von: string; name: string | null; text: string; zeit: Date };

/** Eingehende Textnachrichten aus einem Meta-Webhook herauslesen (Statusmeldungen werden ignoriert). */
export function whatsappNachrichtenAus(daten: unknown): WhatsAppEingang[] {
  type Wert = { contacts?: { wa_id?: string; profile?: { name?: string } }[]; messages?: { id?: string; from?: string; timestamp?: string; type?: string; text?: { body?: string }; button?: { text?: string }; interactive?: { button_reply?: { title?: string } } }[] };
  const eintraege = (daten as { entry?: { changes?: { value?: Wert }[] }[] })?.entry ?? [];
  const aus: WhatsAppEingang[] = [];
  for (const e of eintraege)
    for (const c of e.changes ?? [])
      for (const m of c.value?.messages ?? []) {
        if (!m.id || !m.from) continue;
        const text = m.text?.body ?? m.button?.text ?? m.interactive?.button_reply?.title ?? `[${m.type ?? "unbekannt"} – nur im WhatsApp-Konto sichtbar]`;
        const name = c.value?.contacts?.find((k) => k.wa_id === m.from)?.profile?.name ?? null;
        aus.push({ externeId: m.id, von: `+${m.from}`, name, text: text.slice(0, 5000), zeit: m.timestamp ? new Date(Number(m.timestamp) * 1000) : new Date() });
      }
  return aus;
}
