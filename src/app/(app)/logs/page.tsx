import Link from "next/link";
import { and, desc, eq, gte, ilike, or } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { datumZeit } from "@/lib/format";
import { Status } from "@/components/Status";

export const metadata = { title: "Protokoll" };

// Wer hat wann was getan (Nachweis nach Art. 5 Abs. 2 DSGVO), dazu Systemmeldungen.
export default async function Logs({ searchParams }: { searchParams: Promise<{ q?: string; tage?: string }> }) {
  const { q = "", tage = "7" } = await searchParams;
  const db = await getDb();
  const seit = new Date(Date.now() - Math.min(365, Math.max(1, Number(tage) || 7)) * 864e5);
  const m = `%${q.trim().replace(/[%_]/g, "")}%`;
  const [eintraege, meldungen] = await Promise.all([
    db
      .select({ p: schema.protokoll, betrieb: schema.betriebe.name })
      .from(schema.protokoll)
      .leftJoin(schema.betriebe, eq(schema.protokoll.betriebId, schema.betriebe.id))
      .where(and(gte(schema.protokoll.am, seit), q.trim() ? or(ilike(schema.protokoll.aktion, m), ilike(schema.protokoll.wer, m), ilike(schema.betriebe.name, m)) : undefined))
      .orderBy(desc(schema.protokoll.am))
      .limit(300),
    db.select().from(schema.meldungen).where(gte(schema.meldungen.am, seit)).orderBy(desc(schema.meldungen.am)).limit(50),
  ]);
  return (
    <>
      <div className="kopfzeile"><div><h1>Protokoll</h1><p>Alles, was in Nexova OS passiert: wer, wann, was. Automatisch, nicht änderbar, nach 3 Jahren gelöscht.</p></div></div>
      <form method="get" className="knopfreihe" role="search" style={{ marginBottom: 16 }}>
        <input name="q" defaultValue={q} placeholder="Suchen: Person, Betrieb, Aktion" aria-label="Protokoll durchsuchen" style={{ maxWidth: 320 }} />
        <select name="tage" defaultValue={tage} aria-label="Zeitraum" style={{ width: "auto" }}><option value="1">Heute</option><option value="7">7 Tage</option><option value="30">30 Tage</option><option value="365">1 Jahr</option></select>
        <button className="knopf">Anzeigen</button>
      </form>
      <div className="raster zwei" style={{ alignItems: "start" }}>
        <section className="karte" style={{ padding: 0 }}>
          {eintraege.length ? (
            <table className="tabelle klein">
              <thead><tr><th>Zeit</th><th>Wer</th><th>Was</th></tr></thead>
              <tbody>
                {eintraege.map(({ p, betrieb }) => (
                  <tr key={p.id}>
                    <td className="mono" style={{ whiteSpace: "nowrap" }}>{datumZeit(p.am)}</td>
                    <td>{p.wer}</td>
                    <td>{p.aktion}{betrieb && p.betriebId ? <> · <Link href={`/leads/${p.betriebId}`}>{betrieb}</Link></> : null}{p.detail ? <div className="leise">{p.detail}</div> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <div className="leer"><strong>Keine Einträge.</strong>Anderen Zeitraum wählen.</div>}
        </section>
        <section className="karte">
          <h2>Systemmeldungen</h2>
          {meldungen.length ? <ul className="liste">{meldungen.map((x) => <li key={x.id}><div style={{ flex: 1 }}><div className="titel">{x.titel}</div><div className="unter">{datumZeit(x.am)}{x.detail ? ` · ${x.detail.slice(0, 160)}` : ""}</div></div><Status wert={x.ok ? "fertig" : "fehler"} /></li>)}</ul> : <p className="leise">Keine Meldungen im Zeitraum.</p>}
        </section>
      </div>
    </>
  );
}
