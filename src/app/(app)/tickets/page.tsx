import Link from "next/link";
import { asc, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { Status } from "@/components/Status";
import { datum } from "@/lib/format";
import { KATEGORIEN, ticketNummer, TICKET_STATUS } from "@/lib/ablauf/tickets";
import { ticketAnlegen } from "../aktionen";

export const metadata = { title: "Tickets" };

export default async function Tickets({ searchParams }: { searchParams: Promise<{ status?: string; betrieb?: string }> }) {
  const { status = "offen", betrieb } = await searchParams;
  const db = await getDb();
  const alle = await db.select({ t: schema.tickets, name: schema.betriebe.name }).from(schema.tickets).innerJoin(schema.betriebe, eq(schema.tickets.betriebId, schema.betriebe.id)).orderBy(desc(schema.tickets.erstelltAm));
  const liste = alle.filter(({ t }) => (status === "alle" ? true : status === "offen" ? t.status !== "erledigt" : t.status === status));
  const kunden = await db.select({ id: schema.betriebe.id, name: schema.betriebe.name }).from(schema.betriebe).where(eq(schema.betriebe.status, "kunde")).orderBy(asc(schema.betriebe.name));
  const reiter = [["offen", "Offen"], ["neu", "Neu"], ["wartet_kunde", "Wartet auf Kunde"], ["erledigt", "Erledigt"], ["alle", "Alle"]];
  return (
    <>
      <div className="kopfzeile">
        <div><h1>Tickets</h1><p>Änderungswünsche, Fehler und Fragen aus der Betreuung. Kunden stellen sie im Portal, ihr nehmt Anrufe hier auf. Gebuchte Zeit zählt gegen das Monatskontingent.</p></div>
      </div>
      <nav className="knopfreihe" aria-label="Filter" style={{ marginBottom: 16 }}>
        {reiter.map(([k, n]) => <Link key={k} href={`/tickets?status=${k}`} className="knopf klein" aria-current={status === k ? "page" : undefined} style={status === k ? { borderColor: "var(--akzent)" } : { color: "var(--leise)" }}>{n} <span className="mono">{alle.filter(({ t }) => (k === "alle" ? true : k === "offen" ? t.status !== "erledigt" : t.status === k)).length}</span></Link>)}
      </nav>
      <div className="raster zwei" style={{ alignItems: "start" }}>
        <section className="karte" style={{ padding: 0 }}>
          {liste.length ? (
            <table className="tabelle">
              <thead><tr><th>Ticket</th><th className="weg-mobil">Kunde</th><th>Status</th></tr></thead>
              <tbody>
                {liste.map(({ t, name }) => (
                  <tr key={t.id}>
                    <td><Link href={`/tickets/${t.id}`}>{ticketNummer(t.id)} {t.betreff}</Link><div className="leise klein">{KATEGORIEN[t.kategorie]} · {datum(t.erstelltAm)}{t.prioritaet !== "normal" ? ` · ${t.prioritaet}` : ""}</div></td>
                    <td className="weg-mobil">{name}</td>
                    <td><Status wert={t.status === "in_arbeit" ? "in_arbeit_ticket" : t.status === "erledigt" ? "fertig" : t.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <div className="leer"><strong>Keine Tickets.</strong>Neue Wünsche aus dem Kundenportal erscheinen hier.</div>}
        </section>
        <form action={ticketAnlegen} className="karte">
          <h2>Ticket aufnehmen</h2>
          <p className="leise klein">Zum Beispiel bei einem Anruf. Kunden können Tickets auch selbst im Portal stellen.</p>
          <label className="feld"><span>Kunde</span><select name="betriebId" required defaultValue={betrieb ?? ""}><option value="" disabled>Bitte wählen</option>{kunden.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}</select></label>
          <label className="feld"><span>Betreff</span><input name="betreff" required placeholder="z. B. Neue Öffnungszeiten" /></label>
          <label className="feld"><span>Beschreibung</span><textarea name="beschreibung" required rows={4} /></label>
          <div className="raster drei">
            <label className="feld"><span>Art</span><select name="kategorie">{Object.entries(KATEGORIEN).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
            <label className="feld"><span>Priorität</span><select name="prioritaet"><option value="normal">normal</option><option value="hoch">hoch</option><option value="dringend">dringend</option></select></label>
            <label className="feld"><span>Kanal</span><select name="quelle"><option value="telefon">Telefon</option><option value="mail">E-Mail</option><option value="intern">intern</option></select></label>
          </div>
          <button className="knopf haupt">Anlegen</button>
          <p className="leise klein" style={{ marginTop: 8 }}>Status: {Object.values(TICKET_STATUS).join(" → ")}</p>
        </form>
      </div>
    </>
  );
}
