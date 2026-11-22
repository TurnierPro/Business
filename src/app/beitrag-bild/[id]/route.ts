import { aktuellerBenutzer } from "@/lib/auth";
import { beitragBild } from "@/lib/beitraege";

// Foto eines Beitrags in der Kundenakte (nur angemeldet).
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await aktuellerBenutzer())) return new Response("Nicht angemeldet", { status: 401 });
  const bild = await beitragBild(Number((await params).id));
  if (!bild) return new Response("Nicht gefunden", { status: 404 });
  return new Response(new Uint8Array(bild.daten), { headers: { "Content-Type": bild.typ, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
