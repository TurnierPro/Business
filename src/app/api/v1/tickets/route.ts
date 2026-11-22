import { json, pruefeZugriff } from "@/lib/api";
import { ticketAnlegen } from "@/lib/ablauf/tickets";
import { zuordnen } from "@/lib/ablauf/nachrichten";

// Ticket anlegen, z. B. aus einem Mail-Postfach über n8n.
export async function POST(req: Request) {
  const z = await pruefeZugriff(req, "tickets");
  if (z instanceof Response) return z;
  const d = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!d) return json({ fehler: "JSON fehlt" }, 400);
  // Kunde per betriebId oder anhand von E-Mail bzw. Telefonnummer des Absenders finden
  let betriebId = Number(d.betriebId) || 0;
  if (!betriebId && (d.email || d.telefon)) betriebId = (await zuordnen(String(d.email ?? d.telefon))).betriebId ?? 0;
  if (!betriebId) return json({ fehler: "Kunde nicht gefunden: „betriebId“ oder bekannte „email“/„telefon“ angeben" }, 422);
  try {
    const id = await ticketAnlegen({ betriebId, betreff: String(d.betreff ?? ""), beschreibung: String(d.beschreibung ?? ""), kategorie: String(d.kategorie ?? "aenderung"), prioritaet: String(d.prioritaet ?? "normal"), quelle: "api" }, z.name);
    return json({ id, betriebId }, 201);
  } catch (e) {
    return json({ fehler: e instanceof Error ? e.message : "Fehler" }, 400);
  }
}
