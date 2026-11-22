import { betriebPerPortal } from "@/lib/kundenportal";
import { portalDemo } from "@/lib/demos";
import { demoAntwort } from "@/lib/demo-auslieferung";

// Demo im Kundenportal: nur mit gültigem Portal-Link und nur, wenn die Demo freigegeben und versendet ist.
export async function GET(_: Request, { params }: { params: Promise<{ token: string; id: string; pfad?: string[] }> }) {
  const { token, id, pfad = [] } = await params;
  const b = await betriebPerPortal(token);
  const demo = b ? await portalDemo(b.id, Number(id)) : null;
  if (!demo) return new Response("Nicht gefunden", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  return demoAntwort(demo.id, pfad);
}
