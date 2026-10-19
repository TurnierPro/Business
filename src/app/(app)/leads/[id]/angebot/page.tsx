import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { AngebotKonfigurator } from "@/components/AngebotKonfigurator";
import type { PaketKey } from "@/lib/pakete";
import { angebotErstellen } from "../../../aktionen";

export const metadata = { title: "Angebot erstellen" };

export default async function AngebotErstellen({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const db = await getDb();
  const [b] = await db.select().from(schema.betriebe).where(eq(schema.betriebe.id, id));
  if (!b) notFound();
  const start: PaketKey = b.gewerk === "Kfz" ? "S_WERKSTATT" : (b.mitarbeiter ?? 10) < 10 ? "S" : "M";
  return (
    <>
      <Link href={`/leads/${id}`} className="zurueck">← {b.name}</Link>
      <div className="kopfzeile"><div><h1>Angebot erstellen</h1><p>Gemeinsam mit {b.inhaber ?? "dem Kunden"} auswählen. Der Preis rechnet sofort mit.</p></div></div>
      <form action={angebotErstellen}>
        <input type="hidden" name="id" value={id} />
        <section className="karte" style={{ marginBottom: 16 }}>
          <label className="feld" style={{ marginBottom: 0 }}><span>E-Mail-Adresse des Kunden (für Angebot und Portal-Link)</span><input name="email" type="email" required defaultValue={b.email ?? ""} placeholder="name@betrieb.de" /></label>
        </section>
        <AngebotKonfigurator gewerk={b.gewerk} startPaket={start} />
      </form>
    </>
  );
}
