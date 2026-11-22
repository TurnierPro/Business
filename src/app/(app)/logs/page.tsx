import Link from "next/link";
import { and, desc, eq, gte, ilike, or } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { datumZeit } from "@/lib/format";
import { Status } from "@/components/Status";
import { AufEinenBlick, SeitenKopf, SeitenReiter, reiterWahl } from "@/components/Seite";

export const metadata = { title: "Protokoll" };

// Wer hat wann was getan (Nachweis nach Art. 5 Abs. 2 DSGVO), dazu Systemmeldungen.
// Anmeldungen sind getrennt, damit die eigentlichen Aktionen nicht darin untergehen.

const ANMELDUNG = /^(Angemeldet|Überall abgemeldet|Falscher Zwei-Faktor-Code|Anmeldung gesperrt)/;
const WOCHENTAG = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
const tagKey = (d: Date) => d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
const uhrzeit = (d: Date) => d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
function tagName(d: Date) {
  const heute = new Date();
  const gestern = new Date(Date.now() - 864e5);
  const vorne = tagKey(d) === tagKey(heute) ? "Heute" : tagKey(d) === tagKey(gestern) ? "Gestern" : WOCHENTAG[d.getDay()];
  return `${vorne} · ${tagKey(d)}`;
}

export default async function Logs({ searchParams }: { searchParams: Promise<{ q?: string; tage?: string; reiter?: string; wer?: string }> }) {
  const sp = await searchParams;
  const { q = "", tage = "7", wer = "" } = sp;
  const db = await getDb();
  const seit = new Date(Date.now() - Math.min(365, Math.max(1, Number(tage) || 7)) * 864e5);
  const m = `%${q.trim().replace(/[%_]/g, "")}%`;
  const [alle, meldungen] = await Promise.all([
    db
      .select({ p: schema.protokoll, betrieb: schema.betriebe.name })
      .from(schema.protokoll)
      .leftJoin(schema.betriebe, eq(schema.protokoll.betriebId, schema.betriebe.id))
      .where(and(gte(schema.protokoll.am, seit), q.trim() ? or(ilike(schema.protokoll.aktion, m), ilike(schema.protokoll.wer, m), ilike(schema.betriebe.name, m)) : undefined, wer ? eq(schema.protokoll.wer, wer) : undefined))
      .orderBy(desc(schema.protokoll.am))
      .limit(1000),
    db.select().from(schema.meldungen).where(gte(schema.meldungen.am, seit)).orderBy(desc(schema.meldungen.am)).limit(200),
  ]);
  const anmeldungen = alle.filter((x) => ANMELDUNG.test(x.p.aktion));
  const aktionen = alle.filter((x) => !ANMELDUNG.test(x.p.aktion));
  const warnungen = anmeldungen.filter((x) => !x.p.aktion.startsWith("Angemeldet")).length;
  const fehler = meldungen.filter((x) => !x.ok).length;
  const personen = [...new Set(alle.map((x) => x.p.wer))].sort();

  const liste = [
    { key: "aktionen", name: "Aktionen", zahl: aktionen.length },
    { key: "anmeldungen", name: "Anmeldungen", zahl: anmeldungen.length, ton: warnungen ? ("fehler" as const) : undefined },
    { key: "system", name: "Systemmeldungen", zahl: meldungen.length, ton: fehler ? ("fehler" as const) : undefined },
  ];
  const reiter = reiterWahl(sp.reiter, liste);
  const zeilen = (reiter === "anmeldungen" ? anmeldungen : aktionen).slice(0, 400);
  // nach Tagen gruppieren
  const tage_: { tag: string; eintraege: typeof zeilen }[] = [];
  for (const z of zeilen) {
    const t = tagName(z.p.am);
    if (tage_.at(-1)?.tag !== t) tage_.push({ tag: t, eintraege: [] });
    tage_.at(-1)!.eintraege.push(z);
  }
  const weitere = Object.fromEntries(Object.entries({ q, tage, wer }).filter(([, v]) => v));

  return (
    <>
      <SeitenKopf titel="Protokoll" text="Wer hat wann was getan. Automatisch, nicht änderbar, nach 3 Jahren gelöscht." />
      <AufEinenBlick
        werte={[
          { wert: aktionen.length, name: "Aktionen im Zeitraum" },
          { wert: personen.length, name: "beteiligte Personen und Agenten" },
          { wert: anmeldungen.length, name: "Anmeldungen" },
          { wert: warnungen, name: "Sperren und falsche Codes", ton: warnungen ? "fehler" : "ok" },
          { wert: fehler, name: "Fehlermeldungen des Systems", ton: fehler ? "fehler" : "ok" },
        ]}
      />
      <form method="get" className="filterleiste" role="search">
        <input type="hidden" name="reiter" value={reiter} />
        <input name="q" defaultValue={q} placeholder="Suchen: Aktion oder Betrieb" aria-label="Protokoll durchsuchen" />
        <select name="wer" defaultValue={wer} aria-label="Person"><option value="">Alle Personen</option>{personen.map((p) => <option key={p}>{p}</option>)}</select>
        <select name="tage" defaultValue={tage} aria-label="Zeitraum"><option value="1">Heute</option><option value="7">7 Tage</option><option value="30">30 Tage</option><option value="365">1 Jahr</option></select>
        <button className="knopf">Anzeigen</button>
        {q || wer || tage !== "7" ? <Link className="klein" href={`/logs?reiter=${reiter}`}>Filter zurücksetzen</Link> : null}
      </form>
      <SeitenReiter basis="/logs" aktiv={reiter} liste={liste} weitere={weitere} />

      {reiter === "system" ? (
        <section className="karte">
          {meldungen.length ? (
            <ul className="zeilen">
              {meldungen.map((x) => (
                <li key={x.id}>
                  <div><div className="titel">{x.titel}</div><div className="unter">{datumZeit(x.am)}{x.detail ? ` · ${x.detail.slice(0, 200)}` : ""}</div></div>
                  <Status wert={x.ok ? "fertig" : "fehler"} />
                </li>
              ))}
            </ul>
          ) : <div className="leer"><strong>Keine Meldungen im Zeitraum.</strong></div>}
        </section>
      ) : tage_.length ? (
        tage_.map((t) => (
          <section key={t.tag} className="karte abstand-klein">
            <h3 className="gruppe-titel">{t.tag} · {t.eintraege.length}</h3>
            <table className="tabelle protokoll-tabelle">
              <tbody>
                {t.eintraege.map(({ p, betrieb }) => (
                  <tr key={p.id}>
                    <td className="mono leise zeit">{uhrzeit(p.am)}</td>
                    <td className="wer">{p.wer}</td>
                    <td>{p.aktion}{p.detail ? <div className="leise klein">{p.detail}</div> : null}</td>
                    <td className="weg-mobil betrieb">{betrieb && p.betriebId ? <Link href={`/leads/${p.betriebId}`}>{betrieb}</Link> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))
      ) : (
        <div className="karte leer"><strong>Keine Einträge.</strong>Anderen Zeitraum oder andere Person wählen.</div>
      )}
      {zeilen.length >= 400 ? <p className="leise klein">Es werden die neuesten 400 Einträge gezeigt. Zeitraum oder Suche eingrenzen.</p> : null}
    </>
  );
}
