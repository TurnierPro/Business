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
import { besuchErfassen, aktivitaetAnlegen, antwortEntwerfen, nachrichtErledigt, portalLinkErneuern, portalZugangAnlegen, portalZugangSperren, betriebSpeichern, betriebZuweisen, datenLoeschen, einstufen, kontaktLoeschen, kontaktSpeichern, terminHochladen, widerspruch, zahlungSimulieren } from "../../aktionen";
import { AufgabenListe } from "@/components/AufgabenListe";
import { ARTEN } from "@/lib/ablauf/crm";
import { ticketNummer } from "@/lib/ablauf/tickets";
import { KANAELE } from "@/lib/ablauf/nachrichten";
import { JETZT, WEG, wegIndex } from "@/lib/weg";
import { ERGEBNISSE, KONTAKT } from "@/lib/ablauf/vertrieb";

const PROJEKT_TEXT: Record<string, string> = { inhalte: "wartet auf Inhalte", bau: "wird gebaut", pruefung: "Prüfung nicht bestanden", bereit: "Vorschau beim Kunden", live: "live, Betreuung läuft", beendet: "beendet" };
const ANGEBOT_TEXT: Record<string, string> = { entwurf: "erstellt", versendet: "beim Kunden", unterschrieben: "unterschrieben", angezahlt: "erste Rate bezahlt", abgeschlossen: "abgeschlossen", abgelehnt: "abgelehnt" };

const REITER = [["ueberblick", "Überblick"], ["aktivitaeten", "Aktivitäten"], ["dokumente", "Unterlagen und Post"], ["daten", "Daten"]] as const;

