import { desc } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { dienste } from "@/lib/adapters/dienste";
import { Status } from "@/components/Status";
import { datumZeit } from "@/lib/format";

export const metadata = { title: "Simulator" };

export default async function Simulator() {
  const db = await getDb();
  const post = await db.select().from(schema.simulatorPost).orderBy(desc(schema.simulatorPost.am)).limit(50);
  const simuliert = dienste().filter((d) => !d.echt);
  return (
    <>
      <div className="kopfzeile">
        <div>
          <h1>Simulator</h1>
          <p>Was hier liegt, hätte das System verschickt. Solange ein Dienst nicht angebunden ist, verlässt nichts das Haus.</p>
        </div>
      </div>
      {simuliert.length ? <div className="hinweis">Im Simulator: {simuliert.map((d) => d.name).join(", ")}.</div> : <div className="hinweis ok">Alle Dienste sind echt angebunden.</div>}
      <section className="karte">
        <h2>Simuliertes Postfach</h2>
        {post.length ? (
          <ul className="liste">
            {post.map((m) => (
              <li key={m.id} style={{ display: "block" }}>
                <details>
                  <summary style={{ cursor: "pointer", display: "flex", justifyContent: "space-between", gap: 16 }}>
                    <span><b>{m.betreff}</b><br /><span className="leise klein">an {m.an} · {datumZeit(m.am)}{m.anhaenge.length ? ` · Anhang: ${m.anhaenge.join(", ")}` : ""}</span></span>
                    <Status wert={m.kanal === "brief" ? "versendet" : "versendet"} />
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
