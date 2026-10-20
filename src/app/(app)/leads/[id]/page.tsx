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
import { aktivitaetAnlegen, betriebSpeichern, betriebZuweisen, datenLoeschen, einstufen, kontaktLoeschen, kontaktSpeichern, terminHochladen, unterschriftSimulieren, widerspruch, zahlungSimulieren } from "../../aktionen";
import { AufgabenListe } from "@/components/AufgabenListe";
import { ARTEN } from "@/lib/ablauf/crm";
import { ticketNummer } from "@/lib/ablauf/tickets";

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
  const [kontakte, aktivitaeten, tickets, benutzer] = await Promise.all([
    db.select().from(schema.kontakte).where(eq(schema.kontakte.betriebId, id)).orderBy(desc(schema.kontakte.haupt), schema.kontakte.name),
    db.select().from(schema.aktivitaeten).where(eq(schema.aktivitaeten.betriebId, id)).orderBy(desc(schema.aktivitaeten.erstelltAm)),
    db.select().from(schema.tickets).where(eq(schema.tickets.betriebId, id)).orderBy(desc(schema.tickets.erstelltAm)),
    db.select({ name: schema.benutzer.name }).from(schema.benutzer),
  ]);
  const offeneAufgaben = aktivitaeten.filter((a) => !a.erledigtAm && a.faelligAm).sort((x, y) => x.faelligAm!.getTime() - y.faelligAm!.getTime());
  const chronik = aktivitaeten.filter((a) => a.erledigtAm || !a.faelligAm);
  const morgen = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
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
      <Link href="/leads" className="zurueck">← Betriebe</Link>
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


      <div className="raster zwei abstand" style={{ alignItems: "start" }}>
        <section className="karte">
          <h2>Aktivitäten</h2>
          <form action={aktivitaetAnlegen} className="raster zwei" style={{ marginBottom: 12 }}>
            <input type="hidden" name="betriebId" value={id} />
            <input type="hidden" name="zurueck" value={`/leads/${id}`} />
            <label className="feld"><span>Art</span><select name="art" defaultValue="anruf">{Object.entries(ARTEN).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
            <label className="feld"><span>Kurz</span><input name="titel" placeholder="z. B. Rückruf wegen Fotos" /></label>
            <label className="feld" style={{ gridColumn: "1 / -1" }}><span>Notiz</span><textarea name="text" rows={2} placeholder="Was wurde besprochen? Bei Aufgabe oder Termin: Datum unten." /></label>
            <label className="feld"><span>Datum (Aufgabe, Termin)</span><input type="date" name="faellig" defaultValue={morgen} /></label>
            <label className="feld"><span>Für</span><select name="zustaendig" defaultValue={b.zustaendig ?? ""}><option value="">mich</option>{benutzer.map((x) => <option key={x.name}>{x.name}</option>)}</select></label>
            <div><button className="knopf">Speichern</button></div>
          </form>
          {offeneAufgaben.length ? <><h3>Offen</h3><AufgabenListe eintraege={offeneAufgaben.map((a) => ({ a, betrieb: null }))} zurueck={`/leads/${id}`} mitBetrieb={false} /></> : <p className="leise klein">Kein nächster Schritt geplant.</p>}
          {chronik.length ? (
            <>
              <h3>Chronik</h3>
              <ul className="liste">
                {chronik.slice(0, 25).map((a) => <li key={a.id}><div><div className="titel">{ARTEN[a.art]}: {a.titel}</div><div className="unter">{datumZeit(a.erledigtAm ?? a.erstelltAm)} · {a.erstelltVon}{a.text ? ` · ${a.text}` : ""}</div></div></li>)}
              </ul>
            </>
          ) : null}
        </section>
        <div>
          <section className="karte">
            <h2>Ansprechpartner</h2>
            {kontakte.length ? (
              <ul className="liste">
                {kontakte.map((k) => (
                  <li key={k.id}>
                    <div style={{ flex: 1 }}><div className="titel">{k.name}{k.haupt ? <span className="marke-klein" style={{ marginLeft: 6 }}>Hauptkontakt</span> : null}</div><div className="unter">{[k.rolle, k.telefon ? <a key="t" href={`tel:${k.telefon.replace(/\s/g, "")}`}>{k.telefon}</a> : null, k.email ? <a key="m" href={`mailto:${k.email}`}>{k.email}</a> : null].filter(Boolean).map((x, i) => <span key={i}>{i ? " · " : ""}{x}</span>)}</div></div>
                    <form action={kontaktLoeschen}><input type="hidden" name="id" value={k.id} /><input type="hidden" name="betriebId" value={id} /><button className="knopf klein" aria-label={`${k.name} löschen`}>Löschen</button></form>
                  </li>
                ))}
              </ul>
            ) : <p className="leise klein">Noch keine. {b.inhaber ? `Inhaber laut Stammdaten: ${b.inhaber}.` : ""}</p>}
            <details style={{ marginTop: 8 }}>
              <summary style={{ cursor: "pointer" }}>Ansprechpartner hinzufügen</summary>
              <form action={kontaktSpeichern} style={{ marginTop: 8 }}>
                <input type="hidden" name="betriebId" value={id} />
                <div className="raster zwei">
                  <label className="feld"><span>Name</span><input name="name" required /></label>
                  <label className="feld"><span>Rolle</span><input name="rolle" placeholder="Büro, Meister, IT …" /></label>
                  <label className="feld"><span>Telefon</span><input name="telefon" type="tel" /></label>
                  <label className="feld"><span>E-Mail</span><input name="email" type="email" /></label>
                </div>
                <label className="haken" style={{ marginBottom: 12 }}><input type="checkbox" name="haupt" value="ja" /><span>Hauptkontakt</span></label>
                <button className="knopf">Hinzufügen</button>
              </form>
            </details>
          </section>
          <form action={betriebZuweisen} className="karte abstand">
            <h2>Zuständig und Schlagworte</h2>
            <input type="hidden" name="id" value={id} />
            <div className="raster zwei">
              <label className="feld"><span>Zuständig</span><select name="zustaendig" defaultValue={b.zustaendig ?? ""}><option value="">niemand</option>{benutzer.map((x) => <option key={x.name}>{x.name}</option>)}</select></label>
              <label className="feld"><span>Schlagworte (mit Komma)</span><input name="tags" defaultValue={b.tags.join(", ")} placeholder="Messe 2027, Empfehlung" /></label>
            </div>
            <button className="knopf">Speichern</button>
          </form>
          <section className="karte abstand">
            <div className="kopfzeile" style={{ marginBottom: 4 }}><h2 style={{ margin: 0 }}>Tickets</h2>{b.status === "kunde" ? <Link className="knopf klein" href={`/tickets?betrieb=${id}`}>Ticket aufnehmen</Link> : null}</div>
            {tickets.length ? <ul className="liste">{tickets.map((t) => <li key={t.id}><div><div className="titel"><Link href={`/tickets/${t.id}`}>{ticketNummer(t.id)} {t.betreff}</Link></div><div className="unter">{datum(t.erstelltAm)}</div></div><Status wert={t.status === "in_arbeit" ? "in_arbeit_ticket" : t.status === "erledigt" ? "fertig" : t.status} /></li>)}</ul> : <p className="leise klein">Keine Tickets.</p>}
          </section>
        </div>
      </div>

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

      <details className="karte abstand">
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>Datenschutz: Auskunft und Löschung</summary>
        <p className="leise" style={{ marginTop: 12 }}>Fragt der Betrieb, was wir über ihn gespeichert haben (Art. 15 DSGVO), lade die Auskunft herunter und schicke sie ihm. Antwort spätestens nach einem Monat.</p>
        <a className="knopf klein" href={`/betrieb-daten/${id}`}>Datenauskunft herunterladen (JSON)</a>
        <form action={datenLoeschen} style={{ marginTop: 20 }}>
          <input type="hidden" name="id" value={id} />
          <p className="leise">Löschung auf Wunsch (Art. 17 DSGVO): Löscht Aufnahmen, Dokumente, Demo, Website, Anfragen und Kontaktdaten. Rechnungen und Vertragsunterlagen bleiben wegen der Aufbewahrungspflicht (§ 147 AO, § 257 HGB). Der Betrieb kommt auf die Sperrliste. Das lässt sich nicht rückgängig machen.</p>
          <label className="feld"><span>Zur Bestätigung den Namen eintragen: {b.name}</span><input name="bestaetigung" autoComplete="off" required style={{ maxWidth: 360 }} /></label>
          <button className="knopf gefahr">Endgültig löschen</button>
        </form>
      </details>
    </>
  );
}
