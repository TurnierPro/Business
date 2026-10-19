import { aktuellerBenutzer } from "@/lib/auth";
import { datei } from "@/lib/unterlagen";

// Abgelegte Datei zu einer Unterlage, nur für angemeldete Gründer.
export async function GET(_: Request, { params }: { params: Promise<{ key: string }> }) {
  if (!(await aktuellerBenutzer())) return new Response("Nicht angemeldet", { status: 401 });
  const d = await datei((await params).key);
  if (!d) return new Response("Keine Datei", { status: 404 });
  return new Response(new Uint8Array(d.inhalt), {
    headers: { "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename="${encodeURIComponent(d.name)}"`, "Cache-Control": "no-store" },
  });
}
