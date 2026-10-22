import { nachrichtEingang } from "@/lib/ablauf/nachrichten";
import { whatsappNachrichtenAus, whatsappSignaturOk } from "@/lib/adapters/whatsapp";

// Webhook für die WhatsApp Business Cloud API (Meta).
// In Meta einrichten: Rückruf-URL <BASE_URL>/api/whatsapp, Prüftoken = WHATSAPP_VERIFY_TOKEN, Feld „messages“ abonnieren.

// Meta prüft beim Einrichten, ob der Endpunkt uns gehört
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const soll = process.env.WHATSAPP_VERIFY_TOKEN;
  if (soll && p.get("hub.mode") === "subscribe" && p.get("hub.verify_token") === soll) return new Response(p.get("hub.challenge") ?? "", { status: 200 });
  return new Response("Nicht erlaubt", { status: 403 });
}

// Eingehende Nachrichten. Ohne gültige Signatur wird nichts gespeichert.
export async function POST(req: Request) {
  const roh = await req.text();
  if (roh.length > 1_000_000) return new Response("Zu groß", { status: 413 });
  if (!whatsappSignaturOk(roh, req.headers.get("x-hub-signature-256"))) return new Response("Signatur ungültig", { status: 401 });
  let daten: unknown;
  try {
    daten = JSON.parse(roh);
  } catch {
    return new Response("Kein JSON", { status: 400 });
  }
  for (const m of whatsappNachrichtenAus(daten)) {
    await nachrichtEingang({ kanal: "whatsapp", absender: m.von, name: m.name, inhalt: m.text, externeId: m.externeId, zeit: m.zeit }, "WhatsApp-Webhook");
  }
  // Meta erwartet schnell eine 200, sonst wird wiederholt (Doppelte fängt die externe ID ab)
  return Response.json({ ok: true });
}
