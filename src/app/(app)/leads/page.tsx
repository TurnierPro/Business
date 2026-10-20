import Link from "next/link";
import { and, desc, eq, ilike, inArray, lte, or, SQL, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { Status } from "@/components/Status";
import { datum } from "@/lib/format";
import { wochenlaufStarten } from "../aktionen";

export const metadata = { title: "Betriebe" };

const FILTER: { key: string; text: string }[] = [
  { key: "aktiv", text: "Offen" },
  { key: "neu", text: "Einstufen" },
  { key: "besuch", text: "Besuch fällig" },
  { key: "kunde", text: "Kunden" },
  { key: "ruhend", text: "Archiv" },
];

// Was als Nächstes bei diesem Betrieb passiert, in einem Satz
const NAECHSTER: Record<string, string> = {
  neu: "Einstufen: interessant oder nicht",
  interessant: "Check, Demo und Brief werden vorbereitet",
  angeschrieben: "Besuch vor Ort",
  termin: "Angebot wird erstellt",
  angebot: "Auf Annahme warten, nachfassen",
  kunde: "Projekt und Betreuung",
  nicht_interessant: "–",
  gesperrt: "Nicht mehr kontaktieren",
};

export default async function Leads({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const { status = "aktiv", q = "" } = await searchParams;
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
  const zeilen = await db.select().from(b).where(and(bedingung[status] ?? bedingung.aktiv, suche)).orderBy(desc(b.letzteAktivitaet));
  const zahlen = Object.fromEntries(await Promise.all(FILTER.map(async (f) => [f.key, (await db.select({ n: sql<number>`count(*)::int` }).from(b).where(bedingung[f.key]))[0].n] as const)));

  return (
    <>
      <div className="kopfzeile">
        <div>
          <h1>Leads und Kunden</h1>
          <p>Alle Betriebe vom ersten Fund bis zur Betreuung.</p>
        </div>
        <div className="knopfreihe">
          <details className="mehr">
            <summary className="knopf klein">Mehr</summary>
            <div className="mehr-menue">
              <form action={wochenlaufStarten}><button className="knopf klein">Wochenlauf jetzt starten</button></form>
              <a className="knopf klein" href="/betriebe-export">Export (CSV)</a>
              <Link className="knopf klein" href="/einstellungen">Import (CSV)</Link>
            </div>
          </details>
          <Link className="knopf haupt" href="/leads/neu">Lead anlegen</Link>
        </div>
      </div>
      <div className="knopfreihe" style={{ marginBottom: 16, justifyContent: "space-between" }}>
        <nav className="knopfreihe" aria-label="Filter">
          {FILTER.map((f) => (
            <Link key={f.key} href={`/leads?status=${f.key}`} className="knopf klein" aria-current={f.key === status ? "page" : undefined} style={f.key === status ? { borderColor: "var(--akzent)", color: "var(--text)" } : { color: "var(--leise)" }}>
              {f.text} <span className="mono">{zahlen[f.key]}</span>
            </Link>
          ))}
        </nav>
        <form method="get" role="search" className="knopfreihe">
          <input type="hidden" name="status" value={status} />
          <input name="q" defaultValue={q} placeholder="Name, Ort, Inhaber" aria-label="In Leads suchen" style={{ width: 220 }} />
        </form>
      </div>
      <div className="karte" style={{ padding: 0 }}>
        {zeilen.length ? (
          <table className="tabelle">
            <thead>
              <tr><th>Betrieb</th><th className="weg-mobil">Nächster Schritt</th><th>Status</th><th className="weg-mobil">Zuständig</th></tr>
            </thead>
            <tbody>
              {zeilen.map((z) => (
                <tr key={z.id}>
                  <td><Link href={`/leads/${z.id}`}>{z.name}</Link><div className="leise klein">{[z.gewerk, z.ort].filter(Boolean).join(" · ")}</div></td>
                  <td className="weg-mobil klein">{z.status === "angeschrieben" && z.besuchAb && z.besuchAb > new Date() ? `Besuch ab ${datum(z.besuchAb)}` : NAECHSTER[z.status] ?? ""}</td>
                  <td><Status wert={z.status} /></td>
                  <td className="weg-mobil klein leise">{z.zustaendig ?? "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="leer"><strong>Hier ist gerade niemand.</strong>{q ? "Anders suchen." : "Lead anlegen oder unter „Mehr“ den Wochenlauf starten."}</div>
        )}
      </div>
    </>
  );
}
