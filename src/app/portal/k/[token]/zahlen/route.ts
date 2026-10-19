import { betriebPerPortal, portalDaten } from "@/lib/kundenportal";
import { anzahlungsLink } from "@/lib/ablauf/zahlung";
import { basisUrl } from "@/lib/ablauf/gemeinsam";

// Leitet den Kunden zur Zahlseite von Stripe (oder zum Simulator) für die Anzahlung.
export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const b = await betriebPerPortal(token);
  if (!b) return new Response("Nicht gefunden", { status: 404 });
  const d = await portalDaten(b.id);
  if (!d.anzahlungOffen) return Response.redirect(`${basisUrl()}/portal/k/${token}`, 303);
  return Response.redirect(await anzahlungsLink(d.anzahlungOffen.id), 303);
}
