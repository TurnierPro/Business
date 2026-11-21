import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { pruefeLinkSchluessel } from "@/lib/geheim";
import { PAKETE, PaketKey, euro, UST } from "@/lib/pakete";
import { laufzeitSumme } from "@/lib/katalog";

export const metadata = { title: "Ihr Angebot", robots: { index: false } };

export default async function Angebot({ params, searchParams }: { params: Promise<{ schluessel: string }>; searchParams: Promise<{ fehler?: string }> }) {
  const { schluessel } = await params;
  const id = pruefeLinkSchluessel("angebot", schluessel);
  if (!id) notFound();
  const db = await getDb();
  const [a] = await db.select().from(schema.angebote).where(eq(schema.angebote.id, id));
  if (!a) notFound();
  const [b] = await db.select().from(schema.betriebe).where(eq(schema.betriebe.id, a.betriebId));
  const p = PAKETE[a.paket as PaketKey];
  const { fehler } = await searchParams;

  if (a.status !== "versendet") {
    return (
      <div className="karte">
        <h1>Vielen Dank.</h1>
        <p style={{ marginTop: 12 }}>Ihr Angebot ist angenommen. Sie bekommen in Kürze die Rechnung über die Anzahlung. Danach schicken wir Ihnen den Zugang für Texte und Fotos.</p>
      </div>
    );
  }
  return (
    <>
      <h1>Ihr Angebot: {p.name}</h1>
      <p className="leise" style={{ marginTop: 8 }}>für {b?.name}</p>
      <div className="karte abstand">
        <h2>Was Sie bekommen</h2>
        <ul>{p.inhalt.map((i) => <li key={i}>{i}</li>)}</ul>
        <dl className="daten abstand">
          <dt>Einmalig</dt><dd className="mono">{euro(a.einmalig)} netto ({euro(Math.round(a.einmalig * (1 + UST)))} brutto)</dd>
          <dt>Monatsbeitrag</dt><dd className="mono">{euro(a.monatlich)} netto / Monat, Laufzeit 24 Monate ab Livegang</dd>
          <dt>Gesamt 24 Monate</dt><dd className="mono">{euro(laufzeitSumme(a.einmalig, a.monatlich).gesamt)} netto, Ø {euro(laufzeitSumme(a.einmalig, a.monatlich).schnitt)} im Monat</dd>
          <dt>Zahlung</dt><dd>50 % bei Unterschrift, 50 % beim Livegang nach der Abnahme</dd>
        </dl>
      </div>
      <section className="karte">
        <h2>Unterschrift</h2>
        <p>Unterschrieben wird beim Termin mit Daniel Lück auf dem Tablet: der Rahmenvertrag und je Baustein ein Leistungsschein. Fragen vorab? Rufen Sie uns an.</p>
      </section>
    </>
  );
}
