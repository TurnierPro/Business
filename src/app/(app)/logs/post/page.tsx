import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { datumZeit, KANAL, ZWECK } from "@/lib/format";
import { AufEinenBlick, SeitenKopf, SeitenReiter, reiterWahl } from "@/components/Seite";

export const metadata = { title: "Versendet" };

// Alles, was das System verlassen hat: nach Qualitätskontrolle und Freigabe.
export default async function Versendet({ searchParams }: { searchParams: Promise<{ reiter?: string }> }) {
  const db = await getDb();
  const liste = await db
    .select({ e: schema.postausgang, name: schema.betriebe.name })
    .from(schema.postausgang)
    .leftJoin(schema.betriebe, eq(schema.postausgang.betriebId, schema.betriebe.id))
    .where(eq(schema.postausgang.status, "versendet"))
    .orderBy(desc(schema.postausgang.versendetAm))
    .limit(500);
  const kanaele = [...new Set(liste.map((x) => x.e.kanal))];
  const reiterListe = [{ key: "alle", name: "Alle", zahl: liste.length }, ...kanaele.map((k) => ({ key: k, name: KANAL[k] ?? k, zahl: liste.filter((x) => x.e.kanal === k).length }))];
  const reiter = reiterWahl((await searchParams).reiter, reiterListe);
  const sichtbar = reiter === "alle" ? liste : liste.filter((x) => x.e.kanal === reiter);
  const seit30 = Date.now() - 30 * 864e5;
  return (
    <>
      <SeitenKopf titel="Versendet" text="Jeder Brief, jede Mail, jede Zahlung, die rausgegangen ist, mit Freigabe und Zeitpunkt." />
      <AufEinenBlick werte={[
        { wert: liste.length, name: "versendet insgesamt" },
        { wert: liste.filter((x) => x.e.versendetAm && x.e.versendetAm.getTime() > seit30).length, name: "in den letzten 30 Tagen" },
        { wert: liste.filter((x) => x.e.kanal === "mail").length, name: "E-Mails" },
        { wert: liste.filter((x) => x.e.kanal === "brief").length, name: "Briefe" },
      ]} />
      <SeitenReiter basis="/logs/post" aktiv={reiter} liste={reiterListe} />
      <section className="karte" style={{ padding: 0 }}>
        {sichtbar.length ? (
          <table className="tabelle klein">
            <thead><tr><th>Versendet</th><th>Was</th><th className="weg-mobil">An</th><th className="weg-mobil">Freigegeben von</th></tr></thead>
            <tbody>
              {sichtbar.map(({ e, name }) => (
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
