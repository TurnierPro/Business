import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { AngebotKonfigurator } from "@/components/AngebotKonfigurator";
import { paketVorschlag, type PaketKey } from "@/lib/pakete";
import { angebotErstellen } from "../../../aktionen";
import { katalogLaden } from "@/lib/katalog-db";

export const metadata = { title: "Angebot erstellen" };

export default async function AngebotErstellen({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const db = await getDb();
  const [b] = await db.select().from(schema.betriebe).where(eq(schema.betriebe.id, id));
  if (!b) notFound();
  const start: PaketKey = paketVorschlag(b.mitarbeiter);
  const katalog = await katalogLaden();
  return (
    <>
      <Link href={`/leads/${id}`} className="zurueck">← {b.name}</Link>
      <div className="kopfzeile"><div><h1>Angebot erstellen</h1><p>Gemeinsam mit {b.inhaber ?? "dem Kunden"} von oben nach unten auswählen. Der Preis unten rechnet sofort mit.</p></div></div>
      <form action={angebotErstellen}>
        <input type="hidden" name="id" value={id} />
        <AngebotKonfigurator gewerk={b.gewerk} startPaket={start} katalog={katalog} email={b.email ?? ""} inhaber={b.inhaber} />
      </form>
    </>
  );
}
