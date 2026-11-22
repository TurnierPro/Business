import { desc } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { dienste } from "@/lib/adapters/dienste";
import { datumZeit } from "@/lib/format";
import { AufEinenBlick, SeitenKopf } from "@/components/Seite";

export const metadata = { title: "Simulator" };

export default async function Simulator() {
  const db = await getDb();
  const post = await db.select().from(schema.simulatorPost).orderBy(desc(schema.simulatorPost.am)).limit(50);
  const simuliert = dienste().filter((d) => !d.echt);
  return (
    <>
      <SeitenKopf titel="Simulator-Postfach" text="Was hier liegt, hätte das System verschickt. Solange ein Dienst nicht angebunden ist, verlässt nichts das Haus." />
      <AufEinenBlick werte={[
        { wert: post.length, name: "simulierte Sendungen (neueste 50)" },
        { wert: post.filter((m) => m.kanal === "mail").length, name: "E-Mails" },
        { wert: post.filter((m) => m.kanal === "brief").length, name: "Briefe" },
        { wert: simuliert.length, name: "Dienste noch im Simulator", ton: simuliert.length ? "warten" : "ok" },
      ]} />
      {simuliert.length ? <p className="leise klein" style={{ margin: "0 0 12px" }}>Im Simulator: {simuliert.map((d) => d.name).join(", ")}.</p> : null}
      <section className="karte">
        <h2>Simuliertes Postfach</h2>
        {post.length ? (
          <ul className="liste">
            {post.map((m) => (
              <li key={m.id} style={{ display: "block" }}>
                <details>
                  <summary style={{ cursor: "pointer", display: "flex", justifyContent: "space-between", gap: 16 }}>
                    <span><b>{m.betreff}</b><br /><span className="leise klein">an {m.an} · {datumZeit(m.am)}{m.anhaenge.length ? ` · Anhang: ${m.anhaenge.join(", ")}` : ""}</span></span>
                    <span className="marke-klein">{m.kanal === "brief" ? "Brief" : m.kanal === "mail" ? "E-Mail" : m.kanal}</span>
                  </summary>
                  <div className="textblock" style={{ marginTop: 12 }}>{m.text}</div>
                </details>
              </li>
            ))}
          </ul>
        ) : <div className="leer"><strong>Noch nichts verschickt.</strong>Gib einen Eintrag unter Freigaben frei, dann landet er hier.</div>}
      </section>
    </>
  );
}
