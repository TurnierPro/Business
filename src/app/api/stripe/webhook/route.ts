import { stripeEreignis } from "@/lib/ablauf/zahlung";

// Stripe meldet hier Zahlungen. Die Signatur wird geprüft, gefälschte Aufrufe werden abgelehnt.
// In Stripe einrichten: Endpunkt <BASE_URL>/api/stripe/webhook mit den Ereignissen
// checkout.session.completed, checkout.session.async_payment_succeeded, checkout.session.async_payment_failed,
// invoice.paid, invoice.payment_failed. Das Geheimnis als STRIPE_WEBHOOK_SECRET setzen.
export async function POST(req: Request) {
  const signatur = req.headers.get("stripe-signature");
  if (!signatur) return new Response("Signatur fehlt", { status: 400 });
  try {
    const ergebnis = await stripeEreignis(await req.text(), signatur);
    return Response.json({ ok: true, ergebnis });
  } catch (e) {
    const meldung = e instanceof Error ? e.message : String(e);
    console.error("[stripe]", meldung);
    return Response.json({ ok: false, fehler: meldung }, { status: 400 });
  }
}
