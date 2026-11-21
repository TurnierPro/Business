import Link from "next/link";
import { desc, eq, ne } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { Status } from "@/components/Status";
import { datumZeit, KANAL, ZWECK } from "@/lib/format";

export const metadata = { title: "Freigaben" };

// Gruppen nach Art, damit man gezielt z. B. alle Rechnungen am Stück prüfen kann
const GRUPPEN: { key: string; name: string; zwecke: string[] }[] = [
  { key: "akquise", name: "Akquise", zwecke: ["akquise_brief"] },
  { key: "verkauf", name: "Angebote und Verträge", zwecke: ["angebot", "auftragsbestaetigung", "portal_zugang"] },
  { key: "geld", name: "Rechnungen und Zahlungen", zwecke: ["rechnung", "schlussrechnung", "betreuungsrechnung", "zahlungserinnerung", "mahnung1", "mahnung2", "lastschrift_start", "lastschrift_ende", "kuendigung"] },
  { key: "projekt", name: "Projekte", zwecke: ["kickoff", "inhalte_eingang", "abnahme_aufforderung", "abnahme_bestaetigung", "livegang", "umzug_anleitung", "umzug_fertig", "monatsreport"] },
];
const gruppeVon = (zweck: string) => GRUPPEN.find((g) => g.zwecke.includes(zweck))?.key ?? "sonstiges";
const QK_REIHENFOLGE: Record<string, number> = { blockiert: 0, hinweise: 1, ausstehend: 2, bestanden: 3 };

export default async function Freigaben({ searchParams }: { searchParams: Promise<{ art?: string }> }) {
  const { art = "alle" } = await searchParams;
  const db = await getDb();
  const p = schema.postausgang;
  const [alleOffen, erledigt] = await Promise.all([
    db.select({ e: p, name: schema.betriebe.name }).from(p).leftJoin(schema.betriebe, eq(p.betriebId, schema.betriebe.id)).where(eq(p.status, "zur_freigabe")).orderBy(p.erstelltAm),
    db.select({ e: p, name: schema.betriebe.name }).from(p).leftJoin(schema.betriebe, eq(p.betriebId, schema.betriebe.id)).where(ne(p.status, "zur_freigabe")).orderBy(desc(p.erstelltAm)).limit(30),
  ]);
  const offen = alleOffen.filter((x) => art === "alle" || gruppeVon(x.e.zweck) === art).sort((a, b) => (QK_REIHENFOLGE[a.e.qkStatus] ?? 9) - (QK_REIHENFOLGE[b.e.qkStatus] ?? 9) || a.e.erstelltAm.getTime() - b.e.erstelltAm.getTime());
  const zahl = (key: string) => alleOffen.filter((x) => gruppeVon(x.e.zweck) === key).length;
  const filter = [{ key: "alle", name: "Alle", n: alleOffen.length }, ...GRUPPEN.map((g) => ({ key: g.key, name: g.name, n: zahl(g.key) })), { key: "sonstiges", name: "Sonstiges", n: zahl("sonstiges") }].filter((f) => f.key === "alle" || f.n > 0);
  return (
    <>
      <div className="kopfzeile">
        <div>
          <h1>Freigaben</h1>
          <p>Nichts geht an Kunden, bevor einer von euch hier zugestimmt hat. Rot zuerst beheben, Gelb lesen, Grün kann raus.</p>
        </div>
      </div>
      <nav className="reiter" aria-label="Nach Art filtern">
        {filter.map((f) => <Link key={f.key} href={`/freigaben?art=${f.key}`} aria-current={art === f.key ? "page" : undefined}>{f.name} <span className="mono leise">{f.n}</span></Link>)}
      </nav>
      {offen.length ? (
        <ul className="betriebsliste">
          {offen.map(({ e, name }) => (
            <li key={e.id}>
              <Link href={`/freigaben/${e.id}`} className="betriebszeile freigabezeile">
                <span className="wer">
                  <span className="name">{name ?? "Levarex intern"}</span>
                  <span className="leise klein">{ZWECK[e.zweck] ?? e.zweck} · {KANAL[e.kanal] ?? e.kanal}</span>
                </span>
                <span className="naechst klein" style={{ color: "var(--text)" }}>{e.betreff}<br /><span className="leise">{datumZeit(e.erstelltAm)}{e.noetigeFreigaben > 1 ? ` · ${e.freigaben.length} von ${e.noetigeFreigaben} Freigaben` : ""}</span></span>
                <span className="klein">{e.hinweise.length ? `${e.hinweise.length} Hinweis${e.hinweise.length > 1 ? "e" : ""}` : <span className="leise">keine Hinweise</span>}</span>
                <span className="rechts knopfreihe" style={{ gap: 10 }}><Status wert={e.qkStatus} /><span className="knopf klein">Prüfen</span></span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="karte leer"><strong>{art === "alle" ? "Alles erledigt." : "Hier wartet nichts."}</strong>Neue Einträge erscheinen automatisch.</div>
      )}
      <details className="karte abstand">
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>Zuletzt erledigt ({erledigt.length})</summary>
        {erledigt.length ? (
          <table className="tabelle" style={{ marginTop: 12 }}>
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
      </details>
    </>
  );
}
