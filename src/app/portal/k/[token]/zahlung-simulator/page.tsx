import { notFound, redirect } from "next/navigation";
import { betriebPerPortal, portalDaten } from "@/lib/kundenportal";
import { zahlungEingegangen } from "@/lib/ablauf/verkauf";
import { stripeEcht } from "@/lib/adapters/stripe";
import { euro, UST, PAKETE, PaketKey } from "@/lib/pakete";

export const metadata = { title: "Zahlung (Simulator)", robots: { index: false } };

// Ersetzt die Zahlseite von Stripe, solange kein STRIPE_SECRET_KEY gesetzt ist. Es fließt kein Geld.
async function zahlen(f: FormData) {
  "use server";
  if (stripeEcht()) notFound();
  const token = String(f.get("token"));
  const b = await betriebPerPortal(token);
  const d = b ? await portalDaten(b.id) : null;
  if (!d?.anzahlungOffen) notFound();
  await zahlungEingegangen(d.anzahlungOffen.id, "Stripe (Simulator)");
  redirect(`/portal/k/${token}?bezahlt=1`);
}

export default async function ZahlungSimulator({ params }: { params: Promise<{ token: string }> }) {
  if (stripeEcht()) notFound();
  const { token } = await params;
  const b = await betriebPerPortal(token);
  if (!b) notFound();
  const d = await portalDaten(b.id);
  if (!d.anzahlungOffen) redirect(`/portal/k/${token}`);
  const netto = Math.round(d.anzahlungOffen.einmalig / 2);
  return (
    <div className="karte">
      <p className="leise mono klein">STRIPE · SIMULATOR</p>
      <h1 style={{ fontSize: 24 }}>Anzahlung 50 %</h1>
      <p style={{ marginTop: 8 }}>{PAKETE[d.anzahlungOffen.paket as PaketKey].name} für {b.name}</p>
      <dl className="daten abstand">
        <dt>Netto</dt><dd className="mono">{euro(netto)}</dd>
        <dt>USt 19 %</dt><dd className="mono">{euro(Math.round(netto * UST))}</dd>
        <dt>Gesamt</dt><dd className="mono"><b>{euro(Math.round(netto * (1 + UST)))}</b></dd>
      </dl>
      <div className="hinweis abstand">Testumgebung: Hier würde die Zahlseite von Stripe erscheinen (Karte oder SEPA-Lastschrift). Es wird kein Geld bewegt.</div>
      <form action={zahlen}>
        <input type="hidden" name="token" value={token} />
        <button className="knopf haupt">Testzahlung ausführen</button>
      </form>
    </div>
  );
}
