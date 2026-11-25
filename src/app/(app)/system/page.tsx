import Link from "next/link";
import { desc, eq, gte, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { dienste } from "@/lib/adapters/dienste";
import { REGELN } from "@/lib/jobs/zeitplan";
import { JOB_NAMEN } from "@/lib/jobs/handler";
import { Status } from "@/components/Status";
import { datumZeit } from "@/lib/format";
import { beispieleEntfernen, beispieleLaden, jobStarten, jobWiederholen } from "../aktionen";
import { beispieleErlaubt } from "@/lib/beispiele";
import { AGENTEN } from "@/lib/agenten";
import { AufEinenBlick, SeitenKopf, SeitenReiter, reiterWahl } from "@/components/Seite";

export const metadata = { title: "Systemzustand" };

export default async function System({ searchParams }: { searchParams: Promise<{ reiter?: string }> }) {
  const db = await getDb();
  const monat = new Date(Date.now() - 30 * 864e5);
  const [jobs, meldungen, zeitplan, kosten] = await Promise.all([
    db.select().from(schema.jobs).orderBy(desc(schema.jobs.erstelltAm)).limit(25),
    db.select().from(schema.meldungen).orderBy(desc(schema.meldungen.am)).limit(40),
    db.select().from(schema.zeitplan),
    db.select({ zweck: schema.kiNutzung.zweck, n: sql<number>`count(*)::int`, s: sql<number>`sum(${schema.kiNutzung.kostenMikroUsd})::int` }).from(schema.kiNutzung).where(gte(schema.kiNutzung.am, monat)).groupBy(schema.kiNutzung.zweck),
  ]);
  const summe = kosten.reduce((a, k) => a + (k.s ?? 0), 0);
  // Ampel: in einem Satz, ob etwas zu tun ist
  const [{ n: fehlerJobs }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.jobs).where(eq(schema.jobs.status, "fehler"));
  const seit24h = new Date(Date.now() - 864e5);
  const warnungen = meldungen.filter((m) => !m.ok && m.am > seit24h);
  const letztesBackup = meldungen.find((m) => m.art === "backup");
  const alleDienste = dienste();
  const simuliert = alleDienste.filter((d) => !d.echt).length;
  const probleme = [
    ...(fehlerJobs ? [`${fehlerJobs} Hintergrund-Job${fehlerJobs > 1 ? "s" : ""} mit Fehler (unten unter „Hintergrund-Jobs“)`] : []),
    ...warnungen.map((m) => `${m.titel}${m.detail ? `: ${m.detail.slice(0, 120)}` : ""}`),
    ...(letztesBackup && !letztesBackup.ok ? ["Letzte Sicherung fehlgeschlagen"] : []),
  ];
  const liste = [
    { key: "ueberblick", name: "Überblick", zahl: probleme.length || undefined, ton: probleme.length ? ("fehler" as const) : undefined },
    { key: "zeitplan", name: "Automatische Abläufe", zahl: REGELN.length },
    { key: "meldungen", name: "Meldungen", zahl: meldungen.length },
    { key: "jobs", name: "Erledigte Arbeiten", zahl: fehlerJobs ? `${fehlerJobs} Fehler` : undefined, ton: fehlerJobs ? ("fehler" as const) : undefined },
    { key: "dienste", name: "Angebundene Programme", zahl: alleDienste.length },
    { key: "agenten", name: "KI-Helfer", zahl: AGENTEN.length },
  ];
  const reiter = reiterWahl((await searchParams).reiter, liste);
  const uhr = (d: Date) => d.toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });
  const meldungsListe = (l: typeof meldungen) => (
    <ul className="zeilen">
      {l.map((m) => (
        <li key={m.id}><div><div className="titel">{m.titel}</div><div className="unter" style={{ whiteSpace: "pre-wrap" }}>{datumZeit(m.am)}{m.gepusht ? " · aufs Handy geschickt" : ""}{m.detail ? ` · ${m.detail}` : ""}</div></div><Status wert={m.ok ? "fertig" : "fehler"} /></li>
      ))}
    </ul>
  );

  return (
    <>
      <SeitenKopf titel="Systemzustand" text="Läuft Levarex OS im Hintergrund sauber? Hier schaust du nur nach, wenn oben „Bitte prüfen“ steht." />

      <section className={`karte ampel ${probleme.length ? "rot" : "gruen"}`} aria-live="polite" style={{ marginBottom: 12 }}>
        <div className="kopfzeile" style={{ marginBottom: probleme.length ? 8 : 0 }}>
          <h2 style={{ margin: 0 }}><span className={`status ${probleme.length ? "fehler" : "ok"}`}>{probleme.length ? "Bitte prüfen" : "Alles läuft"}</span></h2>
          <span className="leise klein">Stand {uhr(new Date())}</span>
        </div>
        {probleme.length ? <ul style={{ margin: 0, paddingLeft: 18 }}>{probleme.map((x) => <li key={x}>{x}</li>)}</ul> : null}
      </section>
      <AufEinenBlick werte={[
        { wert: `${alleDienste.length - simuliert} / ${alleDienste.length}`, name: "Programme angeschlossen", ton: simuliert ? "warten" : "ok", href: "/system?reiter=dienste" },
        { wert: letztesBackup ? uhr(letztesBackup.am) : "keine", name: letztesBackup ? `letzte Sicherung · ${letztesBackup.ok ? "ok" : "Fehler"}` : "Sicherung", ton: letztesBackup?.ok ? "ok" : "fehler", href: "/system?reiter=meldungen" },
        { wert: fehlerJobs, name: "Arbeiten mit Fehler", ton: fehlerJobs ? "fehler" : "ok", href: "/system?reiter=jobs" },
        { wert: warnungen.length, name: "Warnungen in 24 Stunden", ton: warnungen.length ? "fehler" : "ok", href: "/system?reiter=meldungen" },
        { wert: `${(summe / 1_000_000).toFixed(2)} USD`, name: "KI-Kosten, 30 Tage" },
      ]} />
      <SeitenReiter basis="/system" aktiv={reiter} liste={liste} />

      {reiter === "ueberblick" ? (
        <>
        <section className="karte abstand-klein">
          <h2>Was hier zu sehen ist</h2>
          <ul className="zeilen">
            <li><div><div className="titel">Automatische Abläufe</div><div className="unter">Was Levarex OS von selbst erledigt, z. B. jede Nacht die Sicherung, morgens den Tagesbericht, Erinnerungen an offene Rechnungen.</div></div><Link className="knopf klein" href="/system?reiter=zeitplan">Ansehen</Link></li>
            <li><div><div className="titel">KI-Helfer</div><div className="unter">Bereiten Briefe, Angebote, Antworten und Protokolle vor. Sie schicken nie selbst etwas raus: alles landet bei euch in den Freigaben.</div></div><Link className="knopf klein" href="/system?reiter=agenten">Ansehen</Link></li>
            <li><div><div className="titel">Angebundene Programme</div><div className="unter">Outlook, WhatsApp, Lexware, Qonto und Co. „Simulator“ heißt: noch nicht angeschlossen, es geht nichts nach draußen.</div></div><Link className="knopf klein" href="/system?reiter=dienste">Ansehen</Link></li>
          </ul>
        </section>
        <div className="raster zwei" style={{ alignItems: "start" }}>
          <section className="karte">
            <h2>Neueste Meldungen</h2>
            {meldungen.length ? meldungsListe(meldungen.slice(0, 6)) : <p className="leise">Noch keine Meldungen.</p>}
          </section>
          <section className="karte">
            <h2>KI-Kosten nach Zweck, 30 Tage</h2>
            {kosten.length ? <ul className="zeilen">{kosten.map((k) => <li key={k.zweck}><span>{k.zweck} <span className="leise">({k.n}×)</span></span><span className="mono">{((k.s ?? 0) / 1_000_000).toFixed(3)} USD</span></li>)}</ul> : <p className="leise">Noch keine Aufrufe. Im Simulator entstehen keine Kosten.</p>}
            {beispieleErlaubt() ? (
              <>
                <h3 className="gruppe-titel" style={{ marginTop: 24 }}>Beispieldaten (nur lokal)</h3>
                <p className="leise klein">16 erfundene Betriebe in allen Phasen: Leads, Briefe, Termine, Angebote, Rechnungen, Projekte bis zum Livegang.</p>
                <div className="knopfreihe">
                  <form action={beispieleLaden}><button className="knopf klein">Beispieldaten laden</button></form>
                  <form action={beispieleEntfernen}><button className="knopf klein gefahr">Beispieldaten entfernen</button></form>
                </div>
              </>
            ) : null}
          </section>
        </div>
        </>
      ) : null}

      {reiter === "zeitplan" ? (
        <section className="karte">
          <table className="tabelle">
            <thead><tr><th>Aufgabe</th><th>Zuletzt gelaufen</th><th></th></tr></thead>
            <tbody>
              {REGELN.map((r) => {
                const z = zeitplan.find((x) => x.name === r.art);
                return (
                  <tr key={r.art}>
                    <td>{r.name}</td>
                    <td className="mono klein">{z?.zuletztAm ? datumZeit(z.zuletztAm) : <span className="leise">noch nie</span>}</td>
                    <td style={{ textAlign: "right" }}><form action={jobStarten}><input type="hidden" name="art" value={r.art} /><button className="knopf klein">Jetzt ausführen</button></form></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ) : null}

      {reiter === "meldungen" ? <section className="karte">{meldungen.length ? meldungsListe(meldungen) : <p className="leise">Noch keine Meldungen.</p>}</section> : null}

      {reiter === "jobs" ? (
        <section className="karte">
          <p className="leise klein">Die letzten 25 Arbeiten, die im Hintergrund liefen (Briefe und PDFs erstellen, Qualitätskontrolle, Abgleich mit Lexware). Bei „Fehler“ einmal „Wiederholen“ drücken; klappt es dann nicht, Maximilian Bescheid geben.</p>
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
      ) : null}

      {reiter === "dienste" ? (
        <section className="karte">
          <p className="leise klein">Anschlüsse richtest du unter Stammdaten → Konnektoren ein. Ohne Zugangsdaten läuft ein Dienst im Simulator.</p>
          <table className="tabelle">
            <thead><tr><th>Dienst</th><th className="weg-mobil">Wofür</th><th>Stand</th></tr></thead>
            <tbody>
              {alleDienste.map((d) => (
                <tr key={d.key}>
                  <td><b>{d.name}</b>{!d.echt ? <div className="leise klein">{d.hinweis}</div> : null}</td>
                  <td className="weg-mobil">{d.zweck}</td>
                  <td><Status wert={d.echt ? "echt" : "simulator"} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {reiter === "agenten" ? (
        <section className="karte">
          <p className="leise klein">Jeder KI-Helfer bereitet nur vor. Alles, was nach draußen geht, läuft durch die Qualitätskontrolle und wartet dann auf eure Freigabe.</p>
          <table className="tabelle">
            <thead><tr><th>Helfer</th><th className="weg-mobil">Auslöser</th><th>Was er tut</th><th>Mensch entscheidet</th></tr></thead>
            <tbody>
              {AGENTEN.map((g) => (
                <tr key={g.name}><td><b>{g.name}</b></td><td className="weg-mobil leise klein">{g.ausloeser}</td><td className="klein">{g.macht}<div className="leise">→ {g.ergebnis}</div></td><td className="klein">{g.freigabe}</td></tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </>
  );
}
