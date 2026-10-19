import Link from "next/link";
import { and, desc, eq, inArray, lte, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { brauchtBenutzer } from "@/lib/auth";
import { Status } from "@/components/Status";
import { datumZeit, ZWECK } from "@/lib/format";
import { beispieleErlaubt } from "@/lib/beispiele";
import { beispieleLaden } from "./aktionen";
import { ETAPPEN, FRISTEN, stand, UNTERLAGEN } from "@/lib/unterlagen";

export const metadata = { title: "Heute" };

export default async function Heute() {
  const b = await brauchtBenutzer();
  const db = await getDb();
  const jetzt = new Date();
  const [freigaben, neueLeads, besuche, projekte, fehlerJobs, letzteMeldungen] = await Promise.all([
    db.select().from(schema.postausgang).where(eq(schema.postausgang.status, "zur_freigabe")).orderBy(schema.postausgang.erstelltAm),
    db.select().from(schema.betriebe).where(eq(schema.betriebe.status, "neu")).orderBy(desc(schema.betriebe.score)),
    db.select().from(schema.betriebe).where(and(eq(schema.betriebe.status, "angeschrieben"), lte(schema.betriebe.besuchAb, jetzt))),
    db.select({ p: schema.projekte, name: schema.betriebe.name }).from(schema.projekte).innerJoin(schema.betriebe, eq(schema.projekte.betriebId, schema.betriebe.id)).where(inArray(schema.projekte.status, ["inhalte", "bau", "pruefung", "bereit"])),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.jobs).where(eq(schema.jobs.status, "fehler")),
    db.select().from(schema.meldungen).orderBy(desc(schema.meldungen.am)).limit(40),
  ]);
  const backupMeldung = letzteMeldungen.find((m) => m.art === "backup");
  const rueckMeldung = letzteMeldungen.find((m) => m.art === "ruecksicherung");
  const stunde = Number(jetzt.toLocaleString("de-DE", { hour: "numeric", hourCycle: "h23", timeZone: "Europe/Berlin" }));
  const gruss = stunde < 11 ? "Guten Morgen" : stunde < 18 ? "Hallo" : "Guten Abend";
  const vorname = b.name.split(" ")[0];
  const nichtsZuTun = !freigaben.length && !neueLeads.length && !besuche.length;
  const [{ n: anzahlBetriebe }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.betriebe);
  const [{ n: laedt }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.jobs).where(and(eq(schema.jobs.art, "beispieldaten"), inArray(schema.jobs.status, ["wartet", "laeuft"])));

  // Unterlagen: nächste Etappe mit offenen Punkten und nächste Frist
  const unterlagenStand = await stand();
  const heute = jetzt.toISOString().slice(0, 10);
  const etappe = ETAPPEN.filter((e) => e.nr > 0).find((e) => UNTERLAGEN.some((u) => u.etappe === e.nr && !["erledigt", "entfaellt"].includes(unterlagenStand.get(u.key)?.status ?? "offen")));
  const offenInEtappe = etappe ? UNTERLAGEN.filter((u) => u.etappe === etappe.nr && !["erledigt", "entfaellt"].includes(unterlagenStand.get(u.key)?.status ?? "offen")).length : 0;
  const frist = FRISTEN.find((f) => f.datum >= heute);

  return (
    <>
      <div className="kopfzeile">
        <div>
          <h1>{gruss}, {vorname}.</h1>
          <p>{nichtsZuTun ? "Gerade wartet nichts auf dich." : "Das wartet heute auf dich."}</p>
        </div>
      </div>

      {laedt ? (
        <div className="hinweis">Beispieldaten werden geladen. In etwa einer Minute die Seite neu laden.</div>
      ) : !anzahlBetriebe && beispieleErlaubt() ? (
        <section className="karte" style={{ marginBottom: 24 }}>
          <h2>Noch leer. Willst du sehen, wie alles zusammenläuft?</h2>
          <p className="leise">Lade 16 erfundene Betriebe in allen Phasen: vom neuen Lead über Brief, Termin und Angebot bis zur Website, die live ist. Unter System kannst du sie jederzeit wieder entfernen.</p>
          <form action={beispieleLaden}><button className="knopf haupt">Beispieldaten laden</button></form>
        </section>
      ) : null}

      {etappe ? (
        <Link href={`/unterlagen?etappe=${etappe.nr}`} className="hinweis" style={{ display: "block", marginBottom: 16 }}>
          Unterlagen: <strong>{offenInEtappe} offen</strong> in „{etappe.name}“ (bis {new Date(etappe.bis).toLocaleDateString("de-DE")}){frist ? <> · nächste Frist {new Date(frist.datum).toLocaleDateString("de-DE")}: {frist.was}</> : null}
        </Link>
      ) : null}

      <div className="raster vier">
        <Link className="kennzahl" href="/freigaben"><div className="wert" style={freigaben.length ? { color: "var(--akzent)" } : undefined}>{freigaben.length}</div><div className="name">Freigaben offen</div></Link>
        <Link className="kennzahl" href="/leads?status=neu"><div className="wert">{neueLeads.length}</div><div className="name">Leads einstufen</div></Link>
        <Link className="kennzahl" href="/leads?status=besuch"><div className="wert">{besuche.length}</div><div className="name">Besuche fällig</div></Link>
        <Link className="kennzahl" href="/projekte"><div className="wert">{projekte.length}</div><div className="name">Projekte in Arbeit</div></Link>
      </div>

      <div className="raster zwei abstand">
        <section className="karte">
          <h2>Freigeben</h2>
          {freigaben.length ? (
            <ul className="liste">
              {freigaben.slice(0, 6).map((f) => (
                <li key={f.id}>
                  <div>
                    <div className="titel">{f.betreff}</div>
                    <div className="unter">{ZWECK[f.zweck] ?? f.zweck} · {datumZeit(f.erstelltAm)}{f.hinweise.length ? ` · ${f.hinweise.length} Hinweis${f.hinweise.length > 1 ? "e" : ""}` : ""}</div>
                  </div>
                  <Link className="knopf klein" href={`/freigaben/${f.id}`}>Ansehen</Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="leer"><strong>Alles freigegeben.</strong>Neue Briefe, Angebote und Rechnungen erscheinen hier.</div>
          )}
        </section>

        <section className="karte">
          <h2>Leads einstufen</h2>
          {neueLeads.length ? (
            <ul className="liste">
              {neueLeads.slice(0, 6).map((l) => (
                <li key={l.id}>
                  <div>
                    <div className="titel">{l.name}</div>
                    <div className="unter">{l.gewerk} · {l.ort} · Score <span className="mono">{l.score ?? "–"}</span></div>
                  </div>
                  <Link className="knopf klein" href={`/leads/${l.id}`}>Einstufen</Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="leer"><strong>Keine neuen Leads.</strong>Der Wochenlauf sucht jeden Montag um 6 Uhr.</div>
          )}
        </section>

        <section className="karte">
          <h2>Besuche (Brief vor 7–10 Tagen)</h2>
          {besuche.length ? (
            <ul className="liste">
              {besuche.map((l) => (
                <li key={l.id}>
                  <div>
                    <div className="titel">{l.name}</div>
                    <div className="unter">{l.strasse}, {l.plz} {l.ort}</div>
                  </div>
                  <Link className="knopf klein" href={`/leads/${l.id}`}>Öffnen</Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="leer"><strong>Keine Besuche fällig.</strong>Betriebe erscheinen hier 8 Tage nach dem Brief.</div>
          )}
        </section>

        <section className="karte">
          <h2>Projekte</h2>
          {projekte.length ? (
            <ul className="liste">
              {projekte.map(({ p, name }) => (
                <li key={p.id}>
                  <div>
                    <div className="titel">{name}</div>
                    <div className="unter">Paket {p.paket}</div>
                  </div>
                  <Link href={`/projekte/${p.id}`}><Status wert={p.status} /></Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="leer"><strong>Keine laufenden Projekte.</strong>Nach der Anzahlung startet hier das Projekt.</div>
          )}
        </section>
      </div>

      <section className="karte abstand">
        <h2>System</h2>
        <div className="knopfreihe">
          <span>Letztes Backup: {backupMeldung ? <><Status wert={backupMeldung.ok ? "fertig" : backupMeldung.detail?.includes("nur lokal") ? "nur_lokal" : "fehler"} /> <span className="leise klein">{datumZeit(backupMeldung.am)}</span></> : <Status wert="wartet" />}</span>
          <span>Probe-Rücksicherung: {rueckMeldung ? <><Status wert={rueckMeldung.ok ? "fertig" : "fehler"} /> <span className="leise klein">{datumZeit(rueckMeldung.am)}</span></> : <Status wert="wartet" />}</span>
          <span>Fehlgeschlagene Jobs: {fehlerJobs[0].n ? <><Status wert="fehler" /> <span className="mono">{fehlerJobs[0].n}</span></> : <Status wert="keine" />}</span>
          <Link href="/system" className="klein">Details</Link>
        </div>
      </section>
    </>
  );
}
