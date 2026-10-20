import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { Status } from "@/components/Status";
import { datum, datumZeit } from "@/lib/format";
import { KATEGORIEN, kontingent, PRIORITAETEN, ticketNummer, TICKET_STATUS } from "@/lib/ablauf/tickets";
import { stunden } from "@/lib/ablauf/zeiten";
import { ticketAendern, ticketAntworten, ticketZeit } from "../../aktionen";

export const metadata = { title: "Ticket" };

export default async function Ticket({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const db = await getDb();
  const [t] = await db.select().from(schema.tickets).where(eq(schema.tickets.id, id));
  if (!t) notFound();
  const [[b], zeiten, post, benutzer, k] = await Promise.all([
    db.select().from(schema.betriebe).where(eq(schema.betriebe.id, t.betriebId)),
    db.select().from(schema.zeiten).where(eq(schema.zeiten.ticketId, id)).orderBy(desc(schema.zeiten.datum)),
    db.select().from(schema.postausgang).where(eq(schema.postausgang.zweck, "ticket_antwort")),
    db.select({ name: schema.benutzer.name }).from(schema.benutzer),
    kontingent(t.betriebId),
  ]);
  const antworten = post.filter((p) => Number(p.meta.ticketId) === id);
  const summe = zeiten.reduce((s, z) => s + z.minuten, 0);
  return (
    <>
      <Link href="/tickets" className="zurueck">← Tickets</Link>
      <div className="kopfzeile">
        <div><h1>{ticketNummer(id)} {t.betreff}</h1><p><Link href={`/leads/${b.id}`}>{b.name}</Link> · {KATEGORIEN[t.kategorie]} · über {t.quelle} · {datumZeit(t.erstelltAm)} von {t.erstelltVon}</p></div>
        <Status wert={t.status === "in_arbeit" ? "in_arbeit_ticket" : t.status === "erledigt" ? "fertig" : t.status} />
      </div>
      <div className="raster zwei" style={{ alignItems: "start" }}>
        <div>
          <section className="karte">
            <h2>Beschreibung</h2>
            <div className="textblock">{t.beschreibung}</div>
            {t.loesung ? <><h3>Lösung</h3><div className="textblock">{t.loesung}</div></> : null}
          </section>
          <form action={ticketAntworten} className="karte abstand">
            <h2>Antworten</h2>
            <p className="leise klein">Geht als E-Mail an {b.email ?? "(E-Mail fehlt)"}, vorher Qualitätskontrolle und Freigabe.</p>
            <input type="hidden" name="id" value={id} />
            <label className="feld"><span>Text</span><textarea name="antwort" rows={5} required placeholder="Die neuen Öffnungszeiten stehen jetzt auf Ihrer Website." /></label>
            <label className="haken" style={{ marginBottom: 12 }}><input type="checkbox" name="erledigt" value="ja" defaultChecked /><span>Ticket damit erledigen</span></label>
            <button className="knopf haupt">In den Postausgang</button>
            {antworten.length ? <ul className="liste" style={{ marginTop: 12 }}>{antworten.map((a) => <li key={a.id}><div><div className="titel"><Link href={`/freigaben/${a.id}`}>{a.betreff}</Link></div><div className="unter">{datumZeit(a.erstelltAm)}</div></div><Status wert={a.status} /></li>)}</ul> : null}
          </form>
        </div>
        <div>
          <form action={ticketAendern} className="karte">
            <h2>Bearbeitung</h2>
            <input type="hidden" name="id" value={id} />
            <div className="raster drei">
              <label className="feld"><span>Status</span><select name="status" defaultValue={t.status}>{Object.entries(TICKET_STATUS).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
              <label className="feld"><span>Priorität</span><select name="prioritaet" defaultValue={t.prioritaet}>{Object.entries(PRIORITAETEN).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
              <label className="feld"><span>Zuständig</span><select name="zustaendig" defaultValue={t.zustaendig ?? ""}>{benutzer.map((x) => <option key={x.name}>{x.name}</option>)}</select></label>
            </div>
            <button className="knopf">Speichern</button>
          </form>
          <section className="karte abstand">
            <h2>Zeit und Kontingent</h2>
            <p>Diesen Monat: <b className="mono">{k.verbraucht} von {k.enthalten} Min.</b> enthalten{k.ueber ? <span style={{ color: "var(--fehler)" }}> · {k.ueber} Min. darüber (gesondert anbieten)</span> : ` · noch ${k.rest} Min.`}</p>
            <div className="balken" role="progressbar" aria-valuenow={k.verbraucht} aria-valuemax={k.enthalten || 1}><span style={{ width: `${Math.min(100, (k.verbraucht / (k.enthalten || 1)) * 100)}%`, background: k.ueber ? "var(--fehler)" : undefined }} /></div>
            <form action={ticketZeit} className="knopfreihe" style={{ marginTop: 12 }}>
              <input type="hidden" name="id" value={id} />
              <select name="minuten" defaultValue="15" aria-label="Minuten" style={{ width: "auto" }}>{[5, 10, 15, 20, 30, 45, 60, 90, 120].map((m) => <option key={m} value={m}>{m} Min.</option>)}</select>
              <input name="notiz" placeholder="Was gemacht?" aria-label="Notiz" style={{ maxWidth: 240 }} />
              <button className="knopf">Buchen</button>
            </form>
            {zeiten.length ? <ul className="liste" style={{ marginTop: 12 }}>{zeiten.map((z) => <li key={z.id}><div><div className="titel">{z.minuten} Min. · {z.wer}</div><div className="unter">{datum(z.datum)}{z.notiz ? ` · ${z.notiz}` : ""}</div></div></li>)}</ul> : null}
            <p className="leise klein" style={{ marginTop: 8 }}>Auf diesem Ticket: {stunden(summe)}</p>
          </section>
        </div>
      </div>
    </>
  );
}
