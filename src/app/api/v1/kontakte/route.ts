import { json, pruefeZugriff } from "@/lib/api";
import { kontaktSpeichern } from "@/lib/ablauf/crm";

// Ansprechpartner anlegen (Recht „kontakte“), z. B. aus einer Mail-Signatur über n8n.
export async function POST(req: Request) {
  const z = await pruefeZugriff(req, "kontakte");
  if (z instanceof Response) return z;
  const d = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!d || !Number(d.betriebId) || typeof d.name !== "string") return json({ fehler: "Felder „betriebId“ und „name“ nötig" }, 400);
  const s = (k: string) => (typeof d[k] === "string" ? (d[k] as string).slice(0, 200) : undefined);
  try {
    const id = await kontaktSpeichern({ betriebId: Number(d.betriebId), name: d.name.slice(0, 200), rolle: s("rolle"), telefon: s("telefon"), email: s("email"), notiz: s("notiz") }, z.name);
    return json({ id }, 201);
  } catch (e) {
    return json({ fehler: e instanceof Error ? e.message : "Fehler" }, 400);
  }
}
