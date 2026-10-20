import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { datumZeit, KANAL, ZWECK } from "@/lib/format";

export const metadata = { title: "Versendet" };

// Alles, was das System verlassen hat: nach Qualitätskontrolle und Freigabe.
export default async function Versendet() {
  const db = await getDb();
  const liste = await db
    .select({ e: schema.postausgang, name: schema.betriebe.name })
    .from(schema.postausgang)
    .leftJoin(schema.betriebe, eq(schema.postausgang.betriebId, schema.betriebe.id))
    .where(eq(schema.postausgang.status, "versendet"))
    .orderBy(desc(schema.postausgang.versendetAm))
    .limit(300);
  return (
    <>
      <div className="kopfzeile"><div><h1>Versendet</h1><p>Jeder Brief, jede Mail, jede Zahlung, die rausgegangen ist, mit Freigabe und Zeitpunkt.</p></div></div>
      <section className="karte" style={{ padding: 0 }}>
        {liste.length ? (
          <table className="tabelle klein">
            <thead><tr><th>Versendet</th><th>Was</th><th className="weg-mobil">An</th><th className="weg-mobil">Freigegeben von</th></tr></thead>
            <tbody>
              {liste.map(({ e, name }) => (
                <tr key={e.id}>
                  <td className="mono" style={{ whiteSpace: "nowrap" }}>{datumZeit(e.versendetAm)}</td>
                  <td><Link href={`/freigaben/${e.id}`}>{ZWECK[e.zweck] ?? e.zweck}</Link> · {KANAL[e.kanal]}<div className="leise">{e.betreff}</div></td>
                  <td className="weg-mobil">{name ?? e.empfaenger}<div className="leise mono">{e.kanal === "mail" ? e.empfaenger : ""}</div></td>
                  <td className="weg-mobil">{e.freigaben.map((f) => f.name).join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <div className="leer"><strong>Noch nichts versendet.</strong>Freigegebene Einträge erscheinen hier.</div>}
      </section>
    </>
  );
}
