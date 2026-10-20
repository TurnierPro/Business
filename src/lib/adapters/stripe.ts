import Stripe from "stripe";

// Stripe: Anzahlung per Checkout, Rechnungen von Stripe, gespeicherte Zahlungsart für Schlusszahlung und Betreuung.
// Ohne STRIPE_SECRET_KEY läuft ein Simulator. Mit ZAHLUNGSWEG=ueberweisung gilt der alte Weg (eigene Rechnungen).

export const zahlungUeberStripe = () => process.env.ZAHLUNGSWEG !== "ueberweisung";
export const stripeEcht = () => !!process.env.STRIPE_SECRET_KEY;

let client: Stripe | undefined;
function stripe(): Stripe {
  client ??= new Stripe(process.env.STRIPE_SECRET_KEY!);
  return client;
}

function steuersatz(): string {
  const id = process.env.STRIPE_STEUERSATZ_ID;
  if (!id) throw new Error("STRIPE_STEUERSATZ_ID fehlt (Steuersatz 19 %, exklusiv, im Stripe-Dashboard anlegen).");
  return id;
}

const idVon = (x: string | { id: string } | null | undefined) => (typeof x === "string" ? x : x?.id ?? null);

export async function checkoutAnzahlung(o: { angebotId: number; betriebId: number; nummer: string; netto: number; titel: string; email: string | null; zurueckUrl: string }): Promise<string> {
  if (!stripeEcht()) return `${o.zurueckUrl}/zahlung-simulator?angebot=${o.angebotId}`;
  const metadata = { angebotId: String(o.angebotId), betriebId: String(o.betriebId) };
  const s = await stripe().checkout.sessions.create({
    mode: "payment",
    locale: "de",
    customer_creation: "always",
    ...(o.email ? { customer_email: o.email } : {}),
    line_items: [{ quantity: 1, tax_rates: [steuersatz()], price_data: { currency: "eur", unit_amount: o.netto, product_data: { name: `Anzahlung 50 %: ${o.titel}`, description: `Angebot ${o.nummer}` } } }],
    // Zahlungsart für Schlusszahlung und Betreuung speichern (Zustimmung im Angebot)
    payment_intent_data: { setup_future_usage: "off_session", description: `Anzahlung Angebot ${o.nummer}`, metadata },
    invoice_creation: { enabled: true, invoice_data: { description: `Anzahlung 50 % laut Angebot ${o.nummer}`, metadata, footer: "Nexova Consulting GmbH · Vielen Dank für Ihren Auftrag." } },
    metadata,
    success_url: `${o.zurueckUrl}?bezahlt=1`,
    cancel_url: `${o.zurueckUrl}?abgebrochen=1`,
  });
  if (!s.url) throw new Error("Stripe hat keinen Zahlungslink geliefert.");
  return s.url;
}

export type StripeRechnung = { id: string; nummer: string; url: string | null; netto: number; bezahlt: boolean };

export async function rechnungLesen(id: string): Promise<StripeRechnung> {
  const inv = await stripe().invoices.retrieve(id);
  return { id: inv.id!, nummer: inv.number ?? inv.id!, url: inv.hosted_invoice_url ?? null, netto: inv.total_excluding_tax ?? inv.subtotal, bezahlt: inv.status === "paid" };
}

export async function sitzungAuswerten(s: Stripe.Checkout.Session) {
  const zahlung = idVon(s.payment_intent) ? await stripe().paymentIntents.retrieve(idVon(s.payment_intent)!) : null;
  return {
    bezahlt: s.payment_status === "paid",
    angebotId: Number(s.metadata?.angebotId),
    kundeId: idVon(s.customer),
    zahlart: idVon(zahlung?.payment_method),
    rechnung: idVon(s.invoice) ? await rechnungLesen(idVon(s.invoice)!) : null,
  };
}

export async function ereignisPruefen(roh: string, signatur: string): Promise<Stripe.Event> {
  if (!process.env.STRIPE_WEBHOOK_SECRET) throw new Error("STRIPE_WEBHOOK_SECRET fehlt");
  return stripe().webhooks.constructEventAsync(roh, signatur, process.env.STRIPE_WEBHOOK_SECRET);
}

/** Schlusszahlung: Rechnung bei Stripe erstellen und mit der gespeicherten Zahlungsart einziehen. */
export async function zieheEin(o: { kundeId: string; zahlart: string; netto: number; beschreibung: string; metadata: Record<string, string> }): Promise<StripeRechnung> {
  if (!stripeEcht()) return { id: `sim_in_${Date.now()}`, nummer: `SIM-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`, url: null, netto: o.netto, bezahlt: true };
  await stripe().invoiceItems.create({ customer: o.kundeId, amount: o.netto, currency: "eur", description: o.beschreibung, tax_rates: [steuersatz()], metadata: o.metadata });
  const entwurf = await stripe().invoices.create({ customer: o.kundeId, collection_method: "charge_automatically", default_payment_method: o.zahlart, pending_invoice_items_behavior: "include", description: o.beschreibung, metadata: o.metadata });
  const fertig = await stripe().invoices.finalizeInvoice(entwurf.id!);
  const ergebnis = await stripe().invoices.pay(fertig.id!, { off_session: true }).catch(() => fertig);
  return { id: ergebnis.id!, nummer: ergebnis.number ?? ergebnis.id!, url: ergebnis.hosted_invoice_url ?? null, netto: o.netto, bezahlt: ergebnis.status === "paid" };
}

/** Betreuung als monatliches Abo mit der gespeicherten Zahlungsart. */
export async function starteAbo(o: { kundeId: string; zahlart: string; monatlich: number; name: string; startAb?: Date; metadata: Record<string, string> }): Promise<string> {
  if (!stripeEcht()) return `sim_abo_${Date.now()}`;
  const produkt = await stripe().products.create({ name: `Betreuung ${o.name}` });
  const abo = await stripe().subscriptions.create({
    customer: o.kundeId,
    default_payment_method: o.zahlart,
    collection_method: "charge_automatically",
    items: [{ price_data: { currency: "eur", product: produkt.id, unit_amount: o.monatlich, recurring: { interval: "month" } }, tax_rates: [steuersatz()] }],
    ...(o.startAb && o.startAb > new Date() ? { trial_end: Math.floor(o.startAb.getTime() / 1000) } : {}),
    metadata: o.metadata,
  });
  return abo.id;
}

/** Abo zum Vertragsende beenden (nach Kündigung). */
export async function beendeAbo(aboId: string, endeAm: Date): Promise<void> {
  if (!stripeEcht() || aboId.startsWith("sim_")) return;
  await stripe().subscriptions.update(aboId, { cancel_at: Math.floor(endeAm.getTime() / 1000) });
}
