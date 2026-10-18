import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { AusgabeFelder } from "@/components/AusgabeFelder";
import { Status } from "@/components/Status";
import { ausgabeLoeschen, ausgabeSpeichern } from "../../../aktionen";

export const metadata = { title: "Ausgabe" };

export default async function Ausgabe({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const db = await getDb();
  const [a] = await db.select().from(schema.ausgaben).where(eq(schema.ausgaben.id, id));
  if (!a) notFound();
  const istPdf = a.belegName?.toLowerCase().endsWith(".pdf");
  return (
    <>
      <Link href="/finanzen" className="zurueck">← Finanzen</Link>
      <div className="kopfzeile"><div><h1>{a.lieferant}</h1><p>Erfasst von {a.erfasstVon}</p></div><Status wert={a.status} /></div>
      {a.status === "pruefen" ? <div className="hinweis">Bitte die Werte mit dem Beleg vergleichen und speichern. Erst dann zählt die Ausgabe als geprüft.</div> : null}
      <div className="raster zwei" style={{ alignItems: "start" }}>
        <section className="karte">
          <h2>Beleg</h2>
          {a.belegPfad ? (
            istPdf ? <iframe className="vorschau" src={`/finanzen-datei/beleg/${a.id}`} title="Beleg" /> : <img src={`/finanzen-datei/beleg/${a.id}`} alt={`Beleg ${a.lieferant}`} style={{ maxWidth: "100%", border: "1px solid var(--linie)" }} />
          ) : <p className="leise">Kein Beleg hochgeladen. Für den Steuerberater bitte nachreichen.</p>}
        </section>
        <section>
          <form action={ausgabeSpeichern} className="karte">
            <input type="hidden" name="id" value={a.id} />
            <AusgabeFelder a={a} />
            <button className="knopf haupt">{a.status === "pruefen" ? "Geprüft, speichern" : "Speichern"}</button>
          </form>
          <form action={ausgabeLoeschen} className="karte">
            <input type="hidden" name="id" value={a.id} />
            <button className="knopf gefahr klein">Ausgabe löschen</button>
          </form>
        </section>
      </div>
    </>
  );
}
