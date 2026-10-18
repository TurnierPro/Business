import Link from "next/link";
import { desc, eq, ne } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { Status } from "@/components/Status";
import { datumZeit, KANAL, ZWECK } from "@/lib/format";

export const metadata = { title: "Freigaben" };

export default async function Freigaben() {
  const db = await getDb();
  const p = schema.postausgang;
  const [offen, erledigt] = await Promise.all([
    db.select({ e: p, name: schema.betriebe.name }).from(p).leftJoin(schema.betriebe, eq(p.betriebId, schema.betriebe.id)).where(eq(p.status, "zur_freigabe")).orderBy(p.erstelltAm),
    db.select({ e: p, name: schema.betriebe.name }).from(p).leftJoin(schema.betriebe, eq(p.betriebId, schema.betriebe.id)).where(ne(p.status, "zur_freigabe")).orderBy(desc(p.erstelltAm)).limit(30),
  ]);
  return (
    <>
      <div className="kopfzeile">
        <div>
          <h1>Freigaben</h1>
          <p>Nichts geht raus, bevor einer von euch beiden hier zugestimmt hat.</p>
        </div>
      </div>
      <section className="karte">
        <h2>Wartet auf euch ({offen.length})</h2>
        {offen.length ? (
          <ul className="liste">
            {offen.map(({ e, name }) => (
              <li key={e.id}>
                <div>
                  <div className="titel">{e.betreff}</div>
                  <div className="unter">
                    {ZWECK[e.zweck] ?? e.zweck} · {KANAL[e.kanal]} · {name ?? "–"} · {datumZeit(e.erstelltAm)}
                    {e.noetigeFreigaben > 1 ? ` · ${e.freigaben.length}/${e.noetigeFreigaben} Freigaben` : ""}
                    {e.hinweise.length ? <> · <span style={{ color: "var(--akzent)" }}>{e.hinweise.length} Hinweis{e.hinweise.length > 1 ? "e" : ""}</span></> : null}
                  </div>
                </div>
                <Link className="knopf klein" href={`/freigaben/${e.id}`}>Prüfen</Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="leer"><strong>Alles erledigt.</strong>Neue Einträge erscheinen hier automatisch.</div>
        )}
      </section>
      <section className="karte">
        <h2>Zuletzt erledigt</h2>
        {erledigt.length ? (
          <table className="tabelle">
            <thead><tr><th>Betreff</th><th className="weg-mobil">Betrieb</th><th>Status</th><th className="weg-mobil">Freigabe</th></tr></thead>
            <tbody>
              {erledigt.map(({ e, name }) => (
                <tr key={e.id}>
                  <td><Link href={`/freigaben/${e.id}`}>{e.betreff}</Link><div className="leise klein">{ZWECK[e.zweck] ?? e.zweck}</div></td>
                  <td className="weg-mobil">{name ?? "–"}</td>
                  <td><Status wert={e.status} />{e.fehler ? <div className="klein" style={{ color: "var(--fehler)" }}>{e.fehler}</div> : null}</td>
                  <td className="weg-mobil leise klein">{e.freigaben.map((f) => `${f.name} ${datumZeit(f.am)}`).join(", ") || e.ablehnGrund || "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="leise">Noch nichts.</p>}
      </section>
    </>
  );
}
