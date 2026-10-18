import { desc, gte, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { dienste } from "@/lib/adapters/dienste";
import { REGELN } from "@/lib/jobs/zeitplan";
import { JOB_NAMEN } from "@/lib/jobs/handler";
import { Status } from "@/components/Status";
import { datumZeit } from "@/lib/format";
import { beispieleEntfernen, beispieleLaden, jobStarten, jobWiederholen, passwortAendern } from "../aktionen";
import { beispieleErlaubt } from "@/lib/beispiele";

export const metadata = { title: "System" };

export default async function System() {
  const db = await getDb();
  const monat = new Date(Date.now() - 30 * 864e5);
  const [jobs, meldungen, zeitplan, kosten, verlauf] = await Promise.all([
    db.select().from(schema.jobs).orderBy(desc(schema.jobs.erstelltAm)).limit(25),
    db.select().from(schema.meldungen).orderBy(desc(schema.meldungen.am)).limit(20),
    db.select().from(schema.zeitplan),
    db.select({ zweck: schema.kiNutzung.zweck, n: sql<number>`count(*)::int`, s: sql<number>`sum(${schema.kiNutzung.kostenMikroUsd})::int` }).from(schema.kiNutzung).where(gte(schema.kiNutzung.am, monat)).groupBy(schema.kiNutzung.zweck),
    db.select().from(schema.protokoll).orderBy(desc(schema.protokoll.am)).limit(30),
  ]);
  const summe = kosten.reduce((a, k) => a + (k.s ?? 0), 0);
  return (
    <>
      <div className="kopfzeile"><div><h1>System</h1><p>Dienste, Hintergrund-Jobs, Backups und alles, was protokolliert wird.</p></div></div>

      <section className="karte">
        <h2>Dienste</h2>
        <table className="tabelle">
          <thead><tr><th>Dienst</th><th className="weg-mobil">Wofür</th><th>Stand</th></tr></thead>
          <tbody>
            {dienste().map((d) => (
              <tr key={d.key}>
                <td><b>{d.name}</b>{!d.echt ? <div className="leise klein">{d.hinweis}</div> : null}</td>
                <td className="weg-mobil">{d.zweck}</td>
                <td><Status wert={d.echt ? "echt" : "simulator"} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="raster zwei abstand" style={{ alignItems: "start" }}>
        <section className="karte">
          <h2>Zeitplan</h2>
          <ul className="liste">
            {REGELN.map((r) => {
              const z = zeitplan.find((x) => x.name === r.art);
              return (
                <li key={r.art}>
                  <div><div className="titel">{r.name}</div><div className="unter">Zuletzt: {datumZeit(z?.zuletztAm)}</div></div>
                  <form action={jobStarten}><input type="hidden" name="art" value={r.art} /><button className="knopf klein">Jetzt</button></form>
                </li>
              );
            })}
          </ul>
        </section>
        <section className="karte">
          <h2>Meldungen</h2>
          {meldungen.length ? (
            <ul className="liste">
              {meldungen.map((m) => (
                <li key={m.id}><div><div className="titel">{m.titel}</div><div className="unter" style={{ whiteSpace: "pre-wrap" }}>{m.detail}</div><div className="unter">{datumZeit(m.am)}{m.gepusht ? " · aufs Handy geschickt" : ""}</div></div><Status wert={m.ok ? "fertig" : "fehler"} /></li>
              ))}
            </ul>
          ) : <p className="leise">Noch keine Meldungen.</p>}
        </section>
      </div>

      <section className="karte abstand">
        <h2>Hintergrund-Jobs</h2>
        <table className="tabelle">
          <thead><tr><th>Job</th><th>Status</th><th className="weg-mobil">Ergebnis</th><th className="weg-mobil">Zeit</th><th></th></tr></thead>
          <tbody>
            {jobs.map((j) => (
              <tr key={j.id}>
                <td>{JOB_NAMEN[j.art] ?? j.art}</td>
                <td><Status wert={j.status} /></td>
                <td className="weg-mobil klein" style={{ color: j.fehler ? "var(--fehler)" : undefined }}>{j.fehler ?? j.ergebnis ?? ""}</td>
                <td className="weg-mobil mono klein">{datumZeit(j.erstelltAm)}</td>
                <td>{j.status === "fehler" ? <form action={jobWiederholen}><input type="hidden" name="id" value={j.id} /><button className="knopf klein">Wiederholen</button></form> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="raster zwei abstand" style={{ alignItems: "start" }}>
        <section className="karte">
          <h2>KI-Kosten, letzte 30 Tage</h2>
          <p className="mono" style={{ fontSize: 26 }}>{(summe / 1_000_000).toFixed(2)} USD</p>
          {kosten.length ? <ul className="liste">{kosten.map((k) => <li key={k.zweck}><span>{k.zweck} ({k.n}×)</span><span className="mono">{((k.s ?? 0) / 1_000_000).toFixed(3)} USD</span></li>)}</ul> : <p className="leise">Noch keine Aufrufe. Im Simulator entstehen keine Kosten.</p>}
        </section>
        <section className="karte">
          <h2>Passwort ändern</h2>
          <form action={passwortAendern}>
            <label className="feld"><span>Bisheriges Passwort</span><input type="password" name="alt" autoComplete="current-password" required /></label>
            <label className="feld"><span>Neues Passwort</span><input type="password" name="neu" autoComplete="new-password" minLength={12} required /><small>Mindestens 12 Zeichen. Zwei-Faktor-Anmeldung folgt vor dem ersten echten Kunden.</small></label>
            <button className="knopf">Ändern</button>
          </form>
        </section>
      </div>

      {beispieleErlaubt() ? (
        <section className="karte abstand">
          <h2>Beispieldaten</h2>
          <p className="leise">16 erfundene Betriebe in allen Phasen: neue Leads, Briefe, Termine, Angebote, Rechnungen, Projekte bis zum Livegang. Nur auf der lokalen Datenbank möglich.</p>
          <div className="knopfreihe">
            <form action={beispieleLaden}><button className="knopf">Beispieldaten laden</button></form>
            <form action={beispieleEntfernen}><button className="knopf gefahr">Beispieldaten entfernen</button></form>
          </div>
        </section>
      ) : null}

      <section className="karte abstand">
        <h2>Protokoll</h2>
        <ul className="liste">
          {verlauf.map((v) => <li key={v.id}><div><div>{v.aktion}</div><div className="unter">{v.wer} · {datumZeit(v.am)}{v.detail ? ` · ${v.detail}` : ""}</div></div></li>)}
        </ul>
      </section>
    </>
  );
}
