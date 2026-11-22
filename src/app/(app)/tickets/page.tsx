import Link from "next/link";
import { and, asc, desc, eq, gte } from "drizzle-orm";
import { PAKETE, type PaketKey } from "@/lib/pakete";
import { paketDaten } from "@/lib/katalog-db";
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
  // Änderungskontingent je Kunde im laufenden Monat (Betreuungszeit gegen die Minuten aus dem Paket)
  const monatsStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const [projekte, zeiten] = await Promise.all([
    db.select().from(schema.projekte),
    db.select().from(schema.zeiten).where(and(eq(schema.zeiten.taetigkeit, "betreuung"), gte(schema.zeiten.datum, monatsStart))),
  ]);
  const kontingent = (betriebId: number) => {
    const p = projekte.find((x) => x.betriebId === betriebId);
    const frei = p && PAKETE[p.paket as PaketKey] ? paketDaten(p.paket as PaketKey).aenderungsMinuten : 0;
    const genutzt = zeiten.filter((z) => z.betriebId === betriebId).reduce((x, z) => x + z.minuten, 0);
    return { frei, genutzt };
  };
  const reiter = [["offen", "Offen"], ["neu", "Neu"], ["wartet_kunde", "Wartet auf Kunde"], ["erledigt", "Erledigt"], ["alle", "Alle"]];
  return (
    <>
      <div className="kopfzeile">
        <div><h1>Tickets</h1><p>Änderungswünsche, Fehler und Fragen aus der Betreuung. Kunden stellen sie im Portal, ihr nehmt Anrufe hier auf. Gebuchte Zeit zählt gegen das Monatskontingent.</p></div>
      </div>
      <nav className="reiter" aria-label="Filter">
        {reiter.map(([k, n]) => <Link key={k} href={`/tickets?status=${k}`} aria-current={status === k ? "page" : undefined}>{n} <span className="mono leise">{alle.filter(({ t }) => (k === "alle" ? true : k === "offen" ? t.status !== "erledigt" : t.status === k)).length}</span></Link>)}
      </nav>
      <div className="akte-raster" style={{ gridTemplateColumns: "minmax(0, 1.5fr) minmax(0, 1fr)" }}>
        <div>
          {liste.length ? (
            <ul className="betriebsliste">
              {liste.map(({ t, name }) => {
                const k = kontingent(t.betriebId);
                const anteil = k.frei ? Math.min(100, Math.round((k.genutzt / k.frei) * 100)) : 0;
                return (
                  <li key={t.id}>
                    <Link href={`/tickets/${t.id}`} className="betriebszeile ticketzeile">
                      <span className="wer"><span className="name">{ticketNummer(t.id)} {t.betreff}</span><span className="leise klein">{name} · {KATEGORIEN[t.kategorie]} · {datum(t.erstelltAm)}{t.prioritaet !== "normal" ? ` · ${t.prioritaet}` : ""}</span></span>
                      <span className="stand">
                        <span className="klein">{k.frei ? `Kontingent ${k.genutzt} von ${k.frei} Min. diesen Monat` : "kein Kontingent hinterlegt"}</span>
                        {k.frei ? <span className="portal-balken" aria-hidden="true" style={{ height: 6 }}><span style={{ width: `${anteil}%`, background: k.genutzt > k.frei ? "var(--fehler)" : undefined }} /></span> : null}
                      </span>
                      <span className="rechts"><Status wert={t.status === "in_arbeit" ? "in_arbeit_ticket" : t.status === "erledigt" ? "fertig" : t.status} /></span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : <div className="karte leer"><strong>Keine Tickets.</strong>Neue Wünsche aus dem Kundenportal erscheinen hier.</div>}
          <p className="leise klein" style={{ marginTop: 8 }}>Über dem Kontingent: Änderungen nach Freigabe in Textform zum Stundensatz aus den Vertragsbedingungen.</p>
        </div>
        <form action={ticketAnlegen} className="karte">
          <h2>Ticket aufnehmen</h2>
          <p className="leise klein">Zum Beispiel bei einem Anruf. Schreibt oder ruft ein Kunde an, entsteht das Ticket automatisch beim richtigen Kunden; im Portal stellt er es selbst.</p>
          <div className="raster zwei" style={{ gap: 12 }}>
            <label className="feld"><span>Telefon oder E-Mail <em>findet den Kunden</em></span><input name="kontakt" placeholder="0721 … oder name@betrieb.de" /></label>
            <label className="feld"><span>oder Kunde wählen</span><select name="betriebId" defaultValue={betrieb ?? ""}><option value="">–</option>{kunden.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}</select></label>
          </div>
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
