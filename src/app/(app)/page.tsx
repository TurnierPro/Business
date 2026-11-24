import Link from "next/link";
import { and, desc, eq, inArray, isNull, lte, ne, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { datumZeit, inTagen, ZWECK } from "@/lib/format";
import { brauchtBenutzer } from "@/lib/auth";
import { beispieleErlaubt } from "@/lib/beispiele";
import { beispieleLaden, nachrichtErledigt, nachrichtZuordnen } from "./aktionen";
import { KANAELE, unbekannteNachrichten } from "@/lib/ablauf/nachrichten";
import { offeneAufgaben } from "@/lib/ablauf/crm";
import { AufgabenListe } from "@/components/AufgabenListe";
import { ticketNummer } from "@/lib/ablauf/tickets";
import { zuTunZahlen } from "@/lib/zutun";
import { FREIGABE_GRUPPEN, gruppeVon, gruppenName, QK_REIHENFOLGE } from "@/lib/freigabe-gruppen";
import { SeitenReiter } from "@/components/Seite";

export const metadata = { title: "Zu tun" };

// „Zu tun“: alles in „Mein Tag“, nach Zeit gefiltert (Heute, nächste 7 Tage, später). Wichtigstes zuerst, Leeres fällt weg.

/** Grund einer Sperre kurz: erster Satz, ohne technische Fehlertexte. */
const kurz = (t: string) => {
  const satz = t.replace(/^Blockiert:\s*/, "").split(/\s\(|\.\s|\n/)[0];
  return satz.length > 110 ? `${satz.slice(0, 110)} …` : satz;
};

/** Abschnitt innerhalb von „Mein Tag“: kleine Überschrift mit Zahl, optional Link zur ganzen Liste. */
function Abschnitt({ id, titel, zahl, mehr, children }: { id?: string; titel: string; zahl: number; mehr?: { href: string; text: string }; children: React.ReactNode }) {
  return (
    <div className="tag-abschnitt" id={id}>
      <div className="tag-abschnitt-kopf">
        <h3>{titel} <span className="anzahl-pille">{zahl}</span></h3>
        {mehr ? <Link className="klein" href={mehr.href}>{mehr.text} →</Link> : null}
      </div>
      {children}
    </div>
  );
}

export default async function ZuTun({ searchParams }: { searchParams: Promise<{ zeit?: string }> }) {
  const b = await brauchtBenutzer();
  const db = await getDb();
  const jetzt = new Date();
  const [freigaben, neueLeads, besuche, tickets, fehlerJobs, warnungen, pannen, anfragenDs, meineAufgaben, [{ n: anzahlBetriebe }], [{ n: laedt }]] = await Promise.all([
    db.select().from(schema.postausgang).where(eq(schema.postausgang.status, "zur_freigabe")).orderBy(schema.postausgang.erstelltAm),
    db.select().from(schema.betriebe).where(eq(schema.betriebe.status, "neu")).orderBy(desc(schema.betriebe.score)),
    db.select().from(schema.betriebe).where(and(eq(schema.betriebe.status, "angeschrieben"), lte(schema.betriebe.besuchAb, jetzt))),
    db.select({ t: schema.tickets, name: schema.betriebe.name }).from(schema.tickets).innerJoin(schema.betriebe, eq(schema.tickets.betriebId, schema.betriebe.id)).where(inArray(schema.tickets.status, ["neu", "in_arbeit"])).orderBy(desc(schema.tickets.erstelltAm)),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.jobs).where(eq(schema.jobs.status, "fehler")),
    db.select().from(schema.meldungen).where(and(eq(schema.meldungen.ok, false), ne(schema.meldungen.art, "tagesbericht"))).orderBy(desc(schema.meldungen.am)).limit(3),
    db.select().from(schema.datenpannen).where(isNull(schema.datenpannen.abgeschlossenAm)),
    db.select().from(schema.betroffenenanfragen).where(isNull(schema.betroffenenanfragen.erledigtAm)),
    offeneAufgaben({ wer: b.name }),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.betriebe),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.jobs).where(and(eq(schema.jobs.art, "beispieldaten"), inArray(schema.jobs.status, ["wartet", "laeuft"]))),
  ]);
  const unbekannt = await unbekannteNachrichten();
  const zahlen = await zuTunZahlen(b.name, jetzt); // gleiche Zählung wie im Menü
  // „Mein Tag“ nach Zeit: heute (mit Überfälligem), die nächsten 7 Tage, später (auch ohne Datum)
  const morgenFrueh = inTagen(1, "00:00");
  const inAchtTagen = inTagen(8, "00:00");
  const heuteFaellig = meineAufgaben.filter((x) => x.a.faelligAm && x.a.faelligAm < morgenFrueh);
  const demnaechst = meineAufgaben.filter((x) => x.a.faelligAm && x.a.faelligAm >= morgenFrueh && x.a.faelligAm < inAchtTagen);
  const spaeter = meineAufgaben.filter((x) => !x.a.faelligAm || x.a.faelligAm >= inAchtTagen);
  const [ich] = await db.select({ totpAktiv: schema.benutzer.totpAktiv }).from(schema.benutzer).where(eq(schema.benutzer.id, b.id));
  const betriebIds = [...new Set(freigaben.map((f) => f.betriebId).filter((x): x is number => !!x))];
  const namen = new Map((betriebIds.length ? await db.select({ id: schema.betriebe.id, name: schema.betriebe.name }).from(schema.betriebe).where(inArray(schema.betriebe.id, betriebIds)) : []).map((x) => [x.id, x.name]));
  const alleBetriebe = unbekannt.length ? await db.select({ id: schema.betriebe.id, name: schema.betriebe.name }).from(schema.betriebe).orderBy(schema.betriebe.name) : [];
  const stunde = Number(jetzt.toLocaleString("de-DE", { hour: "numeric", hourCycle: "h23", timeZone: "Europe/Berlin" }));
  const gruss = stunde < 11 ? "Guten Morgen" : stunde < 18 ? "Hallo" : "Guten Abend";
  const heute = jetzt.toISOString().slice(0, 10);
  // Hinweise: Dringendes gehört zu „Heute“, Erinnerungen zu „Später“
  type Hinweis = { text: string; href: string; art: "dringend" | "frist" | "erinnerung"; knopf: string };
  const hinweise: Hinweis[] = [
    ...(pannen.length ? [{ text: `${pannen.length} offene Datenpanne${pannen.length > 1 ? "n" : ""}: Meldefrist 72 Stunden`, href: "/datenschutz?reiter=vorfaelle", art: "dringend" as const, knopf: "Öffnen" }] : []),
    ...(anfragenDs.length ? [{ text: `${anfragenDs.length} Anfrage${anfragenDs.length > 1 ? "n" : ""} von Betroffenen offen: Frist ein Monat`, href: "/datenschutz?reiter=vorfaelle", art: "dringend" as const, knopf: "Öffnen" }] : []),
    ...(fehlerJobs[0].n ? [{ text: `${fehlerJobs[0].n} Hintergrund-Job${fehlerJobs[0].n > 1 ? "s" : ""} mit Fehler`, href: "/system?reiter=jobs", art: "dringend" as const, knopf: "Ansehen" }] : []),
    ...warnungen.map((m) => ({ text: m.titel, href: "/system?reiter=meldungen", art: "dringend" as const, knopf: "Ansehen" })),
    ...(ich && !ich.totpAktiv ? [{ text: "Zwei-Faktor-Anmeldung einrichten (auf dem Server Pflicht, dauert zwei Minuten)", href: "/zwei-faktor", art: "erinnerung" as const, knopf: "Einrichten" }] : []),
  ];
  const HINWEIS_STATUS = { dringend: { klasse: "fehler", wort: "dringend" }, frist: { klasse: "warten", wort: "Frist" }, erinnerung: { klasse: "", wort: "Erinnerung" } };
  // Freigaben nach Art gruppiert, je Gruppe höchstens drei, Blockiertes zuerst
  const freigabeGruppen = [...FREIGABE_GRUPPEN.map((g) => g.key), "sonstiges"]
    .map((key) => ({ key, name: gruppenName(key), eintraege: freigaben.filter((f) => gruppeVon(f.zweck) === key).sort((x, y) => (QK_REIHENFOLGE[x.qkStatus] ?? 9) - (QK_REIHENFOLGE[y.qkStatus] ?? 9)) }))
    .filter((g) => g.eintraege.length);
  const dringend = hinweise.filter((h) => h.art === "dringend");
  const erinnerungen = hinweise.filter((h) => h.art !== "dringend");
  const heuteZahl = heuteFaellig.length + besuche.length + freigaben.length + neueLeads.length + tickets.length + unbekannt.length + dringend.length;
  const zeiten = [
    { key: "heute", name: "Heute", zahl: heuteZahl, ton: dringend.length || heuteFaellig.some((x) => x.a.faelligAm! < inTagen(0, "00:00")) ? ("fehler" as const) : undefined },
    { key: "woche", name: "Nächste 7 Tage", zahl: demnaechst.length },
    { key: "spaeter", name: "Später", zahl: spaeter.length + erinnerungen.length },
  ];
  const gewuenscht = (await searchParams).zeit;
  const zeitWahl = zeiten.some((z) => z.key === gewuenscht) ? gewuenscht! : "heute";
  const hinweisListe = (liste: Hinweis[]) => (
    <ul className="zeilen">
      {liste.map((h) => (
        <li key={h.text}>
          <div className="knopfreihe" style={{ gap: 10, flexWrap: "nowrap", alignItems: "baseline" }}>
            <span className={`status ${HINWEIS_STATUS[h.art].klasse}`}>{HINWEIS_STATUS[h.art].wort}</span>
            <span>{h.text}</span>
          </div>
          <Link className="knopf klein" href={h.href}>{h.knopf}</Link>
        </li>
      ))}
    </ul>
  );
  const nichts = !freigaben.length && !meineAufgaben.length && !hinweise.length && !neueLeads.length && !besuche.length && !tickets.length && !unbekannt.length;

  return (
    <>
      <div className="kopfzeile">
        <div>
          <h1>{gruss}, {b.name.split(" ")[0]}.</h1>
          <p>{nichts ? "Alles erledigt. Gerade wartet nichts auf dich." : "Das ist jetzt dran, das Wichtigste zuerst."}</p>
        </div>
      </div>

      {laedt ? <div className="hinweis">Beispieldaten werden geladen. In etwa einer Minute die Seite neu laden.</div> : null}
      {!laedt && !anzahlBetriebe && beispieleErlaubt() ? (
        <section className="karte" style={{ marginBottom: 16 }}>
          <h2>Noch leer. Willst du sehen, wie alles zusammenläuft?</h2>
          <p className="leise">16 erfundene Betriebe in allen Phasen, vom neuen Lead bis zur Website, die live ist. Unter Logs → Technik wieder entfernen.</p>
          <form action={beispieleLaden}><button className="knopf haupt">Beispieldaten laden</button></form>
        </section>
      ) : null}

      {!nichts ? (
        <div className="auf-einen-blick" style={{ marginBottom: 16 }} aria-label="Überblick">
          {[
            { id: "aufgaben", etikett: "Aufgaben", n: zahlen.aufgaben, unter: "heute fällig" },
            { id: "aufgaben", etikett: "Besuche", n: zahlen.besuche, unter: "fällig" },
            { id: "freigeben", etikett: "Freigeben", n: zahlen.freigaben, unter: "wartet auf dein OK" },
            { id: "einstufen", etikett: "Einstufen", n: zahlen.einstufen, unter: "neue Leads" },
            { id: "tickets", etikett: "Tickets", n: zahlen.tickets, unter: "von Kunden offen" },
            { id: "unbekannt", etikett: "Nachrichten", n: zahlen.unbekannt, unter: "ohne Betrieb" },
          ].filter((k) => k.n || k.etikett === "Aufgaben").map((k) => (
            <a key={k.etikett} className="blick" href={k.n ? `/?zeit=heute#${k.id}` : undefined} aria-disabled={!k.n} style={k.n ? undefined : { opacity: 0.55 }}>
              <span className="etikett">{k.etikett}</span>
              <span className="wert" style={{ fontFamily: "var(--mono)", fontSize: 26 }}>{k.n}</span>
              <span className="unter">{k.unter}</span>
            </a>
          ))}
        </div>
      ) : null}

      <section className="karte mein-tag" id="mein-tag" aria-labelledby="meintag">
        <div className="kopfzeile" style={{ marginBottom: 4 }}>
          <h2 id="meintag" style={{ margin: 0 }}>Mein Tag</h2>
          <Link className="knopf klein" href="/aufgaben">Alle Aufgaben</Link>
        </div>
        <p className="leise klein" style={{ marginBottom: 8 }}>Alles, was auf dich wartet, an einer Stelle. Abhaken, wenn erledigt; „Morgen“ schiebt um einen Tag.</p>
        <SeitenReiter basis="/" param="zeit" aktiv={zeitWahl} liste={zeiten} />

        {zeitWahl === "heute" ? (
          <>
            {!heuteZahl ? <p className="leise">Heute steht nichts an.{demnaechst.length ? " In den nächsten 7 Tagen kommt noch etwas, siehe Reiter oben." : ""}</p> : null}
            {dringend.length ? <Abschnitt titel="Dringend" zahl={dringend.length}>{hinweisListe(dringend)}</Abschnitt> : null}
            {heuteFaellig.length ? <Abschnitt id="aufgaben" titel="Aufgaben heute und überfällig" zahl={heuteFaellig.length}><AufgabenListe eintraege={heuteFaellig} zurueck="/" /></Abschnitt> : null}

            {freigaben.length ? (
              <Abschnitt id="freigeben" titel="Freigeben" zahl={freigaben.length} mehr={{ href: "/freigaben", text: "Alle Freigaben" }}>
                <div className="freigabe-gruppen">
                  {freigabeGruppen.map((g) => (
                    <div key={g.key} className="freigabe-gruppe">
                      <div className="gruppe-kopf">
                        <Link href={`/freigaben?art=${g.key}`} className="gruppe-titel" style={{ margin: 0 }}>{g.name} · {g.eintraege.length}</Link>
                        {g.eintraege.length > 3 ? <Link className="klein" href={`/freigaben?art=${g.key}`}>alle {g.eintraege.length} →</Link> : null}
                      </div>
                      <ul className="zeilen kurz">
                        {g.eintraege.slice(0, 3).map((f) => (
                          <li key={f.id}>
                            <Link href={`/freigaben/${f.id}`} className="zeile-link">
                              <span className="titel">{f.betriebId && namen.get(f.betriebId) ? namen.get(f.betriebId) : "Levarex intern"}</span>
                              <span className="unter">{ZWECK[f.zweck] ?? f.zweck}{f.qkStatus === "blockiert" && f.hinweise[0] ? ` · ${kurz(f.hinweise[0])}` : ""}</span>
                            </Link>
                            <span className={`status ${f.qkStatus === "blockiert" ? "fehler" : f.hinweise.length ? "warten" : "ok"}`}>{f.qkStatus === "blockiert" ? "blockiert" : f.hinweise.length ? `${f.hinweise.length} Hinweis${f.hinweise.length > 1 ? "e" : ""}` : "OK"}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </Abschnitt>
            ) : null}

            {besuche.length ? (
              <Abschnitt titel="Besuche fällig" zahl={besuche.length}>
                <ul className="liste">
                  {besuche.map((l) => <li key={l.id}><div style={{ flex: 1 }}><div className="titel">{l.name}</div><div className="unter">{l.strasse}, {l.plz} {l.ort}</div></div><Link className="knopf klein" href={`/leads/${l.id}?tab=aktivitaeten&erfassen=besuch`}>Besuch erfassen</Link></li>)}
                </ul>
              </Abschnitt>
            ) : null}

            {neueLeads.length ? (
              <Abschnitt id="einstufen" titel="Leads einstufen" zahl={neueLeads.length} mehr={neueLeads.length > 5 ? { href: "/leads?status=neu", text: "Alle neuen" } : undefined}>
                <ul className="liste">
                  {neueLeads.slice(0, 5).map((l) => (
                    <li key={l.id}><div style={{ flex: 1 }}><div className="titel">{l.name}</div><div className="unter">{[l.gewerk, l.ort, l.score ? `Score ${l.score}` : null].filter(Boolean).join(" · ")}</div></div><Link className="knopf klein" href={`/leads/${l.id}`}>Einstufen</Link></li>
                  ))}
                </ul>
              </Abschnitt>
            ) : null}

            {tickets.length ? (
              <Abschnitt id="tickets" titel="Tickets von Kunden" zahl={tickets.length} mehr={{ href: "/tickets", text: "Alle Tickets" }}>
                <ul className="liste">
                  {tickets.slice(0, 5).map(({ t, name }) => <li key={t.id}><div style={{ flex: 1 }}><div className="titel">{ticketNummer(t.id)} {t.betreff}</div><div className="unter">{name}{t.prioritaet !== "normal" ? ` · ${t.prioritaet}` : ""}</div></div><Link className="knopf klein" href={`/tickets/${t.id}`}>Öffnen</Link></li>)}
                </ul>
              </Abschnitt>
            ) : null}

            {unbekannt.length ? (
              <Abschnitt id="unbekannt" titel="Nachrichten ohne Betrieb" zahl={unbekannt.length}>
                <p className="leise klein" style={{ margin: "0 0 6px" }}>Absender nicht erkannt. Betrieb wählen, dann entstehen Aufgabe und Antwortentwurf. Ohne Zuordnung nach 90 Tagen gelöscht.</p>
                <ul className="liste">
                  {unbekannt.slice(0, 5).map((n) => (
                    <li key={n.id} style={{ flexWrap: "wrap" }}>
                      <div style={{ flex: "1 1 260px" }}><div className="titel">{KANAELE[n.kanal]} von {n.absender}</div><div className="unter">{datumZeit(n.zeit)} · {n.betreff ? `${n.betreff}: ` : ""}{n.inhalt.slice(0, 140)}</div></div>
                      <form action={nachrichtZuordnen} className="knopfreihe">
                        <input type="hidden" name="id" value={n.id} />
                        <select name="betriebId" aria-label="Betrieb wählen" required defaultValue=""><option value="" disabled>Betrieb wählen</option>{alleBetriebe.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
                        <button className="knopf klein">Zuordnen</button>
                      </form>
                      <form action={nachrichtErledigt}><input type="hidden" name="id" value={n.id} /><button className="knopf klein">Ignorieren</button></form>
                    </li>
                  ))}
                </ul>
              </Abschnitt>
            ) : null}
          </>
        ) : null}

        {zeitWahl === "woche" ? (
          demnaechst.length ? <Abschnitt titel="Aufgaben in den nächsten 7 Tagen" zahl={demnaechst.length}><AufgabenListe eintraege={demnaechst} zurueck="/?zeit=woche" /></Abschnitt> : <p className="leise">In den nächsten 7 Tagen steht nichts an.</p>
        ) : null}

        {zeitWahl === "spaeter" ? (
          <>
            {!spaeter.length && !erinnerungen.length ? <p className="leise">Später steht nichts an.</p> : null}
            {spaeter.length ? <Abschnitt titel="Aufgaben ab nächster Woche oder ohne Datum" zahl={spaeter.length}><AufgabenListe eintraege={spaeter} zurueck="/?zeit=spaeter" /></Abschnitt> : null}
            {erinnerungen.length ? <Abschnitt titel="Nicht vergessen" zahl={erinnerungen.length}>{hinweisListe(erinnerungen)}</Abschnitt> : null}
          </>
        ) : null}
      </section>
    </>
  );
}
