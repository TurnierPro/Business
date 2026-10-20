import Link from "next/link";
import { and, desc, eq, inArray, isNull, lte, ne, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { datumZeit, inTagen, ZWECK } from "@/lib/format";
import { brauchtBenutzer } from "@/lib/auth";
import { beispieleErlaubt } from "@/lib/beispiele";
import { beispieleLaden } from "./aktionen";
import { ETAPPEN, FRISTEN, stand, UNTERLAGEN } from "@/lib/unterlagen";
import { offeneAufgaben } from "@/lib/ablauf/crm";
import { AufgabenListe } from "@/components/AufgabenListe";
import { ticketNummer } from "@/lib/ablauf/tickets";

export const metadata = { title: "Zu tun" };

// „Zu tun“: nur, was jetzt eine Entscheidung oder Handlung von dir braucht. Wichtigstes zuerst, Leeres fällt weg.

function Block({ titel, erklaerung, zahl, mehr, children }: { titel: string; erklaerung: string; zahl: number; mehr?: { href: string; text: string }; children: React.ReactNode }) {
  return (
    <section className="karte" style={{ marginBottom: 16 }}>
      <div className="kopfzeile" style={{ marginBottom: 4 }}>
        <h2 style={{ margin: 0 }}>{titel} <span className="mono leise klein">{zahl}</span></h2>
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
    offeneAufgaben({ wer: b.name, bis: inTagen(1, "00:00") }),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.betriebe),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.jobs).where(and(eq(schema.jobs.art, "beispieldaten"), inArray(schema.jobs.status, ["wartet", "laeuft"]))),
  ]);
  const stunde = Number(jetzt.toLocaleString("de-DE", { hour: "numeric", hourCycle: "h23", timeZone: "Europe/Berlin" }));
  const gruss = stunde < 11 ? "Guten Morgen" : stunde < 18 ? "Hallo" : "Guten Abend";
  const heute = jetzt.toISOString().slice(0, 10);
  const offen = (u: (typeof UNTERLAGEN)[number]) => !["erledigt", "entfaellt"].includes(unterlagenStand.get(u.key)?.status ?? (u.etappe === 0 ? "entfaellt" : "offen"));
  const etappe = ETAPPEN.filter((e) => e.nr > 0).find((e) => UNTERLAGEN.some((u) => u.etappe === e.nr && offen(u)));
  const frist = FRISTEN.find((f) => f.datum >= heute);
  const fristBald = frist && new Date(frist.datum).getTime() - jetzt.getTime() < 45 * 864e5;
  const hinweise = [
    ...(pannen.length ? [{ text: `${pannen.length} offene Datenpanne(n): Meldefrist 72 Stunden`, href: "/datenschutz", dringend: true }] : []),
    ...(anfragenDs.length ? [{ text: `${anfragenDs.length} Anfrage(n) von Betroffenen offen: Frist ein Monat`, href: "/datenschutz", dringend: true }] : []),
    ...(fehlerJobs[0].n ? [{ text: `${fehlerJobs[0].n} Hintergrund-Jobs mit Fehler`, href: "/system", dringend: true }] : []),
    ...warnungen.map((m) => ({ text: m.titel, href: "/logs", dringend: true })),
    ...(fristBald ? [{ text: `Frist ${new Date(frist!.datum).toLocaleDateString("de-DE")}: ${frist!.was}`, href: "/unterlagen", dringend: false }] : []),
    ...(etappe ? [{ text: `Unterlagen „${etappe.name}“: ${UNTERLAGEN.filter((u) => u.etappe === etappe.nr && offen(u)).length} offen (bis ${new Date(etappe.bis).toLocaleDateString("de-DE")})`, href: `/unterlagen?etappe=${etappe.nr}`, dringend: false }] : []),
  ];
  const nichts = !freigaben.length && !meineAufgaben.length && !neueLeads.length && !besuche.length && !tickets.length;

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

      {hinweise.length ? (
        <ul className="liste karte" style={{ marginBottom: 16 }} aria-label="Hinweise">
          {hinweise.map((h) => <li key={h.text}><Link href={h.href} style={h.dringend ? { color: "var(--fehler)" } : undefined}>{h.text}</Link></li>)}
        </ul>
      ) : null}

      {freigaben.length ? (
        <Block titel="1. Freigeben" zahl={freigaben.length} erklaerung="Alles, was an Kunden geht (Briefe, Angebote, Rechnungen, Mails), wartet hier auf dein OK. Öffnen, Vorschau und Hinweise der Qualitätskontrolle lesen, dann freigeben, ändern oder ablehnen." mehr={freigaben.length > 5 ? { href: "/freigaben", text: "Alle anzeigen" } : undefined}>
          <ul className="liste">
            {freigaben.slice(0, 5).map((f) => (
              <li key={f.id}>
                <div style={{ flex: 1 }}><div className="titel">{f.betreff}</div><div className="unter">{ZWECK[f.zweck] ?? f.zweck} · {datumZeit(f.erstelltAm)}{f.qkStatus === "blockiert" ? " · blockiert" : f.hinweise.length ? ` · ${f.hinweise.length} Hinweis${f.hinweise.length > 1 ? "e" : ""}` : ""}</div></div>
                <Link className="knopf klein" href={`/freigaben/${f.id}`}>Prüfen</Link>
              </li>
            ))}
          </ul>
        </Block>
      ) : null}

      {meineAufgaben.length ? (
        <Block titel="2. Deine Aufgaben heute" zahl={meineAufgaben.length} erklaerung="Abhaken, wenn erledigt; „Morgen“ schiebt die Aufgabe um einen Tag." mehr={{ href: "/aufgaben", text: "Alle Aufgaben" }}>
          <AufgabenListe eintraege={meineAufgaben} zurueck="/" />
        </Block>
      ) : null}

      {neueLeads.length ? (
        <Block titel="3. Leads einstufen" zahl={neueLeads.length} erklaerung="„Interessant“ startet automatisch Online-Check, Demo-Seite und Akquise-Brief (zur Freigabe)." mehr={neueLeads.length > 5 ? { href: "/leads?status=neu", text: "Alle neuen" } : undefined}>
          <ul className="liste">
            {neueLeads.slice(0, 5).map((l) => (
              <li key={l.id}><div style={{ flex: 1 }}><div className="titel">{l.name}</div><div className="unter">{[l.gewerk, l.ort, l.score ? `Score ${l.score}` : null].filter(Boolean).join(" · ")}</div></div><Link className="knopf klein" href={`/leads/${l.id}`}>Einstufen</Link></li>
            ))}
          </ul>
        </Block>
      ) : null}

      {besuche.length ? (
        <Block titel="4. Besuche fällig" zahl={besuche.length} erklaerung="Der Brief ist seit einer Woche da. Jetzt vorbeigehen, Demo zeigen, beim Termin aufnehmen (nur mit Einwilligung).">
          <ul className="liste">
            {besuche.map((l) => <li key={l.id}><div style={{ flex: 1 }}><div className="titel">{l.name}</div><div className="unter">{l.strasse}, {l.plz} {l.ort}</div></div><Link className="knopf klein" href={`/leads/${l.id}`}>Öffnen</Link></li>)}
          </ul>
        </Block>
      ) : null}

      {tickets.length ? (
        <Block titel="5. Tickets von Kunden" zahl={tickets.length} erklaerung="Änderungswünsche und Fragen aus der Betreuung. Zeit buchen, antworten (geht über die Freigabe)." mehr={{ href: "/tickets", text: "Alle Tickets" }}>
          <ul className="liste">
            {tickets.slice(0, 5).map(({ t, name }) => <li key={t.id}><div style={{ flex: 1 }}><div className="titel">{ticketNummer(t.id)} {t.betreff}</div><div className="unter">{name}{t.prioritaet !== "normal" ? ` · ${t.prioritaet}` : ""}</div></div><Link className="knopf klein" href={`/tickets/${t.id}`}>Öffnen</Link></li>)}
          </ul>
        </Block>
      ) : null}
    </>
  );
}
