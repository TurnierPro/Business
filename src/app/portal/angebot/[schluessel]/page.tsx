import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { pruefeLinkSchluessel } from "@/lib/geheim";
import { PAKETE, PaketKey, euro, UST } from "@/lib/pakete";
import { unterschriftEingegangen } from "@/lib/ablauf/verkauf";

export const metadata = { title: "Ihr Angebot", robots: { index: false } };

async function annehmen(f: FormData) {
  "use server";
  const schluessel = String(f.get("schluessel"));
  const id = pruefeLinkSchluessel("angebot", schluessel);
  if (!id) notFound();
  const name = String(f.get("name") ?? "").trim();
  if (!name || f.get("zustimmung") !== "ja") redirect(`/portal/angebot/${schluessel}?fehler=1`);
  await unterschriftEingegangen(id, `Kunde: ${name} (Annahme im Portal)`);
  redirect(`/portal/angebot/${schluessel}`);
}

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
          <dt>Betreuung</dt><dd className="mono">{euro(a.monatlich)} netto / Monat, 12 Monate Mindestlaufzeit</dd>
          <dt>Zahlung</dt><dd>50 % bei Auftrag, 50 % beim Livegang</dd>
        </dl>
      </div>
      <form action={annehmen} className="karte">
        <h2>Angebot annehmen</h2>
        {fehler ? <div className="hinweis fehler" role="alert">Bitte Namen eintragen und das Häkchen setzen.</div> : null}
        <input type="hidden" name="schluessel" value={schluessel} />
        <label className="feld"><span>Ihr vollständiger Name</span><input name="name" autoComplete="name" required /></label>
        <label className="haken" style={{ marginBottom: 16 }}>
          <input type="checkbox" name="zustimmung" value="ja" required />
          <span>Ich nehme das Angebot im Namen von {b?.name} verbindlich an und habe die Bedingungen im Angebots-PDF gelesen.</span>
        </label>
        <button className="knopf haupt">Verbindlich annehmen</button>
      </form>
    </>
  );
}
