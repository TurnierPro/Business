import { betriebPerPortal } from "@/lib/kundenportal";
import { dateiLesen } from "@/lib/dateien";

// Datei im Kundenportal: nur der eigene Betrieb; Dateien von Levarex erst nach Freigabe der Hinweis-Mail.
export async function GET(_: Request, { params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  const b = await betriebPerPortal(token);
  const d = b ? await dateiLesen(Number(id), { betriebId: b.id, portal: true }) : null;
  if (!d) return new Response("Nicht gefunden", { status: 404 });
  return new Response(new Uint8Array(d.daten), {
    headers: { "Content-Type": d.typ, "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(d.name)}`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex", "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'" },
  });
}