export default async function Lead({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const id = Number((await params).id);
  const tabRoh = (await searchParams).tab;
  const tab = REITER.some(([k]) => k === tabRoh) ? tabRoh! : "ueberblick";
  const db = await getDb();
  const [b] = await db.select().from(schema.betriebe).where(eq(schema.betriebe.id, id));
  if (!b) notFound();
  const [kontakte, aktivitaeten, tickets, benutzer, nachrichten, zugaenge] = await Promise.all([
    db.select().from(schema.kontakte).where(eq(schema.kontakte.betriebId, id)).orderBy(desc(schema.kontakte.haupt), schema.kontakte.name),
    db.select().from(schema.aktivitaeten).where(eq(schema.aktivitaeten.betriebId, id)).orderBy(desc(schema.aktivitaeten.erstelltAm)),
    db.select().from(schema.tickets).where(eq(schema.tickets.betriebId, id)).orderBy(desc(schema.tickets.erstelltAm)),
    db.select({ name: schema.benutzer.name }).from(schema.benutzer),
    db.select().from(schema.nachrichten).where(eq(schema.nachrichten.betriebId, id)).orderBy(desc(schema.nachrichten.zeit)).limit(50),
    db.select().from(schema.portalZugaenge).where(eq(schema.portalZugaenge.betriebId, id)).orderBy(desc(schema.portalZugaenge.erstelltAm)),
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
  const besuche = await db.select().from(schema.besuche).where(eq(schema.besuche.betriebId, id)).orderBy(desc(schema.besuche.am));
  const rechnungen = await db.select().from(schema.rechnungen).where(eq(schema.rechnungen.betriebId, id)).orderBy(desc(schema.rechnungen.erstelltAm));
  const inArbeit = laufend.filter((j) => Number(j.daten.betriebId) === id || termine.some((t) => t.id === Number(j.daten.terminId)));
  const angebot = angebote[0];
  const projekt = projekte[0];
  const offenePost = post.filter((p) => p.status === "zur_freigabe");
  const gesperrt = b.status === "gesperrt";
  const lexwareAktiv = istEcht("buchhaltung");
  const index = wegIndex(b, angebot, projekt);
  const hauptkontakt = kontakte.find((k) => k.haupt) ?? kontakte[0];
  const offeneRechnungen = rechnungen.filter((r) => r.status !== "bezahlt" && r.status !== "storniert");
  const verschickt = post.filter((p) => p.versendetAm).length;

  // Genau ein nächster Schritt mit genau einem Messing-Knopf
  const naechstes: { was: string; unter?: string; knopf?: React.ReactNode } = gesperrt
    ? { was: "Gesperrt: Der Betrieb hat widersprochen", unter: "Er wird nie wieder angeschrieben." }
    : inArbeit.length
      ? { was: `Läuft gerade: ${inArbeit.map((j) => (j.art === "vorbereitung" ? "Online-Check, Demo und Brief" : j.art === "transkription" ? "Aufnahme abschreiben" : "Protokoll und Angebot")).join(", ")}`, unter: "In einer Minute neu laden." }
      : offenePost.length
        ? { was: `${ZWECK[offenePost[0].zweck] ?? offenePost[0].zweck} wartet auf deine Freigabe`, unter: offenePost.length > 1 ? `und ${offenePost.length - 1} weitere` : offenePost[0].betreff, knopf: <Link className="knopf haupt" href={`/freigaben/${offenePost[0].id}`}>Prüfen und freigeben</Link> }
        : b.status === "neu"
          ? { was: "Einstufen: interessant oder nicht?", unter: `${b.scoreGrund ?? "Kein Score-Grund"} · Score ${b.score ?? "–"}. „Interessant“ startet Online-Check, Demo und Brief zur Freigabe.`, knopf: <div className="knopfreihe"><form action={einstufen}><input type="hidden" name="id" value={id} /><input type="hidden" name="wahl" value="ja" /><button className="knopf haupt">Interessant</button></form><form action={einstufen}><input type="hidden" name="id" value={id} /><input type="hidden" name="wahl" value="nein" /><button className="knopf">Nicht interessant</button></form></div> }
          : b.status === "nicht_interessant"
            ? { was: "Nicht interessant", unter: "Wird nach 6 Monaten ohne Aktivität automatisch gelöscht." }
            : projekt
              ? { was: `Projekt: ${PROJEKT_TEXT[projekt.status] ?? projekt.status}`, unter: PAKETE[projekt.paket as PaketKey]?.name ?? projekt.paket, knopf: <Link className="knopf haupt" href={`/projekte/${projekt.id}`}>Projekt öffnen</Link> }
              : angebot?.status === "unterschrieben"
                ? { was: `Unterschrieben am ${datum(angebot.unterschriebenAm)}: wir warten auf die erste Rate`, unter: `${euro(Math.round(angebot.einmalig / 2))} netto. ${lexwareAktiv ? "Lexware meldet Zahlungen täglich von selbst." : "Buchen, sobald das Geld auf dem Konto ist."}`, knopf: <form action={zahlungSimulieren}><input type="hidden" name="betriebId" value={id} /><input type="hidden" name="angebotId" value={angebot.id} /><button className="knopf haupt">Zahlung eingegangen</button></form> }
                : angebot && ["entwurf", "versendet"].includes(angebot.status)
                  ? { was: "Verträge auf dem Tablet unterschreiben", unter: `Angebot ${PAKETE[angebot.paket as PaketKey]?.name ?? angebot.paket} ${angebot.status === "versendet" ? "ist beim Kunden" : "ist erstellt"}. Beim Termin: Rahmenvertrag und je Baustein ein Leistungsschein.`, knopf: <Link className="knopf haupt" href={`/unterschrift/${angebot.id}`}>Unterschreiben lassen</Link> }
                  : b.status === "angeschrieben"
                    ? { was: `Besuch vor Ort ab ${datum(b.besuchAb)}`, unter: "Demo zeigen, nach dem Gespräch den Messbogen ausfüllen oder die Aufnahme hochladen.", knopf: <Link className="knopf haupt" href="/leads/besuche">Zum Besuchsplan</Link> }
                    : ["interessant", "termin"].includes(b.status)
                      ? { was: "Angebot erstellen", unter: "Webauftritt und Module gemeinsam auswählen; der Preis rechnet sofort mit.", knopf: <Link className="knopf haupt" href={`/leads/${id}/angebot`}>Angebot erstellen</Link> }
                      : { was: "Kein nächster Schritt geplant", unter: "Unter „Aktivitäten“ eine Aufgabe anlegen." };

  // Verlauf: Besuche, Gespräche mit Protokoll, Nachrichten und Notizen in einer Zeitleiste, neueste oben
  type Eintrag = { key: string; am: Date; typ: string; etikett: string; titel: string; text?: string | null; wer?: string | null; extra?: React.ReactNode };
  const protokolle = doks.filter((d) => d.art === "protokoll");
  const zeitleiste: Eintrag[] = [
    ...besuche.map((v) => ({ key: `b${v.id}`, am: v.am, typ: "besuch", etikett: "Besuch", titel: ERGEBNISSE[v.ergebnis] ?? v.ergebnis, wer: v.erstelltVon, text: [v.inhaberAngetroffen ? "Inhaber angetroffen" : "Inhaber nicht angetroffen", v.dauerMin ? `${v.dauerMin} Min.` : null, v.paket ? `Paket ${v.paket === "KOMPAKT" ? "Kompakt" : "Professional"}` : null, v.variante ? `Variante ${v.variante}` : null, v.einwand ? `Einwand: „${v.einwand}“` : null, v.art14Info ? "Art.-14-Info dagelassen" : "Art.-14-Info fehlt", v.einwilligungKontakt && v.einwilligungKontakt !== "keine" ? KONTAKT[v.einwilligungKontakt] : null].filter(Boolean).join(" · ") })),
    ...termine.map((t) => ({ key: `t${t.id}`, am: t.datum, typ: "gespraech", etikett: "Gespräch", titel: "Gespräch vor Ort aufgenommen", wer: t.einwilligungVon ? `Einwilligung ${t.einwilligungVon}` : null, text: t.audioGeloeschtAm ? `Aufnahme gelöscht am ${datum(t.audioGeloeschtAm)}` : "Aufnahme gespeichert, wird nach dem Versand gelöscht", extra: protokolle.length ? <div className="knopfreihe" style={{ marginTop: 8 }}>{protokolle.map((d) => <a key={d.id} className="knopf klein" href={`/dokument/${d.id}`} target="_blank">Protokoll {datum(d.erstelltAm)}</a>)}</div> : null })),
    ...nachrichten.map((n) => ({ key: `n${n.id}`, am: n.zeit, typ: n.richtung === "ein" ? "ein" : "aus", etikett: KANAELE[n.kanal] ?? n.kanal, titel: `${n.richtung === "ein" ? "Von" : "An"} ${n.richtung === "ein" ? n.absender : n.empfaenger}${n.betreff ? `: ${n.betreff}` : ""}`, text: n.richtung === "aus" ? (n.inhalt.length > 160 ? `${n.inhalt.replace(/\s+/g, " ").slice(0, 160)} …` : n.inhalt) : n.inhalt.length > 500 ? `${n.inhalt.slice(0, 500)} …` : n.inhalt, extra: n.richtung === "ein" && n.status === "neu" ? <div className="knopfreihe" style={{ marginTop: 8 }}>{n.kanal === "mail" || n.kanal === "whatsapp" ? <form action={antwortEntwerfen}><input type="hidden" name="id" value={n.id} /><input type="hidden" name="zurueck" value={`/leads/${id}?tab=aktivitaeten`} /><button className="knopf klein">Antwort entwerfen</button></form> : null}<form action={nachrichtErledigt}><input type="hidden" name="id" value={n.id} /><input type="hidden" name="zurueck" value={`/leads/${id}?tab=aktivitaeten`} /><button className="knopf klein">Erledigt</button></form></div> : null })),
    ...chronik.map((a) => ({ key: `a${a.id}`, am: a.erledigtAm ?? a.erstelltAm, typ: "notiz", etikett: ARTEN[a.art] ?? a.art, titel: `${a.titel}${a.erledigtAm && a.faelligAm ? " (erledigt)" : ""}`, wer: a.erstelltVon, text: a.text })),
    ...post.filter((p) => p.versendetAm && p.kanal !== "mail" && p.kanal !== "whatsapp").map((p) => ({ key: `p${p.id}`, am: p.versendetAm!, typ: "aus", etikett: "Versendet", titel: ZWECK[p.zweck] ?? p.zweck, text: p.betreff })),
  ].sort((x, y) => y.am.getTime() - x.am.getTime()).slice(0, 60);

  // Datum je Schritt (wie im Kundenportal), soweit bekannt
  const brief = post.find((p) => p.zweck === "akquise_brief" && p.versendetAm);
  const daten: (Date | null | undefined)[] = [b.erstelltAm, brief?.versendetAm, termine[0]?.datum, angebot?.erstelltAm, angebot?.unterschriebenAm, angebot?.angezahltAm, projekt?.inhalteAm, projekt?.abnahmeAm, projekt?.liveAm];
  const anzahlungsRechnung = rechnungen.find((r) => r.art === "anzahlung");
  const summe24 = angebot ? angebot.einmalig + angebot.monatlich * 24 : 0;

  return (
    <>
      {b.status === "kunde" ? <Link href="/projekte" className="zurueck">← Kunden</Link> : <Link href="/leads" className="zurueck">← Leads</Link>}
      <div className="akte-kopf" style={{ marginBottom: 20 }}>
        <div>
          <h1>{b.name}</h1>
          <div className="unter">{[b.gewerk, b.inhaber, [b.plz, b.ort].filter(Boolean).join(" "), b.mitarbeiter ? `${b.mitarbeiter} Mitarbeitende` : null].filter(Boolean).join(" · ")}</div>
        </div>
        <div className="knopfreihe">
          <Status wert={b.status} />
          {b.portalToken ? <a className="knopf klein" href={`${basisUrl()}/portal/k/${b.portalToken}`} target="_blank" rel="noopener noreferrer">Kundenportal ansehen ↗</a> : <span className="leise klein">Kundenportal ab dem ersten Angebot</span>}
        </div>
      </div>

      <nav className="reiter" aria-label="Bereiche des Betriebs">
        {REITER.map(([k, n]) => <Link key={k} href={`/leads/${id}?tab=${k}`} aria-current={tab === k ? "page" : undefined}>{n}{k === "aktivitaeten" && offeneAufgaben.length ? ` · ${offeneAufgaben.length} offen` : ""}</Link>)}
      </nav>

      {tab === "ueberblick" ? (
        <>
          <div className="akte-raster">
            <section className="karte" aria-labelledby="ablauf">
              <div className="kopfzeile" style={{ marginBottom: 12 }}>
                <h2 id="ablauf" style={{ margin: 0 }}>Ablauf</h2>
                <span className="leise klein">{index >= WEG.length ? "alle 9 Schritte erledigt" : `Schritt ${index + 1} von ${WEG.length}`}</span>
              </div>
              <div className="portal-naechstes" style={{ marginBottom: 12 }}>
                <div style={{ minWidth: 0, flex: "1 1 280px" }}>
                  <div className="etikett">Jetzt dran</div>
                  <div className="was">{naechstes.was}</div>
                  {naechstes.unter ? <div className="leise klein" style={{ marginTop: 4 }}>{naechstes.unter}</div> : null}
                </div>
                {naechstes.knopf ?? null}
              </div>
              <ol className="fortschritt">
                {WEG.map((titel, i) => (
                  <li key={titel} className={i < index ? "erledigt" : i === index ? "aktuell" : ""}>
                    <span className="punkt" aria-hidden="true">{i < index ? "✓" : i + 1}</span>
                    <div>
                      <div className="titel">{titel}{i < index ? <span className="sr-only"> (erledigt)</span> : i === index ? <span className="leise klein"> · jetzt</span> : null}</div>
                      <div className="unter">{i < index ? (daten[i] ? datum(daten[i]) : "erledigt") : i === index ? JETZT[i] : ""}</div>
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            <div className="raster" style={{ gap: 16, alignContent: "start" }}>
              <section className="karte" aria-labelledby="auftrag">
                <div className="kopfzeile" style={{ marginBottom: 12 }}>
                  <h2 id="auftrag" style={{ margin: 0 }}>Auftrag und Geld</h2>
                  {angebot ? <span className="status">{ANGEBOT_TEXT[angebot.status] ?? angebot.status}</span> : null}
                </div>
                {angebot ? (
                  <>
                    <p style={{ fontWeight: 600, marginBottom: 10 }}>{PAKETE[angebot.paket as PaketKey]?.name ?? angebot.paket}{(angebot.module ?? []).length ? ` + ${(angebot.module ?? []).length} Modul${(angebot.module ?? []).length > 1 ? "e" : ""}` : ""}</p>
                    <div className="geldzeile">
                      <div><span className="etikett">einmalig</span><b>{euro(angebot.einmalig)}</b></div>
                      <div><span className="etikett">monatlich</span><b>{euro(angebot.monatlich)}</b></div>
                      <div><span className="etikett">24 Monate</span><b>{euro(summe24)}</b></div>
                    </div>
                    <p className="leise klein" style={{ margin: "8px 0 0" }}>netto · 50 % bei Unterschrift, 50 % beim Livegang, Monatsbeitrag per Lastschrift ab Livegang</p>
                    <h3 style={{ margin: "18px 0 6px" }}>Rechnungen</h3>
                    {rechnungen.length ? (
                      <ul className="liste">
                        {rechnungen.map((r) => {
                          const dok = doks.find((d) => d.art === "rechnung" && (d.daten as { nummer?: string }).nummer === r.nummer);
                          return (
                            <li key={r.id}>
                              <div><div className="titel">{r.art === "anzahlung" ? "Erste Rate" : r.art === "schluss" ? "Schlussrechnung" : "Monatsbeitrag"} · {r.nummer}</div><div className="unter">{euro(Math.round(r.netto * 1.19))} brutto{r.faelligAm ? ` · fällig ${datum(r.faelligAm)}` : ""}</div></div>
                              <div className="knopfreihe" style={{ gap: 8 }}><Status wert={r.status} />{dok ? <a className="knopf klein" href={`/dokument/${dok.id}`} target="_blank">PDF</a> : null}</div>
                            </li>
                          );
                        })}
                      </ul>
                    ) : <p className="leise klein">{anzahlungsRechnung ? "" : "Die erste Rate entsteht mit der Unterschrift."}</p>}
                  </>
                ) : (
                  <div className="leer" style={{ padding: "16px 0" }}><strong>Noch kein Angebot.</strong>{!gesperrt && b.status !== "neu" && b.status !== "nicht_interessant" ? <Link className="knopf klein" href={`/leads/${id}/angebot`} style={{ marginTop: 10 }}>Angebot erstellen</Link> : "Erst einstufen."}</div>
                )}
              </section>

              <section className="karte" aria-labelledby="unterlagen">
                <div className="kopfzeile" style={{ marginBottom: 12 }}>
                  <h2 id="unterlagen" style={{ margin: 0 }}>Unterlagen</h2>
                  {doks.length + demos.length > 6 ? <Link className="knopf klein" href={`/leads/${id}?tab=dokumente`}>Alle {doks.length + demos.length}</Link> : null}
                </div>
                {doks.length || demos.length ? (
                  <div className="portal-kacheln">
                    {demos.map((d) => (
                      <a key={d.slug} className="portal-kachel" href={`/vorschau/${d.slug}?code=${d.zugangscode}`} target="_blank">
                        <span className="symbol" aria-hidden="true">◱</span>
                        <span><span className="titel">Demo-Website</span><br /><span className="unter">löscht sich am {datum(d.loeschenAm)}</span></span>
                      </a>
                    ))}
                    {doks.filter((d) => d.art !== "rechnung").slice(0, 6 - demos.length).map((d) => (
                      <a key={d.id} className="portal-kachel" href={`/dokument/${d.id}`} target="_blank">
                        <span className="symbol" aria-hidden="true">▤</span>
                        <span><span className="titel">{DOKART[d.art] ?? d.art}</span><br /><span className="unter">{datum(d.erstelltAm)}</span></span>
                      </a>
                    ))}
                  </div>
                ) : <p className="leise klein">Noch keine. Sie entstehen nach „Interessant“ und nach dem Gespräch.</p>}
              </section>

              {offenePost.length ? (
                <section className="karte" aria-labelledby="freigaben">
                  <h2 id="freigaben">Wartet auf Freigabe</h2>
                  <ul className="liste">
                    {offenePost.map((p) => (
                      <li key={p.id}>
                        <div><div className="titel">{ZWECK[p.zweck] ?? p.zweck}</div><div className="unter">{p.betreff}</div></div>
                        <Link className="knopf klein" href={`/freigaben/${p.id}`}>Prüfen</Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            <section className="karte" id="kontakte">
              <h2>Ansprechpartner</h2>
              {kontakte.length ? (
                <ul className="liste">
                  {kontakte.map((k) => (
                    <li key={k.id}>
                      <div style={{ flex: 1 }}><div className="titel">{k.name}{k.haupt ? <span className="status ok" style={{ marginLeft: 8 }}>Hauptkontakt</span> : null}</div><div className="unter">{[k.rolle, k.telefon ? <a key="t" href={`tel:${k.telefon.replace(/\s/g, "")}`}>{k.telefon}</a> : null, k.email ? <a key="m" href={`mailto:${k.email}`}>{k.email}</a> : null].filter(Boolean).map((x, i) => <span key={i}>{i ? " · " : ""}{x}</span>)}</div></div>
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
              <section className="karte">
                <h2>Offene Aufgaben</h2>
                {offeneAufgaben.length ? <AufgabenListe eintraege={offeneAufgaben.map((a) => ({ a, betrieb: null }))} zurueck={`/leads/${id}`} mitBetrieb={false} /> : <p className="leise klein">Keine. Neue Aufgabe unter „Aktivitäten“.</p>}
              </section>
            </div>
          </div>

          <div className="abstand">
            <form action={betriebSpeichern} className="karte" aria-labelledby="stammdaten">
              <div className="kopfzeile" style={{ marginBottom: 12 }}>
                <h2 id="stammdaten" style={{ margin: 0 }}>Stammdaten</h2>
                <button className="knopf klein">Speichern</button>
              </div>
              <input type="hidden" name="id" value={id} />
              <BetriebFelder b={b} />
              <button className="knopf">Stammdaten speichern</button>
            </form>

          </div>
        </>
      ) : null}

      {tab === "aktivitaeten" ? (
        <div className="akte-raster" style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.3fr)" }}>
          <div className="raster" style={{ gap: 16, alignContent: "start" }}>
            <section className="karte">
              <h2>Eintragen</h2>
              <form action={aktivitaetAnlegen}>
                <input type="hidden" name="betriebId" value={id} />
                <input type="hidden" name="zurueck" value={`/leads/${id}?tab=aktivitaeten`} />
                <div className="raster" style={{ gridTemplateColumns: "minmax(0, 0.8fr) minmax(0, 1.6fr)", gap: 12 }}>
                  <label className="feld"><span>Art</span><select name="art" defaultValue="anruf">{Object.entries(ARTEN).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
                  <label className="feld"><span>Kurz</span><input name="titel" placeholder="z. B. Rückruf wegen Fotos" /></label>
                </div>
                <label className="feld"><span>Notiz</span><textarea name="text" rows={3} placeholder="Was wurde besprochen?" style={{ minHeight: 90 }} /></label>
                <div className="raster zwei" style={{ gap: 12 }}>
                  <label className="feld"><span>Datum <em>bei Aufgabe oder Termin</em></span><input type="date" name="faellig" defaultValue={morgen} /></label>
                  <label className="feld"><span>Für</span><select name="zustaendig" defaultValue={b.zustaendig ?? ""}><option value="">mich</option>{benutzer.map((x) => <option key={x.name}>{x.name}</option>)}</select></label>
                </div>
                <button className="knopf">Eintragen</button>
              </form>
            </section>

            {!gesperrt && b.status !== "kunde" ? (
              <details className="karte" open={b.status === "angeschrieben"}>
                <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 19 }}>Besuch vor Ort: Messbogen</summary>
                <form action={besuchErfassen} className="messbogen" style={{ marginTop: 12, maxWidth: "none" }}>
                  <input type="hidden" name="betriebId" value={id} />
                  <input type="hidden" name="zurueck" value={`/leads/${id}?tab=aktivitaeten`} />
                  <fieldset>
                    <legend>Ergebnis</legend>
                    <div className="raster zwei" style={{ gap: 6 }}>{Object.entries(ERGEBNISSE).map(([k, n]) => <label key={k} className="haken"><input type="radio" name="ergebnis" value={k} required /><span>{n}</span></label>)}</div>
                  </fieldset>
                  <label className="haken"><input type="checkbox" name="angetroffen" value="ja" /><span>Inhaber angetroffen</span></label>
                  <div className="raster" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
                    <label className="feld"><span>Dauer (Min.)</span><input name="dauer" type="number" inputMode="numeric" min={0} max={240} /></label>
                    <label className="feld"><span>Paket</span><select name="paket" defaultValue=""><option value="">keins</option><option value="KOMPAKT">Kompakt</option><option value="PROFESSIONAL">Professional</option></select></label>
                    <label className="feld"><span>Variante</span><select name="variante" defaultValue=""><option value="">keine</option><option value="A">A · vor Ort</option><option value="B">B · Rücktrittsrecht</option></select></label>
                  </div>
                  <label className="feld"><span>Einwand wörtlich</span><input name="einwand" placeholder="z. B. Muss ich mit dem Büro besprechen" /></label>
                  <div className="raster zwei" style={{ gap: 12 }}>
                    <label className="feld"><span>Weiterer Kontakt</span><select name="kontakt" defaultValue="keine">{Object.entries(KONTAKT).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
                    <label className="feld"><span>Preistest <em>erste 15 Gespräche</em></span><input name="preistest" placeholder="Reaktion auf den Preis" /></label>
                  </div>
                  <label className="haken"><input type="checkbox" name="art14" value="ja" /><span>Art.-14-Infoblatt dagelassen</span></label>
                  <button className="knopf">Messbogen speichern</button>
                </form>
              </details>
            ) : null}

            {!gesperrt && ["interessant", "angeschrieben", "termin"].includes(b.status) ? (
              <details className="karte" open={b.status === "termin"}>
                <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 19 }}>Gespräch aufnehmen</summary>
                <p className="leise" style={{ marginTop: 12 }}>Aus der Aufnahme entstehen Protokoll, Maßnahmenplan, Angebot und Begleit-Mail. Alles geht vorher durch die Freigabe. Die Aufnahme wird nach dem Versand gelöscht.</p>
                <form action={terminHochladen}>
                  <input type="hidden" name="id" value={id} />
                  <label className="haken" style={{ marginBottom: 16 }}>
                    <input type="checkbox" name="einwilligung" value="ja" required />
                    <span><b>Einwilligung liegt vor.</b> {b.inhaber ?? "Der Inhaber"} ist mit der Aufnahme einverstanden. Ohne Haken wird nichts gespeichert.</span>
                  </label>
                  <Aufnahme />
                  <button className="knopf">Aufnahme speichern</button>
                </form>
              </details>
            ) : null}

            <section className="karte">
              <h2>Offene Aufgaben</h2>
              {offeneAufgaben.length ? <AufgabenListe eintraege={offeneAufgaben.map((a) => ({ a, betrieb: null }))} zurueck={`/leads/${id}?tab=aktivitaeten`} mitBetrieb={false} /> : <p className="leise klein">Kein nächster Schritt geplant.</p>}
            </section>
          </div>

          <section className="karte" aria-labelledby="verlauf">
            <h2 id="verlauf">Verlauf</h2>
            {zeitleiste.length ? (
              <ol className="zeitleiste">
                {zeitleiste.map((e) => (
                  <li key={e.key}>
                    <span className={`art art-${e.typ}`}>{e.etikett}</span>
                    <div className="inhalt">
                      <div className="kopf"><span className="titel">{e.titel}</span><span className="leise klein">{datumZeit(e.am)}{e.wer ? ` · ${e.wer}` : ""}</span></div>
                      {e.text ? <div className="text">{e.text}</div> : null}
                      {e.extra ?? null}
                    </div>
                  </li>
                ))}
              </ol>
            ) : <p className="leise">Noch nichts. Besuche, Gespräche, Nachrichten und Notizen erscheinen hier.</p>}
          </section>
        </div>
      ) : null}

      {tab === "dokumente" ? (
        <div className="raster zwei" style={{ alignItems: "start" }}>
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
        </div>
      ) : null}

      {tab === "daten" ? (
        <>
          <div className="raster zwei" style={{ alignItems: "start" }}>
            <div>
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

      {b.portalToken ? (
        <details className="karte abstand">
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>Kundenportal: Zugang</summary>
          <p className="leise" style={{ marginTop: 12 }}>Der Kunde kommt über seinen persönlichen Link ins Portal (steht in jeder Mail). Hat er ihn verloren, fordert er ihn unter <span className="mono">/portal</span> per E-Mail neu an. Wurde der Link weitergeleitet oder ist ein Mitarbeiter gegangen: hier erneuern. Der alte Link ist sofort gesperrt, die Mail mit dem neuen liegt danach in den Freigaben.</p>
          <form action={portalLinkErneuern}><input type="hidden" name="id" value={id} /><button className="knopf">Link erneuern und alten sperren</button></form>
          <h3>Weitere Personen im Betrieb</h3>
          <p className="leise klein">Jede Person bekommt einen eigenen Link, den ihr einzeln sperren könnt. Die Mail mit dem Link geht über die Freigaben raus.</p>
          {zugaenge.length ? (
            <ul className="liste">
              {zugaenge.map((z) => (
                <li key={z.id}>
                  <div><div className="titel">{z.name}</div><div className="unter">{z.email} · {z.zuletztAm ? `zuletzt ${datumZeit(z.zuletztAm)}` : "noch nicht genutzt"}</div></div>
                  {z.gesperrtAm ? <span className="status">gesperrt</span> : <form action={portalZugangSperren}><input type="hidden" name="id" value={z.id} /><input type="hidden" name="betriebId" value={id} /><button className="knopf klein gefahr">Sperren</button></form>}
                </li>
              ))}
            </ul>
          ) : null}
          <form action={portalZugangAnlegen} className="raster drei" style={{ alignItems: "end", marginTop: 12 }}>
            <input type="hidden" name="betriebId" value={id} />
            <label className="feld"><span>Name</span><input name="name" required placeholder="z. B. Petra Büro" /></label>
            <label className="feld"><span>E-Mail</span><input name="email" type="email" required /></label>
            <div className="feld"><button className="knopf">Zugang anlegen</button></div>
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
      ) : null}
    </>
  );
}
