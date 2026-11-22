import { betriebPerPortal } from "@/lib/kundenportal";
import { beitragBild } from "@/lib/beitraege";

// Foto eines Beitrags im Kundenportal: nur für den eigenen Betrieb und erst nach der Vorlage.
export async function GET(_: Request, { params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  const b = await betriebPerPortal(token);
  const bild = b ? await beitragBild(Number(id), { betriebId: b.id, nurSichtbar: true }) : null;
  if (!bild) return new Response("Nicht gefunden", { status: 404 });
  return new Response(new Uint8Array(bild.daten), { headers: { "Content-Type": bild.typ, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex" } });
}
