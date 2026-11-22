import { json, pruefeZugriff } from "@/lib/api";
import { gespraechImportieren } from "@/lib/ablauf/verkauf";
import { zuordnen } from "@/lib/ablauf/nachrichten";

// Gespräch einliefern, z. B. eine Meeting-Zusammenfassung aus Claude über n8n.
// Danach entstehen Protokoll und Angebotsentwurf, beides wartet auf Freigabe. Versenden kann die Schnittstelle nichts.
export async function POST(req: Request) {
  const z = await pruefeZugriff(req, "gespraeche");
  if (z instanceof Response) return z;
  const d = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!d) return json({ fehler: "JSON fehlt" }, 400);
  let betriebId = Number(d.betriebId) || 0;
  if (!betriebId && (d.email || d.telefon)) betriebId = (await zuordnen(String(d.email ?? d.telefon))).betriebId ?? 0;
  if (!betriebId) return json({ fehler: "Betrieb nicht gefunden: „betriebId“ oder bekannte „email“/„telefon“ angeben" }, 422);
  const datum = typeof d.datum === "string" && !Number.isNaN(Date.parse(d.datum)) ? new Date(d.datum) : null;
  try {
    const id = await gespraechImportieren({ betriebId, text: String(d.text ?? ""), datum, einwilligung: d.einwilligung === true, quelle: "Schnittstelle", wer: z.name });
    return json({ id, betriebId }, 201);
  } catch (e) {
    return json({ fehler: e instanceof Error ? e.message : "Fehler" }, 400);
  }
}
