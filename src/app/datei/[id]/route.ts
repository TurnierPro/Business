import { aktuellerBenutzer } from "@/lib/auth";
import { dateiGesehen, dateiLesen } from "@/lib/dateien";

// Datei in der Kundenakte (nur angemeldet). Öffnen markiert Dateien vom Kunden als gesehen.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await aktuellerBenutzer())) return new Response("Nicht angemeldet", { status: 401 });
  const id = Number((await params).id);
  const d = await dateiLesen(id);
  if (!d) return new Response("Nicht gefunden", { status: 404 });
  await dateiGesehen(id);
  return new Response(new Uint8Array(d.daten), {
    headers: { "Content-Type": d.typ, "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(d.name)}`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'" },
  });
}
