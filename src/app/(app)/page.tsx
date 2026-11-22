import Link from "next/link";
import { and, desc, eq, inArray, isNull, lte, ne, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { datumZeit, inTagen, ZWECK } from "@/lib/format";
import { brauchtBenutzer } from "@/lib/auth";
import { beispieleErlaubt } from "@/lib/beispiele";
import { beispieleLaden, nachrichtErledigt, nachrichtZuordnen } from "./aktionen";
import { KANAELE, unbekannteNachrichten } from "@/lib/ablauf/nachrichten";
import { ETAPPEN, FRISTEN, stand, UNTERLAGEN } from "@/lib/unterlagen";
import { offeneAufgaben } from "@/lib/ablauf/crm";
import { AufgabenListe } from "@/components/AufgabenListe";
import { ticketNummer } from "@/lib/ablauf/tickets";
import { zuTunZahlen } from "@/lib/zutun";
import { FREIGABE_GRUPPEN, gruppeVon, gruppenName, QK_REIHENFOLGE } from "@/lib/freigabe-gruppen";

export const metadata = { title: "Zu tun" };

// „Zu tun“: nur, was jetzt eine Entscheidung oder Handlung von dir braucht. Wichtigstes zuerst, Leeres fällt weg.

function Block({ id, titel, erklaerung, zahl, mehr, children }: { id?: string; titel: string; erklaerung: string; zahl: number; mehr?: { href: string; text: string }; children: React.ReactNode }) {
  return (
    <section className="karte" id={id}>
      <div className="kopfzeile" style={{ marginBottom: 4 }}>
        <h2 style={{ margin: 0 }}>{titel} <span className="anzahl-pille">{zahl}</span></h2>
        {mehr ? <Link className="knopf klein" href={mehr.href}>{mehr.text}</Link> : null}
      </div>
      <p className="leise klein" style={{ marginBottom: 8 }}>{erklaerung}</p>
      {children}
    </section>
  );
}

export default async function ZuTun() {
  const b = await brauchtBenutzer();
  const db = await getDb();
  const jetzt = new Date();
  const [freigaben, neueLeads, besuche, tickets, fehlerJobs, warnungen, pannen, anfragenDs, unterlagenStand, meineAufgaben, [{ n: anzahlBetriebe }], [{ n: laedt }]] = await Promise.all([
    db.select().from(schema.postausgang).where(eq(schema.postausgang.status, "zur_freigabe")).orderBy(schema.postausgang.erstelltAm),
    db.select().from(schema.betriebe).where(eq(schema.betriebe.status, "neu")).orderBy(desc(schema.betriebe.score)),
    db.select().from(schema.betriebe).where(and(eq(schema.betriebe.status, "angeschrieben"), lte(schema.betriebe.besuchAb, jetzt))),
    db.select({ t: schema.tickets, name: schema.betriebe.name }).from(schema.tickets).innerJoin(schema.betriebe, eq(schema.tickets.betriebId, schema.betriebe.id)).where(inArray(schema.tickets.status, ["neu", "in_arbeit"])).orderBy(desc(schema.tickets.erstelltAm)),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.jobs).where(eq(schema.jobs.status, "fehler")),
    db.select().from(schema.meldungen).where(and(eq(schema.meldungen.ok, false), ne(schema.meldungen.art, "tagesbericht"))).orderBy(desc(schema.meldungen.am)).limit(3),
    db.select().from(schema.datenpannen).where(isNull(schema.datenpannen.abgeschlossenAm)),
    db.select().from(schema.betroffenenanfragen).where(isNull(schema.betroffenenanfragen.erledigtAm)),
    stand(),
    offeneAufgaben({ wer: b.name, bis: inTagen(8, "00:00") }),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.betriebe),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.jobs).where(and(eq(schema.jobs.art, "beispieldaten"), inArray(schema.jobs.status, ["wartet", "laeuft"]))),
  ]);
  const unbekannt = await unbekannteNachrichten();
  const zahlen = await zuTunZahlen(b.name, jetzt); // gleiche Zählung wie im Menü
  // „Mein Tag“: heute und überfällig; die nächsten 7 Tage kompakt darunter
  const morgenFrueh = inTagen(1, "00:00");
  const heuteFaellig = meineAufgaben.filter((x) => x.a.faelligAm && x.a.faelligAm < morgenFrueh);
  const demnaechst = meineAufgaben.filter((x) => x.a.faelligAm && x.a.faelligAm >= morgenFrueh);
  const [ich] = await db.select({ totpAktiv: schema.benutzer.totpAktiv }).from(schema.benutzer).where(eq(schema.benutzer.id, b.id));
  const betriebIds = [...new Set(freigaben.map((f) => f.betriebId).filter((x): x is number => !!x))];
  const namen = new Map((betriebIds.length ? await db.select({ id: schema.betriebe.id, name: schema.betriebe.name }).from(schema.betriebe).where(inArray(schema.betriebe.id, betriebIds)) : []).map((x) => [x.id, x.name]));
  const alleBetriebe = unbekannt.length ? await db.select({ id: schema.betriebe.id, name: schema.betriebe.name }).from(schema.betriebe).orderBy(schema.betriebe.name) : [];
  const stunde = Number(jetzt.toLocaleString("de-DE", { hour: "numeric", hourCycle: "h23", timeZone: "Europe/Berlin" }));
  const gruss = stunde < 11 ? "Guten Morgen" : stunde < 18 ? "Hallo" : "Guten Abend";
  const heute = jetzt.toISOString().slice(0, 10);
  const offen = (u: (typeof UNTERLAGEN)[number]) => !["erledigt", "entfaellt"].includes(unterlagenStand.get(u.key)?.status ?? (u.etappe === 0 ? "entfaellt" : "offen"));
  const etappe = ETAPPEN.filter((e) => e.nr > 0).find((e) => UNTERLAGEN.some((u) => u.etappe === e.nr && offen(u)));
  const frist = FRISTEN.find((f) => f.datum >= heute);
  const fristBald = frist && new Date(frist.datum).getTime() - jetzt.getTime() < 45 * 864e5;
  // Hinweise stehen unten in „Sonst noch zu erledigen“, nicht über „Mein Tag“. Dringendes zuerst.
  type Hinweis = { text: string; href: string; art: "dringend" | "frist" | "erinnerung"; knopf: string };
  const hinweise: Hinweis[] = [
    ...(pannen.length ? [{ text: `${pannen.length} offene Datenpanne${pannen.length > 1 ? "n" : ""}: Meldefrist 72 Stunden`, href: "/datenschutz?reiter=vorfaelle", art: "dringend" as const, knopf: "Öffnen" }] : []),
    ...(anfragenDs.length ? [{ text: `${anfragenDs.length} Anfrage${anfragenDs.length > 1 ? "n" : ""} von Betroffenen offen: Frist ein Monat`, href: "/datenschutz?reiter=vorfaelle", art: "dringend" as const, knopf: "Öffnen" }] : []),
    ...(fehlerJobs[0].n ? [{ text: `${fehlerJobs[0].n} Hintergrund-Job${fehlerJobs[0].n > 1 ? "s" : ""} mit Fehler`, href: "/system?reiter=jobs", art: "dringend" as const, knopf: "Ansehen" }] : []),
    ...warnungen.map((m) => ({ text: m.titel, href: "/system?reiter=meldungen", art: "dringend" as const, knopf: "Ansehen" })),
    ...(fristBald ? [{ text: `${frist!.was} (bis ${new Date(frist!.datum).toLocaleDateString("de-DE")})`, href: "/unterlagen?reiter=fristen", art: "frist" as const, knopf: "Fristen" }] : []),
    ...(etappe ? [{ text: `Unterlagen „${etappe.name}“: ${UNTERLAGEN.filter((u) => u.etappe === etappe.nr && offen(u)).length} offen (bis ${new Date(etappe.bis).toLocaleDateString("de-DE")})`, href: `/unterlagen?reiter=e${etappe.nr}`, art: "frist" as const, knopf: "Unterlagen" }] : []),
    ...(ich && !ich.totpAktiv ? [{ text: "Zwei-Faktor-Anmeldung einrichten (auf dem Server Pflicht, dauert zwei Minuten)", href: "/zwei-faktor", art: "erinnerung" as const, knopf: "Einrichten" }] : []),
  ];
  const HINWEIS_STATUS = { dringend: { klasse: "fehler", wort: "dringend" }, frist: { klasse: "warten", wort: "Frist" }, erinnerung: { klasse: "", wort: "Erinnerung" } };
  // Freigaben nach Art gruppiert, je Gruppe höchstens drei, Blockiertes zuerst
  const freigabeGruppen = [...FREIGABE_GRUPPEN.map((g) => g.key), "sonstiges"]
    .map((key) => ({ key, name: gruppenName(key), eintraege: freigaben.filter((f) => gruppeVon(f.zweck) === key).sort((x, y) => (QK_REIHENFOLGE[x.qkStatus] ?? 9) - (QK_REIHENFOLGE[y.qkStatus] ?? 9)) }))
    .filter((g) => g.eintraege.length);
  const nichts = !freigaben.length && !meineAufgaben.length && !neueLeads.length && !besuche.length && !tickets.length && !unbekannt.length;

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
          ].map((k) => (
            <a key={k.etikett} className="blick" href={k.n ? `#${k.id}` : undefined} aria-disabled={!k.n} style={k.n ? undefined : { opacity: 0.55 }}>
              <span className="etikett">{k.etikett}</span>
              <span className="wert" style={{ fontFamily: "var(--mono)", fontSize: 26 }}>{k.n}</span>
              <span className="unter">{k.unter}</span>
            </a>
          ))}
        </div>
      ) : null}

      <div className="raster" style={{ gap: 16 }}>

      <section className="karte mein-tag" id="aufgaben" aria-labelledby="meintag">
        <div className="kopfzeile" style={{ marginBottom: 4 }}>
          <h2 id="meintag" style={{ margin: 0 }}>Mein Tag <span className="anzahl-pille" title="Gleiche Zahl wie im Menü: Aufgaben, Besuche, Freigaben, Leads, Tickets und Nachrichten zusammen">{zahlen.gesamt}</span></h2>
          <Link className="knopf klein" href="/aufgaben">Alle Aufgaben</Link>
        </div>
        <p className="leise klein" style={{ marginBottom: 8 }}>Alles, was heute auf dich wartet. Abhaken, wenn erledigt; „Morgen“ schiebt um einen Tag.</p>
        {heuteFaellig.length ? <AufgabenListe eintraege={heuteFaellig} zurueck="/" /> : null}
        {freigaben.length || neueLeads.length || tickets.length || unbekannt.length ? (
          <ul className="zeilen tag-sammel">
            {freigaben.length ? <li><div><div className="titel">{freigaben.length} {freigaben.length === 1 ? "Sache wartet" : "Sachen warten"} auf deine Freigabe</div><div className="unter">{[...new Set(freigaben.map((f) => gruppenName(gruppeVon(f.zweck))))].join(", ")}</div></div><a className="knopf klein" href="#freigeben">Freigeben</a></li> : null}
            {neueLeads.length ? <li><div><div className="titel">{neueLeads.length} neue {neueLeads.length === 1 ? "Lead einstufen" : "Leads einstufen"}</div><div className="unter">interessant oder nicht?</div></div><a className="knopf klein" href="#einstufen">Einstufen</a></li> : null}
            {tickets.length ? <li><div><div className="titel">{tickets.length} {tickets.length === 1 ? "Ticket" : "Tickets"} von Kunden offen</div><div className="unter">{tickets.slice(0, 2).map(({ name }) => name).join(", ")}{tickets.length > 2 ? " …" : ""}</div></div><a className="knopf klein" href="#tickets">Ansehen</a></li> : null}
            {unbekannt.length ? <li><div><div className="titel">{unbekannt.length} {unbekannt.length === 1 ? "Nachricht" : "Nachrichten"} ohne Betrieb</div><div className="unter">Absender zuordnen</div></div><a className="knopf klein" href="#unbekannt">Zuordnen</a></li> : null}
          </ul>
        ) : null}
        {!heuteFaellig.length && !besuche.length && !freigaben.length && !neueLeads.length && !tickets.length && !unbekannt.length ? <p className="leise">Heute steht nichts an.</p> : null}
        {besuche.length ? (
          <>
            <h3 style={{ margin: "16px 0 4px" }}>Besuche fällig</h3>
            <ul className="liste">
              {besuche.map((l) => <li key={l.id}><div style={{ flex: 1 }}><div className="titel">{l.name}</div><div className="unter">{l.strasse}, {l.plz} {l.ort}</div></div><Link className="knopf klein" href={`/leads/${l.id}?tab=aktivitaeten&erfassen=besuch`}>Besuch erfassen</Link></li>)}
            </ul>
          </>
        ) : null}
        {demnaechst.length ? (
          <details className="demnaechst">
            <summary className="klein">Nächste 7 Tage: {demnaechst.length} {demnaechst.length === 1 ? "Aufgabe" : "Aufgaben"}</summary>
            <AufgabenListe eintraege={demnaechst} zurueck="/" />
          </details>
        ) : null}
      </section>

      {freigaben.length ? (
        <Block id="freigeben" titel="Freigeben" zahl={freigaben.length} erklaerung="Was an Kunden geht, wartet auf dein OK. Nach Art sortiert; Rotes zuerst." mehr={{ href: "/freigaben", text: "Alle Freigaben" }}>
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
                        <span className="unter">{ZWECK[f.zweck] ?? f.zweck}</span>
                      </Link>
                      <span className={`status ${f.qkStatus === "blockiert" ? "fehler" : f.hinweise.length ? "warten" : "ok"}`}>{f.qkStatus === "blockiert" ? "blockiert" : f.hinweise.length ? `${f.hinweise.length} Hinweis${f.hinweise.length > 1 ? "e" : ""}` : "OK"}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Block>
      ) : null}

      {neueLeads.length ? (
        <Block id="einstufen" titel="Leads einstufen" zahl={neueLeads.length} erklaerung="„Interessant“ startet automatisch Online-Check, Demo-Seite und Akquise-Brief (zur Freigabe)." mehr={neueLeads.length > 5 ? { href: "/leads?status=neu", text: "Alle neuen" } : undefined}>
          <ul className="liste">
            {neueLeads.slice(0, 5).map((l) => (
              <li key={l.id}><div style={{ flex: 1 }}><div className="titel">{l.name}</div><div className="unter">{[l.gewerk, l.ort, l.score ? `Score ${l.score}` : null].filter(Boolean).join(" · ")}</div></div><Link className="knopf klein" href={`/leads/${l.id}`}>Einstufen</Link></li>
            ))}
          </ul>
        </Block>
      ) : null}


      {unbekannt.length ? (
        <Block id="unbekannt" titel="Nachrichten ohne Betrieb" zahl={unbekannt.length} erklaerung="Absender nicht erkannt (unbekannte Mail-Adresse oder Nummer). Betrieb wählen, dann entstehen Aufgabe und Antwortentwurf. Ohne Zuordnung werden sie nach 90 Tagen gelöscht.">
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
        </Block>
      ) : null}

      {tickets.length ? (
        <Block id="tickets" titel="Tickets von Kunden" zahl={tickets.length} erklaerung="Änderungswünsche und Fragen aus der Betreuung. Zeit buchen, antworten (geht über die Freigabe)." mehr={{ href: "/tickets", text: "Alle Tickets" }}>
          <ul className="liste">
            {tickets.slice(0, 5).map(({ t, name }) => <li key={t.id}><div style={{ flex: 1 }}><div className="titel">{ticketNummer(t.id)} {t.betreff}</div><div className="unter">{name}{t.prioritaet !== "normal" ? ` · ${t.prioritaet}` : ""}</div></div><Link className="knopf klein" href={`/tickets/${t.id}`}>Öffnen</Link></li>)}
          </ul>
        </Block>
      ) : null}

      {hinweise.length ? (
        <Block id="hinweise" titel="Sonst noch zu erledigen" zahl={hinweise.length} erklaerung="Fristen, Unterlagen und Einstellungen. Nicht für heute, aber nicht vergessen.">
          <ul className="zeilen">
            {hinweise.map((h) => (
              <li key={h.text}>
                <div className="knopfreihe" style={{ gap: 10, flexWrap: "nowrap", alignItems: "baseline" }}>
                  <span className={`status ${HINWEIS_STATUS[h.art].klasse}`}>{HINWEIS_STATUS[h.art].wort}</span>
                  <span>{h.text}</span>
                </div>
                <Link className="knopf klein" href={h.href}>{h.knopf}</Link>
              </li>
            ))}
          </ul>
        </Block>
      ) : null}
      </div>
    </>
  );
}
