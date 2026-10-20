import { json, pruefeZugriff } from "@/lib/api";
import { ticketAnlegen } from "@/lib/ablauf/tickets";

// Ticket anlegen, z. B. aus einem Mail-Postfach über n8n.
export async function POST(req: Request) {
  const z = await pruefeZugriff(req, "tickets");
  if (z instanceof Response) return z;
  const d = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!d || !Number(d.betriebId)) return json({ fehler: "Feld „betriebId“ fehlt" }, 400);
  try {
    const id = await ticketAnlegen({ betriebId: Number(d.betriebId), betreff: String(d.betreff ?? ""), beschreibung: String(d.beschreibung ?? ""), kategorie: String(d.kategorie ?? "aenderung"), prioritaet: String(d.prioritaet ?? "normal"), quelle: "api" }, z.name);
    return json({ id }, 201);
  } catch (e) {
    return json({ fehler: e instanceof Error ? e.message : "Fehler" }, 400);
  }
}
