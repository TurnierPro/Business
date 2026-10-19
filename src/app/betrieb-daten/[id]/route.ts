import { aktuellerBenutzer } from "@/lib/auth";
import { datenauskunft } from "@/lib/ablauf/datenschutz";

// Datenauskunft nach Art. 15 DSGVO als Datei, nur für angemeldete Gründer.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const b = await aktuellerBenutzer();
  if (!b) return new Response("Nicht angemeldet", { status: 401 });
  const id = Number((await params).id);
  try {
    const daten = await datenauskunft(id, b.name);
    return new Response(JSON.stringify(daten, null, 2), {
      headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="datenauskunft-${id}.json"`, "Cache-Control": "no-store" },
    });
  } catch {
    return new Response("Nicht gefunden", { status: 404 });
  }
}
