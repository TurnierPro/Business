import Link from "next/link";
import { suche } from "@/lib/suche";

export const metadata = { title: "Suche" };

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
      <section className="karte abstand">
        {q.trim().length < 2 ? <p className="leise">Mindestens zwei Zeichen eingeben.</p> : treffer.length ? (
          <ul className="liste">
            {treffer.map((t) => (
              <li key={t.art + t.href + t.titel}><div><div className="titel"><Link href={t.href}>{t.titel}</Link></div><div className="unter">{t.art}{t.unter ? ` · ${t.unter}` : ""}</div></div></li>
            ))}
          </ul>
        ) : <div className="leer"><strong>Nichts gefunden.</strong>Anders schreiben oder weniger Buchstaben.</div>}
      </section>
    </>
  );
}
