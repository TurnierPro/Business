import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { getDb, schema } from "../db";
import { protokolliere } from "../protokoll";
import { melde } from "../adapters/push";
import { beendeAbo, checkoutAnzahlung, ereignisPruefen, rechnungLesen, sitzungAuswerten, starteAbo, zieheEin } from "../adapters/stripe";
import { portalLink } from "../kundenportal";
import { PAKETE, PaketKey } from "../pakete";
import { zahlungEingegangen } from "./verkauf";
import { betrieb } from "./gemeinsam";

// Zahlungen über Stripe: Anzahlung im Kundenportal, Schlusszahlung und Betreuung nach eurer Freigabe.

/** Link zur Stripe-Zahlseite für die Anzahlung (nur für angenommene Angebote). */
export async function anzahlungsLink(angebotId: number): Promise<string> {
  const db = await getDb();
  const [a] = await db.select().from(schema.angebote).where(eq(schema.angebote.id, angebotId));
  if (!a || a.status !== "unterschrieben") throw new Error("Für dieses Angebot ist keine Anzahlung offen.");
  const b = await betrieb(a.betriebId);
  return checkoutAnzahlung({
    angebotId,
    betriebId: b.id,
    nummer: `A-${a.erstelltAm.getFullYear()}-${String(a.id).padStart(4, "0")}`,
    netto: Math.round(a.einmalig / 2),
    titel: PAKETE[a.paket as PaketKey].name,
    email: b.email,
    zurueckUrl: await portalLink(b.id),
  });
}

type Eintrag = typeof schema.postausgang.$inferSelect;

/** Wird beim Versand eines freigegebenen Zahlungs-Eintrags aufgerufen. */
export async function fuehreZahlungAus(e: Eintrag): Promise<string> {
  const db = await getDb();
  const b = await betrieb(e.betriebId!);
  if (!b.stripeKundeId || !b.stripeZahlart) throw new Error("Keine gespeicherte Zahlungsart bei Stripe.");
  if (e.zweck === "schlusszahlung") {
    const angebotId = Number(e.meta.angebotId);
    const netto = Number(e.meta.netto);
    const r = await zieheEin({ kundeId: b.stripeKundeId, zahlart: b.stripeZahlart, netto, beschreibung: String(e.meta.beschreibung), metadata: { angebotId: String(angebotId), betriebId: String(b.id) } });
    await db.insert(schema.rechnungen).values({ nummer: r.nummer, lfdNr: 0, jahr: new Date().getFullYear(), betriebId: b.id, angebotId, art: "schluss", netto, status: r.bezahlt ? "bezahlt" : "offen", bezahltAm: r.bezahlt ? new Date() : null, quelle: "stripe", stripeId: r.id, stripeUrl: r.url }).onConflictDoNothing();
    return `Schlusszahlung ${r.nummer} ${r.bezahlt ? "eingezogen" : "angestoßen"}`;
  }
  if (e.zweck === "betreuung_start") {
    const projektId = Number(e.meta.projektId);
    const aboId = await starteAbo({ kundeId: b.stripeKundeId, zahlart: b.stripeZahlart, monatlich: Number(e.meta.monatlich), name: b.name, startAb: e.meta.startAb ? new Date(String(e.meta.startAb)) : undefined, metadata: { projektId: String(projektId), betriebId: String(b.id) } });
    await db.update(schema.projekte).set({ stripeAboId: aboId }).where(eq(schema.projekte.id, projektId));
    return `Betreuung gestartet (${aboId})`;
  }
  if (e.zweck === "betreuung_ende") {
    await beendeAbo(String(e.meta.aboId), new Date(String(e.meta.endeAm)));
    return `Abo endet am ${new Date(String(e.meta.endeAm)).toLocaleDateString("de-DE")}`;
  }
  throw new Error(`Unbekannte Zahlung: ${e.zweck}`);
}

/** Webhook von Stripe: Zahlung eingegangen, Rechnung bezahlt oder fehlgeschlagen. */
export async function stripeEreignis(roh: string, signatur: string): Promise<string> {
  const ev = await ereignisPruefen(roh, signatur);
  const db = await getDb();
  if (ev.type === "checkout.session.completed" || ev.type === "checkout.session.async_payment_succeeded") {
    const s = await sitzungAuswerten(ev.data.object as Stripe.Checkout.Session);
    if (!s.bezahlt) return "Zahlung läuft noch (z. B. SEPA)";
    const projektId = await zahlungEingegangen(s.angebotId, "Stripe", s);
    return `Anzahlung verbucht, Projekt ${projektId}`;
  }
  if (ev.type === "invoice.paid") {
    const inv = ev.data.object as Stripe.Invoice;
    const [vorhanden] = await db.select().from(schema.rechnungen).where(eq(schema.rechnungen.stripeId, inv.id!));
    if (vorhanden) {
      await db.update(schema.rechnungen).set({ status: "bezahlt", bezahltAm: new Date() }).where(eq(schema.rechnungen.id, vorhanden.id));
      return `Rechnung ${vorhanden.nummer} bezahlt`;
    }
    // Monatliche Betreuung aus dem Abo: Rechnung übernehmen
    const kunde = typeof inv.customer === "string" ? inv.customer : inv.customer?.id;
    const [b] = kunde ? await db.select().from(schema.betriebe).where(eq(schema.betriebe.stripeKundeId, kunde)) : [];
    if (!b) return "Rechnung ohne bekannten Kunden";
    const r = await rechnungLesen(inv.id!);
    const [p] = await db.select().from(schema.projekte).where(eq(schema.projekte.betriebId, b.id));
    if (!p?.angebotId || !r.netto) return "Keine Betreuung zu dieser Rechnung";
    await db.insert(schema.rechnungen).values({ nummer: r.nummer, lfdNr: 0, jahr: new Date().getFullYear(), betriebId: b.id, angebotId: p.angebotId, art: "betreuung", netto: r.netto, status: "bezahlt", bezahltAm: new Date(), quelle: "stripe", stripeId: r.id, stripeUrl: r.url }).onConflictDoNothing();
    await protokolliere("Stripe", `Betreuung bezahlt: ${r.nummer}`, b.id);
    return `Betreuungsrechnung ${r.nummer} übernommen`;
  }
  if (ev.type === "invoice.payment_failed" || ev.type === "checkout.session.async_payment_failed") {
    await melde("job", false, "Zahlung fehlgeschlagen", `Stripe meldet: ${ev.type}. Im Stripe-Dashboard prüfen und den Kunden anrufen.`);
    return "Fehlschlag gemeldet";
  }
  return `Ereignis ${ev.type} ignoriert`;
}
