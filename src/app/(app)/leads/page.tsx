import Link from "next/link";
import { and, desc, eq, ilike, inArray, lte, or, SQL, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { Status } from "@/components/Status";
import { datum } from "@/lib/format";
import { wegIndex, wegProzent, wegText } from "@/lib/weg";

export const metadata = { title: "Betriebe" };

const FILTER: { key: string; text: string }[] = [
  { key: "aktiv", text: "Offen" },
  { key: "neu", text: "Einstufen" },
  { key: "besuch", text: "Besuch fällig" },
  { key: "ruhend", text: "Archiv" },
];

// Was als Nächstes bei diesem Betrieb passiert, in einem Satz
const NAECHSTER: Record<string, string> = {
  neu: "Einstufen: interessant oder nicht",
  interessant: "Check, Demo und Brief vorbereiten, Brief freigeben",
  angeschrieben: "Besuch vor Ort",
  termin: "Angebot wird erstellt",
  angebot: "Verträge unterschreiben lassen, nachfassen",
  kunde: "Projekt und Betreuung",
  nicht_interessant: "–",
  gesperrt: "Nicht mehr kontaktieren",
};

export default async function Leads({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; gewerk?: string; ort?: string; wer?: string; sort?: string }> }) {
  const { status = "aktiv", q = "", gewerk = "", ort = "", wer = "", sort = "" } = await searchParams;
  const db = await getDb();
  const b = schema.betriebe;
  const bedingung: Record<string, SQL | undefined> = {
    aktiv: inArray(b.status, ["neu", "interessant", "angeschrieben", "termin", "angebot"]),
    neu: eq(b.status, "neu"),
    besuch: and(eq(b.status, "angeschrieben"), lte(b.besuchAb, new Date())),
    kunde: eq(b.status, "kunde"),
    ruhend: inArray(b.status, ["nicht_interessant", "gesperrt"]),
  };
  const suche = q.trim() ? or(ilike(b.name, `%${q.trim().replace(/[%_]/g, "")}%`), ilike(b.ort, `%${q.trim().replace(/[%_]/g, "")}%`), ilike(b.inhaber, `%${q.trim().replace(/[%_]/g, "")}%`)) : undefined;
  // Filter: Gewerk, Ort, Zuständig; Sortierung
  const auswahl = await db.select({ gewerk: b.gewerk, ort: b.ort, zustaendig: b.zustaendig }).from(b).where(bedingung[status] ?? bedingung.aktiv);
  const gewerke = [...new Set(auswahl.map((x) => x.gewerk).filter(Boolean))].sort();
  const orte = [...new Set(auswahl.map((x) => x.ort).filter((x): x is string => !!x))].sort();
  const personen = [...new Set(auswahl.map((x) => x.zustaendig).filter((x): x is string => !!x))].sort();
  const reihenfolge = sort === "name" ? b.name : sort === "neu" ? desc(b.erstelltAm) : sort === "score" ? desc(b.score) : desc(b.letzteAktivitaet);
  const zeilen = await db.select().from(b).where(and(bedingung[status] ?? bedingung.aktiv, suche, gewerk ? eq(b.gewerk, gewerk) : undefined, ort ? eq(b.ort, ort) : undefined, wer ? eq(b.zustaendig, wer) : undefined)).orderBy(reihenfolge);
  const filterAktiv = !!(q || gewerk || ort || wer || sort);
  const ids = zeilen.map((z) => z.id);
  const [angebote, projekte] = ids.length
    ? await Promise.all([
        db.select().from(schema.angebote).where(inArray(schema.angebote.betriebId, ids)).orderBy(desc(schema.angebote.erstelltAm)),
        db.select().from(schema.projekte).where(inArray(schema.projekte.betriebId, ids)).orderBy(desc(schema.projekte.erstelltAm)),
      ])
    : [[], []];
  const zahlen = Object.fromEntries(await Promise.all(FILTER.map(async (f) => [f.key, (await db.select({ n: sql<number>`count(*)::int` }).from(b).where(bedingung[f.key]))[0].n] as const)));

  return (
    <>
      <div className="kopfzeile">
        <div>
          <h1>Leads</h1>
          <p>Interessenten bis zur Unterschrift. Wer das Angebot angenommen hat, steht unter <Link href="/projekte">Kunden</Link>.</p>
        </div>
        <div className="knopfreihe">
          <details className="mehr">
            <summary className="knopf klein">Mehr</summary>
            <div className="mehr-menue">
              <a className="knopf klein" href="/betriebe-export">Export (CSV)</a>
              <Link className="knopf klein" href="/einstellungen?reiter=import">Import (CSV)</Link>
            </div>
          </details>
          <Link className="knopf klein haupt" href="/leads/neu">+ Lead anlegen</Link>
        </div>
      </div>
      <div className="knopfreihe" style={{ marginBottom: 16, justifyContent: "space-between" }}>
        <nav className="reiter" aria-label="Filter" style={{ margin: 0 }}>
          {FILTER.map((f) => (
            <Link key={f.key} href={`/leads?status=${f.key}`} aria-current={f.key === status ? "page" : undefined}>
              {f.text} <span className="mono leise">{zahlen[f.key]}</span>
            </Link>
          ))}
        </nav>
      </div>
      <form method="get" role="search" className="filterleiste filter-karte" aria-label="Leads filtern">
        <input type="hidden" name="status" value={status} />
        <input name="q" defaultValue={q} placeholder="Suchen: Name, Ort, Inhaber" aria-label="In Leads suchen" />
        <select name="gewerk" defaultValue={gewerk} aria-label="Gewerk"><option value="">Alle Gewerke</option>{gewerke.map((g) => <option key={g}>{g}</option>)}</select>
        <select name="ort" defaultValue={ort} aria-label="Ort"><option value="">Alle Orte</option>{orte.map((o) => <option key={o}>{o}</option>)}</select>
        {personen.length ? <select name="wer" defaultValue={wer} aria-label="Zuständig"><option value="">Alle Zuständigen</option>{personen.map((p) => <option key={p}>{p}</option>)}</select> : null}
        <select name="sort" defaultValue={sort} aria-label="Sortieren"><option value="">Zuletzt aktiv zuerst</option><option value="neu">Neueste zuerst</option><option value="name">nach Name</option><option value="score">nach Score</option></select>
        <button className="knopf klein">Filtern</button>
        {filterAktiv ? <Link className="klein" href={`/leads?status=${status}`}>Filter zurücksetzen</Link> : null}
        <span className="leise klein" style={{ marginLeft: "auto" }}>{zeilen.length} Treffer</span>
      </form>
      {zeilen.length ? (
        <ul className="betriebsliste">
          {zeilen.map((z) => {
            const a = angebote.find((x) => x.betriebId === z.id);
            const p = projekte.find((x) => x.betriebId === z.id);
            const i = wegIndex(z, a, p);
            return (
              <li key={z.id}>
                <Link href={`/leads/${z.id}`} className="betriebszeile">
                  <span className="wer">
                    <span className="name">{z.name}</span>
                    <span className="leise klein">{[z.gewerk, z.ort].filter(Boolean).join(" · ")}{z.zustaendig ? ` · ${z.zustaendig}` : ""}</span>
                  </span>
                  <span className="stand">
                    <span className="klein">{wegText(i)}</span>
                    <span className="portal-balken" aria-hidden="true" style={{ height: 6 }}><span style={{ width: `${wegProzent(i)}%` }} /></span>
                  </span>
                  <span className="naechst klein">{z.status === "angeschrieben" && z.besuchAb && z.besuchAb > new Date() ? `Besuch ab ${datum(z.besuchAb)}` : p ? "Projekt läuft" : NAECHSTER[z.status] ?? ""}</span>
                  <span className="rechts"><Status wert={z.status} /></span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="karte leer"><strong>Hier ist gerade niemand.</strong>{q ? "Anders suchen." : "Oben rechts „+ Lead anlegen“."}</div>
      )}
    </>
  );
}
