import { json, pruefeZugriff } from "@/lib/api";
import { nachrichtEingang } from "@/lib/ablauf/nachrichten";

// Nachrichten von außen einliefern: Mail-Postfach (über n8n), Telefonanlage (Anruf verpasst, Zusammenfassung),
// später WhatsApp- oder Telefon-Bot. Beispiel:
//   POST /api/v1/nachrichten  { "kanal": "telefon", "absender": "+49721…", "inhalt": "Rückruf wegen Angebot", "externeId": "anruf-123", "dauerSek": 45 }
// Nexova OS ordnet den Betrieb zu, legt eine Aufgabe an und entwirft bei Mail/WhatsApp eine Antwort im Postausgang.
export async function POST(req: Request) {
  const z = await pruefeZugriff(req, "nachrichten");
  if (z instanceof Response) return z;
  const d = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!d) return json({ fehler: "JSON erwartet" }, 400);
  const text = (k: string) => (typeof d[k] === "string" ? (d[k] as string) : null);
  try {
    const r = await nachrichtEingang(
      {
        kanal: text("kanal") ?? "",
        absender: text("absender") ?? "",
        inhalt: text("inhalt") ?? "",
        betreff: text("betreff"),
        externeId: text("externeId")?.slice(0, 200) ?? null,
        name: text("name")?.slice(0, 200) ?? null,
        betriebId: Number(d.betriebId) || null,
        dauerSek: Number(d.dauerSek) || null,
        zeit: text("zeit") && !Number.isNaN(Date.parse(text("zeit")!)) ? new Date(text("zeit")!) : undefined,
        entwurf: d.entwurf !== false,
      },
      z.name,
    );
    return json(r, r.neu ? 201 : 200);
  } catch (e) {
    return json({ fehler: e instanceof Error ? e.message : "Fehler" }, 400);
  }
}
