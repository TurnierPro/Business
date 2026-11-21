import Link from "next/link";
import { suche } from "@/lib/suche";

export const metadata = { title: "Suche" };

const ARTEN = ["Betrieb", "Kontakt", "Projekt", "Rechnung", "Ticket", "Dokument"];
const MEHRZAHL: Record<string, string> = { Betrieb: "Betriebe", Kontakt: "Ansprechpartner", Projekt: "Projekte", Rechnung: "Rechnungen", Ticket: "Tickets", Dokument: "Dokumente" };

export default async function Suche({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const treffer = await suche(q);
  return (
    <>
      <div className="kopfzeile"><div><h1>Suche</h1><p>Betriebe, Ansprechpartner, Projekte, Rechnungen, Tickets und Dokumente.</p></div></div>
      <form method="get" role="search" className="knopfreihe">
        <input name="q" defaultValue={q} placeholder="Name, Ort, Telefon, Rechnungsnummer, T-0001 …" aria-label="Suchbegriff" style={{ maxWidth: 480 }} autoFocus />
        <button className="knopf">Suchen</button>
      </form>
      {q.trim().length < 2 ? <p className="leise abstand">Mindestens zwei Zeichen eingeben.</p> : treffer.length ? (
        <>
          <p className="leise klein abstand">{treffer.length} Treffer für „{q}“</p>
          <div className="suche-raster">
            {ARTEN.filter((a) => treffer.some((t) => t.art === a)).map((a) => (
              <section key={a} className="karte">
                <h2>{MEHRZAHL[a] ?? a} <span className="anzahl-pille">{treffer.filter((t) => t.art === a).length}</span></h2>
                <ul className="liste">
                  {treffer.filter((t) => t.art === a).map((t) => (
                    <li key={t.href + t.titel}>
                      <div style={{ minWidth: 0 }}><div className="titel"><Link href={t.href} target={t.neu ? "_blank" : undefined}>{t.titel}</Link></div>{t.unter ? <div className="unter">{t.unter}</div> : null}</div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </>
      ) : <div className="karte leer abstand"><strong>Nichts gefunden.</strong>Anders schreiben oder weniger Buchstaben.</div>}
    </>
  );
}
