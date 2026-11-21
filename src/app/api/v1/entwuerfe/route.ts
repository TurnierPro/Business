import { json, pruefeZugriff } from "@/lib/api";
import { inPostausgang } from "@/lib/ablauf/postausgang";

// Mail-Entwurf in den Postausgang legen (Recht „entwuerfe“). Rausgehen tut er nur nach Qualitätskontrolle
// und Freigabe durch einen Menschen. Ein Recht zum direkten Versenden gibt es nicht.
export async function POST(req: Request) {
  const z = await pruefeZugriff(req, "entwuerfe");
  if (z instanceof Response) return z;
  const d = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const s = (k: string, max: number) => (typeof d?.[k] === "string" ? (d[k] as string).trim().slice(0, max) : "");
  if (!d || !s("empfaenger", 200) || !s("betreff", 200) || !s("text", 20000)) return json({ fehler: "Felder „empfaenger“, „betreff“ und „text“ nötig" }, 400);
  try {
    const id = await inPostausgang({ betriebId: Number(d.betriebId) || null, kanal: "mail", zweck: "api_entwurf", empfaenger: s("empfaenger", 200), betreff: s("betreff", 200), text: s("text", 20000), hinweise: [`Entwurf über die Schnittstelle (${z.name})`] });
    return json({ id, status: "zur_freigabe" }, 201);
  } catch (e) {
    return json({ fehler: e instanceof Error ? e.message : "Fehler" }, 400);
  }
}
