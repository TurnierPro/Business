import { json, pruefeZugriff } from "@/lib/api";
import { beitragAnlegen } from "@/lib/beitraege";

// Entwurf für einen Beitrag oder eine Bewertungsantwort einliefern, z. B. vom Marketing-Agenten über n8n.
// Es entsteht nur ein Entwurf in der Kundenakte. Vorlegen beim Betrieb und Veröffentlichen machen Menschen.
export async function POST(req: Request) {
  const z = await pruefeZugriff(req, "beitraege");
  if (z instanceof Response) return z;
  const d = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!d) return json({ fehler: "JSON fehlt" }, 400);
  const betriebId = Number(d.betriebId) || 0;
  if (!betriebId) return json({ fehler: "„betriebId“ fehlt" }, 422);
  const geplant = typeof d.geplantAm === "string" && !Number.isNaN(Date.parse(d.geplantAm)) ? new Date(d.geplantAm) : null;
  try {
    const id = await beitragAnlegen({ betriebId, art: String(d.art ?? "beitrag"), kanaele: Array.isArray(d.kanaele) ? d.kanaele.map(String) : [], text: String(d.text ?? ""), bezug: typeof d.bezug === "string" ? d.bezug : undefined, geplantAm: geplant }, `Schnittstelle: ${z.name}`);
    return json({ id, betriebId, status: "entwurf" }, 201);
  } catch (e) {
    return json({ fehler: e instanceof Error ? e.message : "Fehler" }, 400);
  }
}
