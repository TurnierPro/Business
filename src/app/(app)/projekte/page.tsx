import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { Status } from "@/components/Status";
import { datum } from "@/lib/format";
import { PAKETE, PaketKey } from "@/lib/pakete";

export const metadata = { title: "Projekte" };

export default async function Projekte() {
  const db = await getDb();
  const zeilen = await db.select({ p: schema.projekte, name: schema.betriebe.name }).from(schema.projekte).innerJoin(schema.betriebe, eq(schema.projekte.betriebId, schema.betriebe.id)).orderBy(desc(schema.projekte.erstelltAm));
  return (
    <>
      <div className="kopfzeile"><div><h1>Projekte</h1><p>Von den Inhalten des Kunden bis zur Seite, die live ist und überwacht wird.</p></div></div>
      <div className="karte" style={{ padding: 0 }}>
        {zeilen.length ? (
          <table className="tabelle">
            <thead><tr><th>Kunde</th><th>Paket</th><th>Status</th><th className="weg-mobil">Live seit</th></tr></thead>
            <tbody>
              {zeilen.map(({ p, name }) => (
                <tr key={p.id}>
                  <td><Link href={`/projekte/${p.id}`}>{name}</Link>{p.domain ? <div className="leise klein mono">{p.domain}</div> : null}</td>
                  <td>{PAKETE[p.paket as PaketKey]?.name ?? p.paket}</td>
                  <td><Status wert={p.status} /></td>
                  <td className="weg-mobil mono klein">{datum(p.liveAm)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="leer"><strong>Noch keine Projekte.</strong>Ein Projekt entsteht automatisch, wenn die Anzahlung da ist.</div>
        )}
      </div>
    </>
  );
}
