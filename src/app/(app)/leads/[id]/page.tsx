import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { Status } from "@/components/Status";
import { Aufnahme } from "@/components/Aufnahme";
import { BetriebFelder } from "@/components/BetriebFelder";
import { datum, datumZeit, DOKART, ZWECK } from "@/lib/format";
import { PAKETE, PaketKey, euro } from "@/lib/pakete";
import { istEcht } from "@/lib/adapters/dienste";
import { basisUrl } from "@/lib/ablauf/gemeinsam";
import { betriebSpeichern, einstufen, terminHochladen, unterschriftSimulieren, widerspruch, zahlungSimulieren } from "../../aktionen";

const SCHRITTE = [
  { key: "neu", text: "Gefunden" },
  { key: "interessant", text: "Interessant" },
  { key: "angeschrieben", text: "Angeschrieben" },
  { key: "termin", text: "Termin" },
  { key: "angebot", text: "Angebot" },
  { key: "kunde", text: "Kunde" },
];

export default async function Lead({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const db = await getDb();
  const [b] = await db.select().from(schema.betriebe).where(eq(schema.betriebe.id, id));
  if (!b) notFound();
  const [doks, post, termine, angebote, projekte, demos, laufend, verlauf] = await Promise.all([
    db.select().from(schema.dokumente).where(eq(schema.dokumente.betriebId, id)).orderBy(desc(schema.dokumente.erstelltAm)),
    db.select().from(schema.postausgang).where(eq(schema.postausgang.betriebId, id)).orderBy(desc(schema.postausgang.erstelltAm)),
    db.select().from(schema.termine).where(eq(schema.termine.betriebId, id)).orderBy(desc(schema.termine.erstelltAm)),
    db.select().from(schema.angebote).where(eq(schema.angebote.betriebId, id)).orderBy(desc(schema.angebote.erstelltAm)),
    db.select().from(schema.projekte).where(eq(schema.projekte.betriebId, id)),
    db.select().from(schema.seiten).where(and(eq(schema.seiten.betriebId, id), eq(schema.seiten.art, "demo"))),
    db.select().from(schema.jobs).where(and(inArray(schema.jobs.status, ["wartet", "laeuft"]), inArray(schema.jobs.art, ["vorbereitung", "transkription", "auswertung"]))),
    db.select().from(schema.protokoll).where(eq(schema.protokoll.betriebId, id)).orderBy(desc(schema.protokoll.am)).limit(20),
  ]);
  const inArbeit = laufend.filter((j) => Number(j.daten.betriebId) === id || termine.some((t) => t.id === Number(j.daten.terminId)));
  const schrittIndex = SCHRITTE.findIndex((s) => s.key === b.status);
  const angebot = angebote[0];
  const offenePost = post.filter((p) => p.status === "zur_freigabe");
  const gesperrt = b.status === "gesperrt";
  const signaturSimuliert = !istEcht("signatur");
  const zahlungSimuliert = !istEcht("zahlung");

  return (
    <>
      <Link href="/leads" className="zurueck">← Leads</Link>
      <div className="kopfzeile">
        <div>
          <h1>{b.name}</h1>
          <p>{[b.gewerk, b.inhaber, b.ort, b.mitarbeiter ? `${b.mitarbeiter} Mitarbeitende` : null].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="knopfreihe">
          {!gesperrt && b.status !== "neu" && b.status !== "nicht_interessant" ? <Link className="knopf klein" href={`/leads/${id}/angebot`}>Angebot erstellen</Link> : null}
          {b.portalToken ? <a className="knopf klein" href={`${basisUrl()}/portal/k/${b.portalToken}`} target="_blank">Kundenportal ansehen</a> : null}
          <Status wert={b.status} />
        </div>
      </div>

      {schrittIndex >= 0 ? (
        <ol className="schritte" aria-label="Fortschritt">
          {SCHRITTE.map((s, i) => (
            <li key={s.key} className={i < schrittIndex ? "erledigt" : i === schrittIndex ? "aktuell" : ""} aria-current={i === schrittIndex ? "step" : undefined}>{s.text}</li>
          ))}
        </ol>
      ) : null}

      <div className="raster zwei">
        <section className="karte">
          <h2>Als Nächstes</h2>
          {inArbeit.length ? <div className="hinweis">Läuft gerade: {inArbeit.map((j) => (j.art === "vorbereitung" ? "Online-Check, Demo und Brief" : j.art === "transkription" ? "Aufnahme abschreiben" : "Protokoll und Angebot")).join(", ")}. Seite in einer Minute neu laden.</div> : null}

          {b.status === "neu" ? (
            <>
              <p>{b.scoreGrund ?? "Noch kein Score-Grund."} <span className="mono leise">Score {b.score ?? "–"}</span></p>
              <p className="leise">„Interessant“ startet automatisch: Online-Check, Demo-Seite, Gesprächsleitfaden und Akquise-Brief zur Freigabe.</p>
              <div className="knopfreihe">
                <form action={einstufen}><input type="hidden" name="id" value={id} /><input type="hidden" name="wahl" value="ja" /><button className="knopf haupt">Interessant</button></form>
                <form action={einstufen}><input type="hidden" name="id" value={id} /><input type="hidden" name="wahl" value="nein" /><button className="knopf">Nicht interessant</button></form>
              </div>
            </>
          ) : null}

          {offenePost.length ? (
            <ul className="liste">
              {offenePost.map((p) => (
                <li key={p.id}>
                  <div><div className="titel">{ZWECK[p.zweck] ?? p.zweck} wartet auf Freigabe</div><div className="unter">{p.betreff}</div></div>
                  <Link className="knopf klein" href={`/freigaben/${p.id}`}>Prüfen</Link>
                </li>
              ))}
            </ul>
          ) : null}

          {b.status === "angeschrieben" ? <p>Brief ist raus. Besuch ab <b>{datum(b.besuchAb)}</b>. Nach dem Gespräch die Aufnahme unten hochladen.</p> : null}

          {angebot && angebot.status === "versendet" ? (
            <div className="karte" style={{ background: "var(--grund)" }}>
              <p><b>Angebot {PAKETE[angebot.paket as PaketKey].name}</b> ist versendet. Wir warten auf die Unterschrift.</p>
              {signaturSimuliert ? (
                <form action={unterschriftSimulieren}><input type="hidden" name="betriebId" value={id} /><input type="hidden" name="angebotId" value={angebot.id} /><button className="knopf">Unterschrift simulieren</button><p className="leise klein" style={{ marginTop: 8 }}>Simulator, bis Docuseal angebunden ist.</p></form>
              ) : null}
            </div>
          ) : null}

          {angebot && angebot.status === "unterschrieben" ? (
            <div className="karte" style={{ background: "var(--grund)" }}>
              <p><b>Unterschrieben am {datum(angebot.unterschriebenAm)}.</b> Wir warten auf die Anzahlung ({euro(Math.round(angebot.einmalig / 2))} netto).</p>
              {zahlungSimuliert ? (
                <form action={zahlungSimulieren}><input type="hidden" name="betriebId" value={id} /><input type="hidden" name="angebotId" value={angebot.id} /><button className="knopf">Zahlungseingang simulieren</button><p className="leise klein" style={{ marginTop: 8 }}>Simulator, bis Stripe und Bankabgleich angebunden sind.</p></form>
              ) : null}
            </div>
          ) : null}

          {projekte.map((p) => (
            <p key={p.id}>Projekt <Link href={`/projekte/${p.id}`}>Paket {p.paket}</Link> <Status wert={p.status} /></p>
          ))}

          {!inArbeit.length && !offenePost.length && b.status === "nicht_interessant" ? <p className="leise">Nicht interessant. Wird nach 6 Monaten ohne Aktivität automatisch gelöscht.</p> : null}
          {gesperrt ? <div className="hinweis fehler">Dieser Betrieb hat widersprochen. Er wird nie wieder angeschrieben.</div> : null}
        </section>

        <section className="karte">
          <h2>Unterlagen</h2>
          {doks.length || demos.length ? (
            <ul className="liste">
              {demos.map((d) => (
                <li key={d.slug}>
                  <div><div className="titel">Demo-Website</div><div className="unter">Code <span className="mono">{d.zugangscode}</span> · gelöscht am {datum(d.loeschenAm)}</div></div>
                  <a className="knopf klein" href={`/vorschau/${d.slug}?code=${d.zugangscode}`} target="_blank">Öffnen</a>
                </li>
              ))}
              {doks.map((d) => (
                <li key={d.id}>
                  <div><div className="titel">{DOKART[d.art] ?? d.art}</div><div className="unter">{d.titel} · {datum(d.erstelltAm)}</div></div>
                  <a className="knopf klein" href={`/dokument/${d.id}`} target="_blank">PDF</a>
                </li>
              ))}
            </ul>
          ) : (
            <div className="leer"><strong>Noch keine Unterlagen.</strong>Sie entstehen nach „Interessant“.</div>
          )}
        </section>
      </div>

      {!gesperrt && ["interessant", "angeschrieben", "termin", "angebot"].includes(b.status) ? (
        <section className="karte abstand">
          <h2>Termin vor Ort aufnehmen</h2>
          <p className="leise">Aus der Aufnahme entstehen Protokoll, Maßnahmenplan, Angebot und Begleit-Mail. Alles geht vorher durch die Freigabe. Die Aufnahme wird nach dem Versand gelöscht.</p>
          <form action={terminHochladen}>
            <input type="hidden" name="id" value={id} />
            <label className="haken" style={{ marginBottom: 16 }}>
              <input type="checkbox" name="einwilligung" value="ja" required />
              <span><b>Einwilligung liegt vor.</b> {b.inhaber ?? "Der Inhaber"} ist mit der Aufnahme einverstanden. Ohne Haken wird nichts gespeichert.</span>
            </label>
            <Aufnahme />
            <button className="knopf haupt">Aufnahme speichern</button>
          </form>
          {termine.length ? (
            <ul className="liste abstand">
              {termine.map((t) => (
                <li key={t.id}><div><div className="titel">Termin {datumZeit(t.datum)}</div><div className="unter">Einwilligung von {t.einwilligungVon} · {t.audioGeloeschtAm ? `Aufnahme gelöscht am ${datum(t.audioGeloeschtAm)}` : "Aufnahme gespeichert"}</div></div><Status wert={t.status} /></li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <div className="raster zwei abstand">
        <section className="karte">
          <h2>Post an diesen Betrieb</h2>
          {post.length ? (
            <ul className="liste">
              {post.map((p) => (
                <li key={p.id}>
                  <div><div className="titel"><Link href={`/freigaben/${p.id}`}>{ZWECK[p.zweck] ?? p.zweck}</Link></div><div className="unter">{datumZeit(p.versendetAm ?? p.erstelltAm)}</div></div>
                  <Status wert={p.status} />
                </li>
              ))}
            </ul>
          ) : <p className="leise">Noch nichts.</p>}
        </section>
        <section className="karte">
          <h2>Verlauf</h2>
          {verlauf.length ? (
            <ul className="liste">
              {verlauf.map((v) => (
                <li key={v.id}><div><div>{v.aktion}</div><div className="unter">{v.wer} · {datumZeit(v.am)}</div></div></li>
              ))}
            </ul>
          ) : <p className="leise">Noch nichts.</p>}
        </section>
      </div>

      <details className="karte abstand">
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>Stammdaten bearbeiten</summary>
        <form action={betriebSpeichern} style={{ marginTop: 16 }}>
          <input type="hidden" name="id" value={id} />
          <BetriebFelder b={b} />
          <button className="knopf">Speichern</button>
        </form>
      </details>

      {!gesperrt ? (
        <details className="karte abstand">
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>Widerspruch eintragen</summary>
          <p className="leise" style={{ marginTop: 12 }}>Der Betrieb kommt auf die Sperrliste. Offene Post wird gestoppt, die Demo gelöscht, und er wird nie wieder angeschrieben.</p>
          <form action={widerspruch} className="knopfreihe">
            <input type="hidden" name="id" value={id} />
            <input name="grund" placeholder="Grund, z. B. Anruf vom 20.10." style={{ maxWidth: 360 }} />
            <button className="knopf gefahr">Auf Sperrliste setzen</button>
          </form>
        </details>
      ) : null}
    </>
  );
}
