import Link from "next/link";
import { and, desc, eq, inArray, lte, SQL } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { Status } from "@/components/Status";
import { datum } from "@/lib/format";
import { wochenlaufStarten } from "../aktionen";

export const metadata = { title: "Betriebe" };

const FILTER: { key: string; text: string }[] = [
  { key: "aktiv", text: "Aktiv" },
  { key: "neu", text: "Neu" },
  { key: "interessant", text: "Interessant" },
  { key: "besuch", text: "Besuch fällig" },
  { key: "verkauf", text: "Termin & Angebot" },
  { key: "kunde", text: "Kunden" },
  { key: "ruhend", text: "Nicht interessant / gesperrt" },
];

export default async function Leads({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status = "aktiv" } = await searchParams;
  const db = await getDb();
  const b = schema.betriebe;
  const bedingung: Record<string, SQL | undefined> = {
    aktiv: inArray(b.status, ["neu", "interessant", "angeschrieben", "termin", "angebot"]),
    neu: eq(b.status, "neu"),
    interessant: eq(b.status, "interessant"),
    besuch: and(eq(b.status, "angeschrieben"), lte(b.besuchAb, new Date())),
    verkauf: inArray(b.status, ["termin", "angebot"]),
    kunde: eq(b.status, "kunde"),
    ruhend: inArray(b.status, ["nicht_interessant", "gesperrt"]),
  };
  const zeilen = await db.select().from(b).where(bedingung[status] ?? bedingung.aktiv).orderBy(desc(b.score), desc(b.erstelltAm));

  return (
    <>
      <div className="kopfzeile">
        <div>
          <h1>Betriebe</h1>
          <p>Leads und Kunden vom ersten Fund bis zur Betreuung.</p>
        </div>
        <div className="knopfreihe">
          <form action={wochenlaufStarten}><button className="knopf">Wochenlauf jetzt starten</button></form>
          <a className="knopf klein" href="/betriebe-export">Export (CSV)</a>
          <Link className="knopf klein" href="/einstellungen">Import</Link>
          <Link className="knopf haupt" href="/leads/neu">Lead anlegen</Link>
        </div>
      </div>
      <nav className="knopfreihe" aria-label="Filter" style={{ marginBottom: 16 }}>
        {FILTER.map((f) => (
          <Link key={f.key} href={`/leads?status=${f.key}`} className="knopf klein" aria-current={f.key === status ? "page" : undefined} style={f.key === status ? { borderColor: "var(--akzent)", color: "var(--text)" } : { color: "var(--leise)" }}>
            {f.text}
          </Link>
        ))}
      </nav>
      <div className="karte" style={{ padding: 0 }}>
        {zeilen.length ? (
          <table className="tabelle">
            <thead>
              <tr><th>Betrieb</th><th className="weg-mobil">Gewerk</th><th className="weg-mobil">Ort</th><th className="zahl">Score</th><th>Status</th><th className="weg-mobil">Seit</th></tr>
            </thead>
            <tbody>
              {zeilen.map((z) => (
                <tr key={z.id}>
                  <td><Link href={`/leads/${z.id}`}>{z.name}</Link>{z.inhaber ? <div className="leise klein">{z.inhaber}</div> : null}</td>
                  <td className="weg-mobil">{z.gewerk}</td>
                  <td className="weg-mobil">{z.ort}</td>
                  <td className="zahl">{z.score ?? "–"}</td>
                  <td><Status wert={z.status} /></td>
                  <td className="weg-mobil leise mono klein">{datum(z.erstelltAm)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="leer"><strong>Hier ist gerade niemand.</strong>Starte den Wochenlauf oder lege einen Lead von Hand an.</div>
        )}
      </div>
    </>
  );
}
