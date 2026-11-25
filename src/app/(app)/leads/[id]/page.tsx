import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { Status } from "@/components/Status";
import { BetriebFelder } from "@/components/BetriebFelder";
import { dateiGroesse, datum, datumZeit, DOKART, ZWECK } from "@/lib/format";
import { PAKETE, PaketKey, euro } from "@/lib/pakete";
import { istEcht } from "@/lib/adapters/dienste";
import { basisUrl } from "@/lib/ablauf/gemeinsam";
import { portalBasis } from "@/lib/kundenportal";
import { BesuchBerichtFelder } from "@/components/BesuchBericht";
import { DEMO_STATUS, demosVon } from "@/lib/demos";
import { linkSchluessel } from "@/lib/geheim";
import { dateiAnKunden, dateiFreigeben, dateiLoeschen, beitragAnlegen, beitraegeVorlegen, beitragUeberarbeiten, beitragVeroeffentlicht, beitragLoeschen, demoFreigeben, demoHochladen, demoLoeschen, demoZurueckziehen, gespraechImportieren, besuchErfassen, aktivitaetAnlegen, antwortEntwerfen, nachrichtErledigt, portalLinkErneuern, portalZugangAnlegen, portalZugangSperren, betriebSpeichern, betriebZuweisen, datenLoeschen, einstufen, kontaktLoeschen, kontaktSpeichern, widerspruch, zahlungSimulieren } from "../../aktionen";
import { AufgabenListe } from "@/components/AufgabenListe";
import { ARTEN } from "@/lib/ablauf/crm";
import { ticketNummer } from "@/lib/ablauf/tickets";
import { KANAELE } from "@/lib/ablauf/nachrichten";
import { JETZT, WEG, wegIndex } from "@/lib/weg";
import { ERGEBNISSE, KONTAKT } from "@/lib/ablauf/vertrieb";
import { aktivesMandat, ibanMaskiert } from "@/lib/ablauf/mandat";
import { dateienVon } from "@/lib/dateien";
import { BEITRAG_ARTEN, BEITRAG_STATUS, KANAELE as BEITRAG_KANAELE, beitraegeVon } from "@/lib/beitraege";

const PROJEKT_TEXT: Record<string, string> = { inhalte: "wartet auf Inhalte", bau: "wird gebaut", pruefung: "Prüfung nicht bestanden", bereit: "Vorschau beim Kunden", live: "live, Betreuung läuft", beendet: "beendet" };
const ANGEBOT_TEXT: Record<string, string> = { entwurf: "erstellt", versendet: "beim Kunden", unterschrieben: "unterschrieben", angezahlt: "erste Rate bezahlt", abgeschlossen: "abgeschlossen", abgelehnt: "abgelehnt", ueberholt: "durch neues Angebot ersetzt" };

const REITER = [["ueberblick", "Überblick"], ["stammdaten", "Stammdaten"], ["aktivitaeten", "Aktivitäten"], ["dokumente", "Unterlagen"], ["portal", "Kundenportal"]] as const;
// Seltener gebraucht: über das Menü „Mehr“ oben rechts
const MEHR = [["zustaendig", "Zuständig und Schlagworte"], ["tickets", "Tickets"], ["log", "Änderungsprotokoll"], ["datenschutz", "Datenschutz und Zugänge"]] as const;
const ERFASSEN = [["notiz", "Notiz, Anruf, Aufgabe"], ["besuch", "Besuch vor Ort"], ["gespraech", "Gespräch importieren"]] as const;
type Auswertung = { ziele?: string[]; probleme?: string[]; empfehlung?: { paket?: string; begruendung?: string }; offeneFragen?: string[]; massnahmen?: { was: string; wann: string; wer: string }[] };

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const db = await getDb();
  const n = Number((await params).id);
  if (!Number.isInteger(n) || n <= 0) return { title: "Kundenakte" };
  const [x] = await db.select({ name: schema.betriebe.name }).from(schema.betriebe).where(eq(schema.betriebe.id, n));
  return { title: x?.name ?? "Kundenakte" };
}

export default async function Lead({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; erfassen?: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const sp = await searchParams;
  const tabRoh = sp.tab;
  const tab = [...REITER, ...MEHR].some(([k]) => k === tabRoh) ? tabRoh! : "ueberblick";
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
  const heuteIso = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" }); // JJJJ-MM-TT
  const [doks, post, termine, angebote, projekte, demos, laufend, verlauf] = await Promise.all([
    db.select().from(schema.dokumente).where(eq(schema.dokumente.betriebId, id)).orderBy(desc(schema.dokumente.erstelltAm)),
    db.select().from(schema.postausgang).where(eq(schema.postausgang.betriebId, id)).orderBy(desc(schema.postausgang.erstelltAm)),
    db.select().from(schema.termine).where(eq(schema.termine.betriebId, id)).orderBy(desc(schema.termine.erstelltAm)),
    db.select().from(schema.angebote).where(eq(schema.angebote.betriebId, id)).orderBy(desc(schema.angebote.erstelltAm)),
    db.select().from(schema.projekte).where(eq(schema.projekte.betriebId, id)),
    db.select().from(schema.seiten).where(and(eq(schema.seiten.betriebId, id), eq(schema.seiten.art, "demo"))),
    db.select().from(schema.jobs).where(and(inArray(schema.jobs.status, ["wartet", "laeuft"]), inArray(schema.jobs.art, ["vorbereitung", "transkription", "auswertung"]))),
    db.select().from(schema.protokoll).where(eq(schema.protokoll.betriebId, id)).orderBy(desc(schema.protokoll.am)).limit(200),
  ]);
  const demoPakete = await demosVon(id);
  const besuche = await db.select().from(schema.besuche).where(eq(schema.besuche.betriebId, id)).orderBy(desc(schema.besuche.am));
  const rechnungen = await db.select().from(schema.rechnungen).where(eq(schema.rechnungen.betriebId, id)).orderBy(desc(schema.rechnungen.erstelltAm));
  const inArbeit = laufend.filter((j) => Number(j.daten.betriebId) === id || termine.some((t) => t.id === Number(j.daten.terminId)));
  const angebot = angebote[0];
  const sepaMandat = await aktivesMandat(id);
  const beitraege = await beitraegeVon(id);
  const dateien = await dateienVon(id);
  const mitMarketing = beitraege.length > 0 || angebote.some((a) => (a.module ?? []).includes("marketing") && a.unterschriebenAm);
  const projekt = projekte[0];
  const offenePost = post.filter((p) => p.status === "zur_freigabe");
  const fehlPost = post.filter((p) => p.status === "freigegeben" && p.fehler);
  const gesperrt = b.status === "gesperrt";
  const lexwareAktiv = istEcht("buchhaltung");
  const index = wegIndex(b, angebot, projekt);
  const hauptkontakt = kontakte.find((k) => k.haupt) ?? kontakte[0];
  // Der Inhaber aus den Stammdaten ist der erste Ansprechpartner (außer er ist schon als Kontakt angelegt)
  const inhaberAlsKontakt = (b.inhaber || b.telefon || b.email) && !kontakte.some((k) => b.inhaber && k.name.trim().toLowerCase() === b.inhaber.trim().toLowerCase());
  const offeneRechnungen = rechnungen.filter((r) => r.status !== "bezahlt" && r.status !== "storniert");
  const verschickt = post.filter((p) => p.versendetAm).length;
  // Erfassen: Standard je nach Stand (angeschrieben → Besuch, Termin → Gespräch)
  const erfassenStandard = gesperrt ? "notiz" : b.status === "angeschrieben" ? "besuch" : b.status === "termin" ? "gespraech" : "notiz";
  const erfassen = ERFASSEN.some(([k]) => k === sp.erfassen) ? sp.erfassen! : erfassenStandard;

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
                ? { was: `Unterschrieben am ${datum(angebot.unterschriebenAm)}: wir warten auf die erste Rate`, unter: `${euro(Math.round(angebot.einmalig / 2))} netto (${euro(Math.round(Math.round(angebot.einmalig / 2) * 1.19))} brutto). ${lexwareAktiv ? "Lexware meldet Zahlungen täglich von selbst." : "Buchen, sobald das Geld auf dem Konto ist."}`, knopf: (
                    <details className="bestaetigen">
                      <summary className="knopf haupt">Zahlung eingegangen</summary>
                      <form action={zahlungSimulieren} style={{ marginTop: 8, display: "grid", gap: 8 }}>
                        <input type="hidden" name="betriebId" value={id} /><input type="hidden" name="angebotId" value={angebot.id} />
                        <p className="klein" style={{ margin: 0 }}>Ist die erste Rate über <b className="mono">{euro(Math.round(Math.round(angebot.einmalig / 2) * 1.19))}</b> brutto auf dem Konto? Danach startet das Projekt und die Start-Mail liegt zur Freigabe.</p>
                        <button className="knopf klein">Ja, Geld ist da</button>
                      </form>
                    </details>
                  ) }
                : angebot && ["entwurf", "versendet"].includes(angebot.status)
                  ? { was: "Verträge auf dem Tablet unterschreiben", unter: `Angebot ${PAKETE[angebot.paket as PaketKey]?.name ?? angebot.paket} ${angebot.status === "versendet" ? "ist beim Kunden" : "ist erstellt"}. Beim Termin: Rahmenvertrag und je Baustein ein Leistungsschein.`, knopf: <div className="knopfreihe" style={{ gap: 8 }}><Link className="knopf haupt" href={`/unterschrift/${angebot.id}`}>Unterschreiben lassen</Link>{angebot.status === "entwurf" ? <Link className="knopf klein" href={`/leads/${id}/angebot/${angebot.id}`}>E-Mail zum Angebot</Link> : null}</div> }
                  : b.status === "angeschrieben"
                    ? { was: `Besuch vor Ort ab ${datum(b.besuchAb)}`, unter: "Demo zeigen, nach dem Gespräch kurz den Besuchsbericht ausfüllen oder das Gespräch aufnehmen.", knopf: <Link className="knopf haupt" href={`/leads/${id}?tab=aktivitaeten&erfassen=besuch`}>Besuch erfassen</Link> }
                    : ["interessant", "termin"].includes(b.status)
                      ? { was: "Angebot erstellen", unter: "Webauftritt und Module gemeinsam auswählen; der Preis rechnet sofort mit.", knopf: <Link className="knopf haupt" href={`/leads/${id}/angebot`}>Angebot erstellen</Link> }
                      : { was: "Kein nächster Schritt geplant", unter: "Unter „Aktivitäten“ eine Aufgabe anlegen." };

  // Verlauf: Besuche, Gespräche mit Protokoll, Nachrichten und Notizen in einer Zeitleiste, neueste oben
  type Eintrag = { key: string; am: Date; typ: string; etikett: string; titel: string; text?: string | null; wer?: string | null; extra?: React.ReactNode };
  const protokolle = doks.filter((d) => d.art === "protokoll");
  const zeitleiste: Eintrag[] = [
    ...besuche.map((v) => ({ key: `b${v.id}`, am: v.am, typ: "besuch", etikett: "Besuch", titel: ERGEBNISSE[v.ergebnis] ?? v.ergebnis, wer: v.erstelltVon, text: [v.inhaberAngetroffen ? "Inhaber angetroffen" : "Inhaber nicht angetroffen", v.dauerMin ? `${v.dauerMin} Min.` : null, v.paket ? `Paket ${v.paket === "KOMPAKT" ? "Kompakt" : "Professional"}` : null, v.variante ? `Variante ${v.variante}` : null, v.einwand ? `Einwand: „${v.einwand}“` : null, v.art14Info ? "Art.-14-Info dagelassen" : "Art.-14-Info fehlt", v.einwilligungKontakt && v.einwilligungKontakt !== "keine" ? KONTAKT[v.einwilligungKontakt] : null].filter(Boolean).join(" · ") })),
    ...termine.map((t) => ({ key: `t${t.id}`, am: t.datum, typ: "gespraech", etikett: "Gespräch", titel: t.audioPfad ? "Gespräch vor Ort aufgenommen" : "Gespräch (aus Claude übernommen)", wer: t.einwilligungVon ? `Einwilligung ${t.einwilligungVon}` : null, text: t.audioPfad ? (t.audioGeloeschtAm ? `Aufnahme gelöscht am ${datum(t.audioGeloeschtAm)}` : "Aufnahme gespeichert, wird nach dem Versand gelöscht") : null, extra: <>{t.auswertung ? <Zusammenfassung a={t.auswertung as Auswertung} /> : <p className="leise klein">Noch keine Zusammenfassung: Das Gespräch wird gerade ausgewertet.</p>}{protokolle.length ? <div className="knopfreihe" style={{ marginTop: 8 }}>{protokolle.map((d) => <a key={d.id} className="knopf klein" href={`/dokument/${d.id}`} target="_blank">Protokoll als PDF ({datum(d.erstelltAm)})</a>)}</div> : null}</> })),
    ...nachrichten.map((n) => ({ key: `n${n.id}`, am: n.zeit, typ: n.richtung === "ein" ? "ein" : "aus", etikett: KANAELE[n.kanal] ?? n.kanal, titel: `${n.richtung === "ein" ? "Von" : "An"} ${n.richtung === "ein" ? n.absender : n.empfaenger}${n.betreff ? `: ${n.betreff}` : ""}`, text: n.richtung === "aus" ? (n.inhalt.length > 160 ? `${n.inhalt.replace(/\s+/g, " ").slice(0, 160)} …` : n.inhalt) : n.inhalt.length > 500 ? `${n.inhalt.slice(0, 500)} …` : n.inhalt, extra: n.richtung === "ein" && n.status === "neu" ? <div className="knopfreihe" style={{ marginTop: 8 }}>{n.kanal === "mail" || n.kanal === "whatsapp" ? <form action={antwortEntwerfen}><input type="hidden" name="id" value={n.id} /><input type="hidden" name="zurueck" value={`/leads/${id}?tab=aktivitaeten`} /><button className="knopf klein">Antwort entwerfen</button></form> : null}<form action={nachrichtErledigt}><input type="hidden" name="id" value={n.id} /><input type="hidden" name="zurueck" value={`/leads/${id}?tab=aktivitaeten`} /><button className="knopf klein">Erledigt</button></form></div> : null })),
    ...chronik.map((a) => ({ key: `a${a.id}`, am: a.erledigtAm ?? a.erstelltAm, typ: "notiz", etikett: ARTEN[a.art] ?? a.art, titel: `${a.titel}${a.erledigtAm && a.faelligAm ? " (erledigt)" : ""}`, wer: a.erstelltVon, text: a.text })),
    ...post.filter((p) => p.versendetAm && p.kanal !== "mail" && p.kanal !== "whatsapp").map((p) => ({ key: `p${p.id}`, am: p.versendetAm!, typ: "aus", etikett: "Versendet", titel: ZWECK[p.zweck] ?? p.zweck, text: p.betreff })),
    // Änderungsprotokoll: angelegt, eingestuft, Angebot erstellt, freigegeben … (Nachrichten und Notizen stehen schon oben)
    ...verlauf.filter((v) => !/^(E-Mail|WhatsApp|Telefon|Kundenportal|Website-Formular) von |^Erledigt: |^Nachricht \d+ erledigt/.test(v.aktion)).map((v) => ({ key: `l${v.id}`, am: v.am, typ: "log", etikett: "Log", titel: v.aktion, wer: v.wer, text: v.detail })),
  ].sort((x, y) => y.am.getTime() - x.am.getTime()).slice(0, 120);

  // Datum je Schritt (wie im Kundenportal), soweit bekannt
  const brief = post.find((p) => p.zweck === "akquise_brief" && p.versendetAm);
  const daten: (Date | null | undefined)[] = [b.erstelltAm, brief?.versendetAm, termine[0]?.datum, angebot?.erstelltAm, angebot?.unterschriebenAm, angebot?.angezahltAm, projekt?.inhalteAm, projekt?.abnahmeAm, projekt?.liveAm];
  // Schritte, die es bei diesem Betrieb nie gab (z. B. kein Brief, weil der Kontakt anders zustande kam), heißen „übersprungen“, nicht „erledigt“
  const gespraechGab = termine.length > 0 || aktivitaeten.some((x) => ["besuch", "gespraech", "termin"].includes(x.art));
  const uebersprungen = (i: number) => i < index && ((i === 1 && !brief?.versendetAm) || (i === 2 && !gespraechGab));
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
          {b.portalToken ? <Link className="knopf klein" href={`/leads/${id}?tab=portal`}>Kundenportal ansehen</Link> : <span className="leise klein">Kundenportal ab dem ersten Angebot</span>}
          <details className="menue">
            <summary className="knopf klein" aria-label="Weitere Bereiche">Mehr ▾</summary>
            <nav className="menue-liste" aria-label="Weitere Bereiche des Betriebs">
              {MEHR.map(([k, n]) => (
                <Link key={k} href={`/leads/${id}?tab=${k}`} aria-current={tab === k ? "page" : undefined}>
                  {n}{k === "tickets" && tickets.some((t) => t.status !== "erledigt") ? <span className="reiter-zahl warten">{tickets.filter((t) => t.status !== "erledigt").length}</span> : null}
                </Link>
              ))}
            </nav>
          </details>
        </div>
      </div>

      {MEHR.some(([k]) => k === tab) ? <p className="klein leise" style={{ margin: "-8px 0 8px" }}>Mehr → <b>{MEHR.find(([k]) => k === tab)![1]}</b></p> : null}
      <nav className="reiter" aria-label="Bereiche des Betriebs">
        {REITER.map(([k, n]) => <Link key={k} href={`/leads/${id}?tab=${k}`} aria-current={tab === k ? "page" : undefined}>{n}{k === "aktivitaeten" && offeneAufgaben.length ? ` · ${offeneAufgaben.length} offen` : ""}</Link>)}
      </nav>

      {tab === "ueberblick" ? (
        <>
          {!b.email && !gesperrt ? <Link className="hinweis" href={`/leads/${id}?tab=stammdaten`} style={{ display: "block", textDecoration: "none" }}>E-Mail-Adresse fehlt noch. Für Angebot und Kundenportal wird sie gebraucht: in den Stammdaten nachtragen →</Link> : null}
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
                  <li key={titel} className={uebersprungen(i) ? "" : i < index ? "erledigt" : i === index ? "aktuell" : ""}>
                    <span className="punkt" aria-hidden="true">{uebersprungen(i) ? "–" : i < index ? "✓" : i + 1}</span>
                    <div>
                      <div className="titel">{titel}{uebersprungen(i) ? <span className="leise klein"> · übersprungen</span> : i < index ? <span className="sr-only"> (erledigt)</span> : i === index ? <span className="leise klein"> · jetzt</span> : null}</div>
                      <div className="unter">{uebersprungen(i) ? "" : i < index ? (daten[i] ? datum(daten[i]) : "erledigt") : i === index ? JETZT[i] : ""}</div>
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
                    {angebot.monatlich > 0 && angebot.unterschriebenAm ? (
                      <p className="klein" style={{ margin: "8px 0 0" }}>
                        SEPA-Mandat: {sepaMandat ? <><span className="status ok">erteilt</span> <span className="mono">{ibanMaskiert(sepaMandat.daten.konto.iban)}</span> · <a href={`/dokument/${sepaMandat.id}`} target="_blank">PDF</a></> : <><span className="status warten">offen</span> <span className="leise">Kunde kann es im Kundenportal erteilen</span></>}
                      </p>
                    ) : null}
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

              {fehlPost.length ? (
                <section className="karte" aria-labelledby="versandfehler">
                  <h2 id="versandfehler">Nicht versendet</h2>
                  <ul className="liste">
                    {fehlPost.map((p) => (
                      <li key={p.id}>
                        <div><div className="titel">{ZWECK[p.zweck] ?? p.zweck} <span className="status fehler">Versand fehlgeschlagen</span></div><div className="unter">{p.fehler}</div></div>
                        <Link className="knopf klein" href={`/freigaben/${p.id}`}>Ansehen</Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
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
              {inhaberAlsKontakt ? (
                <ul className="liste">
                  <li>
                    <div style={{ flex: 1 }}><div className="titel">{[b.anrede, b.inhaber].filter(Boolean).join(" ") || "Inhaber"}{kontakte.some((k) => k.haupt) ? null : <span className="status ok" style={{ marginLeft: 8 }}>Hauptkontakt</span>}</div><div className="unter">{["Inhaber", b.telefon ? <a key="t" href={`tel:${b.telefon.replace(/\s/g, "")}`}>{b.telefon}</a> : null, b.email ? <a key="m" href={`mailto:${b.email}`}>{b.email}</a> : null].filter(Boolean).map((x, i) => <span key={i}>{i ? " · " : ""}{x}</span>)}</div></div>
                    <Link className="knopf klein" href={`/leads/${id}?tab=stammdaten`}>Ändern</Link>
                  </li>
                </ul>
              ) : null}
              {kontakte.length ? (
                <ul className="liste">
                  {kontakte.map((k) => (
                    <li key={k.id}>
                      <div style={{ flex: 1 }}><div className="titel">{k.name}{k.haupt ? <span className="status ok" style={{ marginLeft: 8 }}>Hauptkontakt</span> : null}</div><div className="unter">{[k.rolle, k.telefon ? <a key="t" href={`tel:${k.telefon.replace(/\s/g, "")}`}>{k.telefon}</a> : null, k.email ? <a key="m" href={`mailto:${k.email}`}>{k.email}</a> : null].filter(Boolean).map((x, i) => <span key={i}>{i ? " · " : ""}{x}</span>)}</div></div>
                      <form action={kontaktLoeschen}><input type="hidden" name="id" value={k.id} /><input type="hidden" name="betriebId" value={id} /><button className="knopf klein" aria-label={`${k.name} löschen`}>Löschen</button></form>
                    </li>
                  ))}
                </ul>
              ) : !inhaberAlsKontakt ? <p className="leise klein">Noch keine. Inhaber, Telefon und E-Mail in den Stammdaten eintragen.</p> : null}
              <details style={{ marginTop: 8 }}>
                <summary style={{ cursor: "pointer" }}>Weiteren Ansprechpartner hinzufügen</summary>
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
                {offeneAufgaben.length ? <AufgabenListe eintraege={offeneAufgaben.map((a) => ({ a, betrieb: null }))} zurueck={`/leads/${id}`} mitBetrieb={false} /> : <p className="leise klein">Keine offenen Aufgaben.</p>}
                <details className="schnell-aufgabe">
                  <summary className="knopf klein">+ Aufgabe hinzufügen</summary>
                  <form action={aktivitaetAnlegen} className="schnell-form">
                    <input type="hidden" name="betriebId" value={id} />
                    <input type="hidden" name="art" value="aufgabe" />
                    <input type="hidden" name="zurueck" value={`/leads/${id}`} />
                    <input name="titel" required placeholder="Was ist zu tun?" aria-label="Aufgabe" />
                    <input type="date" name="faellig" defaultValue={heuteIso} aria-label="Fällig am" required />
                    <select name="zustaendig" defaultValue="" aria-label="Wer"><option value="">ich</option>{benutzer.map((x) => <option key={x.name}>{x.name}</option>)}</select>
                    <button className="knopf klein">Anlegen</button>
                  </form>
                </details>
              </section>
            </div>
          </div>
        </>
      ) : null}

      {tab === "aktivitaeten" ? (
        <div className="akte-raster" style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.3fr)" }}>
          <div className="raster" style={{ gap: 16, alignContent: "start" }}>
            <section className="karte" aria-labelledby="erfassen">
              <h2 id="erfassen">Erfassen</h2>
              <nav className="reiter klein-reiter" aria-label="Was erfassen?" style={{ marginBottom: 12 }}>
                {ERFASSEN.filter(([k]) => k === "notiz" || (!gesperrt && (k === "besuch" ? b.status !== "kunde" : ["interessant", "angeschrieben", "termin"].includes(b.status)))).map(([k, n]) => (
                  <Link key={k} href={`/leads/${id}?tab=aktivitaeten&erfassen=${k}`} aria-current={erfassen === k ? "page" : undefined}>{n}</Link>
                ))}
              </nav>
              {erfassen === "besuch" ? (
                <>
                  <p className="leise klein" style={{ marginTop: 0 }}>Kurz nach dem Besuch ausfüllen. Er erscheint danach im Verlauf.</p>
                  <form action={besuchErfassen} className="messbogen" style={{ maxWidth: "none" }}>
                  <input type="hidden" name="betriebId" value={id} />
                  <input type="hidden" name="zurueck" value={`/leads/${id}?tab=aktivitaeten`} />
                  <BesuchBerichtFelder />
                </form>
                </>
              ) : erfassen === "gespraech" ? (
                <>
                  <p className="leise klein" style={{ marginTop: 0 }}>Zusammenfassung oder Mitschrift des Gesprächs aus Claude hier einfügen. Daraus entstehen Protokoll, Maßnahmenplan und Angebotsentwurf, alles zur Freigabe. Automatisch geht das auch über n8n (Stammdaten → Konnektoren → „Gespräche aus Claude“).</p>
                  <form action={gespraechImportieren}>
                    <input type="hidden" name="id" value={id} />
                    <label className="feld"><span>Gespräch aus Claude</span><textarea name="text" required rows={8} placeholder="Zusammenfassung oder Mitschrift einfügen …" style={{ minHeight: 180 }} /></label>
                    <label className="feld" style={{ maxWidth: 220 }}><span>Datum des Gesprächs</span><input type="date" name="datum" defaultValue={heuteIso} /></label>
                    <label className="haken" style={{ marginBottom: 12 }}>
                      <input type="checkbox" name="einwilligung" value="ja" required />
                      <span><b>Einwilligung liegt vor.</b> {b.inhaber ?? "Der Inhaber"} war einverstanden, dass das Gespräch mitgeschrieben wird.</span>
                    </label>
                    <button className="knopf">Gespräch übernehmen</button>
                  </form>
                </>
              ) : (
                <form action={aktivitaetAnlegen}>
                <input type="hidden" name="betriebId" value={id} />
                <input type="hidden" name="zurueck" value={`/leads/${id}?tab=aktivitaeten`} />
                <div className="raster links-schmal" style={{ gap: 12 }}>
                  <label className="feld"><span>Was?</span><select name="art" defaultValue="aufgabe"><option value="aufgabe">Aufgabe (zu erledigen)</option><option value="termin">Termin</option><option value="anruf">Anruf (war schon)</option><option value="notiz">Notiz (nur festhalten)</option></select></label>
                  <label className="feld"><span>Kurz</span><input name="titel" required placeholder="z. B. Fotos beim Kunden abholen" /></label>
                </div>
                <label className="feld"><span>Details <em>optional</em></span><textarea name="text" rows={3} placeholder="Was wurde besprochen? Was ist zu tun?" style={{ minHeight: 80 }} /></label>
                <div className="raster zwei" style={{ gap: 12 }}>
                  <label className="feld"><span>Fällig am <em>dann in „Mein Tag“</em></span><input type="date" name="faellig" defaultValue={heuteIso} /></label>
                  <label className="feld"><span>Wer kümmert sich?</span><select name="zustaendig" defaultValue=""><option value="">ich</option>{benutzer.map((x) => <option key={x.name}>{x.name}</option>)}</select></label>
                </div>
                <p className="leise klein" style={{ margin: "0 0 12px" }}>Aufgaben und Termine erscheinen am Fälligkeitstag in „Mein Tag“. Anruf und Notiz stehen nur im Verlauf, außer du setzt ein Datum: dann kommt eine Erinnerung.</p>
                <button className="knopf">Eintragen</button>
              </form>
              )}
            </section>

            <section className="karte">
              <h2>Offene Aufgaben</h2>
              {offeneAufgaben.length ? <AufgabenListe eintraege={offeneAufgaben.map((a) => ({ a, betrieb: null }))} zurueck={`/leads/${id}?tab=aktivitaeten`} mitBetrieb={false} /> : <p className="leise klein">Kein nächster Schritt geplant.</p>}
              <details className="schnell-aufgabe">
                  <summary className="knopf klein">+ Aufgabe hinzufügen</summary>
                  <form action={aktivitaetAnlegen} className="schnell-form">
                    <input type="hidden" name="betriebId" value={id} />
                    <input type="hidden" name="art" value="aufgabe" />
                    <input type="hidden" name="zurueck" value={`/leads/${id}?tab=aktivitaeten`} />
                    <input name="titel" required placeholder="Was ist zu tun?" aria-label="Aufgabe" />
                    <input type="date" name="faellig" defaultValue={heuteIso} aria-label="Fällig am" required />
                    <select name="zustaendig" defaultValue="" aria-label="Wer"><option value="">ich</option>{benutzer.map((x) => <option key={x.name}>{x.name}</option>)}</select>
                    <button className="knopf klein">Anlegen</button>
                  </form>
                </details>
            </section>
          </div>

          <section className="karte" aria-labelledby="verlauf">
            <div className="kopfzeile" style={{ marginBottom: 8 }}><h2 id="verlauf" style={{ margin: 0 }}>Verlauf</h2><span className="leise klein">Eintrag anklicken für Details</span></div>
            {zeitleiste.length ? (
              <ol className="zeitleiste">
                {zeitleiste.map((e) => (
                  <li key={e.key}>
                    <span className={`art art-${e.typ}`}>{e.etikett}</span>
                    <details className="inhalt verlauf-eintrag">
                      <summary className="kopf"><span className="titel">{e.titel}</span><span className="leise klein">{datumZeit(e.am)}{e.wer ? ` · ${e.wer}` : ""}</span></summary>
                      {e.text ? <div className="text">{e.text}</div> : null}
                      {e.extra ?? null}
                      {!e.text && !e.extra ? <div className="leise klein">Keine weiteren Angaben.</div> : null}
                    </details>
                  </li>
                ))}
              </ol>
            ) : <p className="leise">Noch nichts. Besuche, Gespräche, Nachrichten und Notizen erscheinen hier.</p>}
          </section>
        </div>
      ) : null}

      {tab === "portal" ? (
        b.portalToken ? (
          <section className="karte" aria-labelledby="portalsicht">
            <div className="kopfzeile" style={{ marginBottom: 10 }}>
              <div><h2 id="portalsicht" style={{ margin: 0 }}>So sieht {b.inhaber ?? "der Kunde"} das Kundenportal</h2><p className="leise klein" style={{ margin: "4px 0 0" }}>Echte Ansicht mit dem Link des Kunden. Nur ansehen: Abnahme oder Formulare hier bitte nicht für den Kunden ausfüllen.</p></div>
              <a className="knopf klein" href={`${process.env.PORTAL_URL ? portalBasis() : ""}/portal/k/${b.portalToken}`} target="_blank" rel="noopener noreferrer">In neuem Fenster ↗</a>
            </div>
            <iframe className="portalrahmen" src={`${process.env.PORTAL_URL ? portalBasis() : ""}/portal/k/${b.portalToken}`} title={`Kundenportal von ${b.name}`} />
          </section>
        ) : <div className="karte leer"><strong>Noch kein Kundenportal.</strong>Es entsteht mit dem ersten Angebot.</div>
      ) : null}

      {tab === "dokumente" ? (
        <>
        <section className="karte abstand-klein" id="demo" aria-labelledby="demo-titel">
          <div className="kopfzeile" style={{ marginBottom: 4 }}>
            <h2 id="demo-titel" style={{ margin: 0 }}>Demo-Paket</h2>
            <span className="leise klein">Website und Instagram-Vorlagen zum Anklicken</span>
          </div>
          <p className="leise klein">Nach dem Besuch: Demo als ZIP hochladen (mit index.html auf oberster Ebene), intern ansehen, dann ins Kundenportal freigeben. Der Kunde sieht sie erst, wenn ihr die Mail dazu freigegeben habt.</p>
          {demoPakete.length ? (
            <ul className="zeilen">
              {demoPakete.map((d) => (
                <li key={d.id}>
                  <div>
                    <div className="titel">{d.titel}</div>
                    <div className="unter">{d.dateien} Dateien · {dateiGroesse(d.groesse)} · hochgeladen {datum(d.erstelltAm)} von {d.erstelltVon}{d.imPortalAm ? ` · im Portal seit ${datum(d.imPortalAm)}` : ""}</div>
                  </div>
                  <div className="knopfreihe" style={{ gap: 8 }}>
                    <span className={`status ${d.status === "im_portal" ? "ok" : d.status === "zur_freigabe" ? "warten" : ""}`}>{DEMO_STATUS[d.status] ?? d.status}</span>
                    <a className="knopf klein" href={`/demo-ansicht/${linkSchluessel("demo-intern", d.id)}/index.html`} target="_blank" rel="noopener">Ansehen</a>
                    {d.status === "entwurf" || d.status === "zurueckgezogen" ? <form action={demoFreigeben}><input type="hidden" name="betriebId" value={id} /><input type="hidden" name="demoId" value={d.id} /><button className="knopf klein">Im Kundenportal freigeben</button></form> : null}
                    {d.status === "zur_freigabe" && d.eintragId ? <Link className="knopf klein" href={`/freigaben/${d.eintragId}`}>Zur Freigabe</Link> : null}
                    {d.status === "im_portal" ? <form action={demoZurueckziehen}><input type="hidden" name="betriebId" value={id} /><input type="hidden" name="demoId" value={d.id} /><button className="knopf klein">Aus dem Portal nehmen</button></form> : null}
                    <form action={demoLoeschen}><input type="hidden" name="betriebId" value={id} /><input type="hidden" name="demoId" value={d.id} /><button className="knopf klein gefahr" aria-label={`Demo ${d.titel} löschen`}>Löschen</button></form>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
          <details className="schnell-aufgabe" open={!demoPakete.length}>
            <summary className="knopf klein">+ Demo-Paket hochladen</summary>
            <form action={demoHochladen} className="schnell-form" style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr) auto" }}>
              <input type="hidden" name="betriebId" value={id} />
              <input name="titel" placeholder={`z. B. Demo für ${b.name}`} aria-label="Titel" defaultValue={`Demo für ${b.name}`} />
              <input type="file" name="datei" accept=".zip,application/zip" required aria-label="ZIP-Datei" />
              <button className="knopf klein">Hochladen</button>
            </form>
          </details>
        </section>
        {mitMarketing ? (
          <section className="karte abstand-klein" id="beitraege" aria-labelledby="beitraege-titel">
            <div className="kopfzeile" style={{ marginBottom: 4 }}>
              <h2 id="beitraege-titel" style={{ margin: 0 }}>Beiträge und Bewertungsantworten</h2>
              {beitraege.some((x) => x.status === "entwurf") ? <form action={beitraegeVorlegen}><input type="hidden" name="betriebId" value={id} /><button className="knopf klein">{beitraege.filter((x) => x.status === "entwurf").length === 1 ? "Entwurf dem Betrieb vorlegen" : `${beitraege.filter((x) => x.status === "entwurf").length} Entwürfe dem Betrieb vorlegen`}</button></form> : null}
            </div>
            <p className="leise klein">Entwürfe schreiben, dann gesammelt vorlegen: Die Mail mit allen Texten geht durch Qualitätskontrolle und Freigabe. Danach gibt der Betrieb jeden Entwurf im Portal frei. Veröffentlicht wird nur Freigegebenes.</p>
            {beitraege.length ? (
              <ul className="zeilen">
                {beitraege.map((x) => (
                  <li key={x.id} style={{ alignItems: "start" }}>
                    <div style={{ display: "flex", gap: 12, minWidth: 0 }}>
                      {x.bild ? <img src={`/beitrag-bild/${x.id}`} alt="" width={64} height={64} style={{ objectFit: "cover", flex: "none" }} /> : null}
                      <div style={{ minWidth: 0 }}>
                        <div className="titel">{BEITRAG_ARTEN[x.art]} · {x.kanaele.map((k) => BEITRAG_KANAELE[k] ?? k).join(", ")}{x.geplantAm ? ` · geplant ${datum(x.geplantAm)}` : ""}</div>
                        {x.bezug ? <div className="unter">Bewertung: „{x.bezug.slice(0, 160)}“</div> : null}
                        <div className="klein" style={{ whiteSpace: "pre-wrap" }}>{x.text}</div>
                        {x.kommentar ? <div className="hinweis klein" style={{ marginTop: 6 }}>Wunsch des Betriebs: {x.kommentar}</div> : null}
                        {["entwurf", "abgelehnt"].includes(x.status) ? (
                          <details className="schnell-aufgabe"><summary className="klein">Text ändern</summary>
                            <form action={beitragUeberarbeiten} style={{ display: "grid", gap: 8 }}><input type="hidden" name="betriebId" value={id} /><input type="hidden" name="beitragId" value={x.id} /><textarea name="text" rows={4} defaultValue={x.text} aria-label="Text" /><button className="knopf klein">Speichern</button></form>
                          </details>
                        ) : null}
                      </div>
                    </div>
                    <div className="knopfreihe" style={{ gap: 8 }}>
                      <span className={`status ${x.status === "freigegeben" || x.status === "veroeffentlicht" ? "ok" : x.status === "abgelehnt" ? "fehler" : x.status === "entwurf" ? "" : "warten"}`}>{BEITRAG_STATUS[x.status] ?? x.status}</span>
                      {x.status === "zur_vorlage" && x.eintragId ? <Link className="knopf klein" href={`/freigaben/${x.eintragId}`}>Zur Freigabe</Link> : null}
                      {x.status === "freigegeben" ? <form action={beitragVeroeffentlicht}><input type="hidden" name="betriebId" value={id} /><input type="hidden" name="beitragId" value={x.id} /><button className="knopf klein">Veröffentlicht</button></form> : null}
                      {["entwurf", "abgelehnt"].includes(x.status) ? <form action={beitragLoeschen}><input type="hidden" name="betriebId" value={id} /><input type="hidden" name="beitragId" value={x.id} /><button className="knopf klein gefahr" aria-label="Entwurf löschen">Löschen</button></form> : null}
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
            <details className="schnell-aufgabe" open={!beitraege.length}>
              <summary className="knopf klein">+ Entwurf schreiben</summary>
              <form action={beitragAnlegen} style={{ display: "grid", gap: 10, marginTop: 8 }}>
                <input type="hidden" name="betriebId" value={id} />
                <div className="raster drei">
                  <label className="feld"><span>Art</span><select name="art">{Object.entries(BEITRAG_ARTEN).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
                  <label className="feld"><span>Geplant für (freiwillig)</span><input type="date" name="geplantAm" /></label>
                  <label className="feld"><span>Foto (freiwillig)</span><input type="file" name="bild" accept="image/jpeg,image/png,image/webp" /></label>
                </div>
                <div className="knopfreihe">{Object.entries(BEITRAG_KANAELE).map(([k, n]) => <label key={k} className="haken"><input type="checkbox" name="kanal" value={k} defaultChecked={k !== "google"} /><span>{n}</span></label>)}</div>
                <label className="feld"><span>Text</span><textarea name="text" rows={4} required maxLength={2200} /></label>
                <label className="feld"><span>Bei Antworten: Text der Bewertung (ohne Namen)</span><textarea name="bezug" rows={2} /></label>
                <button className="knopf klein">Entwurf speichern</button>
              </form>
            </details>
          </section>
        ) : null}
        {b.portalToken || dateien.length ? (
          <section className="karte abstand-klein" id="dateien" aria-labelledby="dateien-titel">
            <div className="kopfzeile" style={{ marginBottom: 4 }}>
              <h2 id="dateien-titel" style={{ margin: 0 }}>Dateien mit dem Kunden</h2>
              <span className="leise klein">Fotos und PDFs über das Kundenportal, in beide Richtungen</span>
            </div>
            <p className="leise klein">Was der Kunde hochlädt, ist sofort hier (mit Aufgabe und Push-Meldung). Was ihr hochladet, sieht der Kunde erst, wenn die kurze Hinweis-Mail freigegeben und versendet ist.</p>
            {dateien.length ? (
              <ul className="zeilen">
                {dateien.map((d) => (
                  <li key={d.id}>
                    <div>
                      <div className="titel">{d.name}</div>
                      <div className="unter">{d.richtung === "vom_kunden" ? "vom Kunden" : "von uns"} · {d.typ.toUpperCase()} · {dateiGroesse(d.groesse)} · {datum(d.erstelltAm)}{d.notiz ? ` · „${d.notiz}“` : ""}</div>
                    </div>
                    <div className="knopfreihe" style={{ gap: 8 }}>
                      <span className={`status ${d.status === "neu" || d.status === "zur_freigabe" ? "warten" : d.status === "entwurf" ? "" : "ok"}`}>{{ neu: "neu", gesehen: "angesehen", entwurf: "noch nicht beim Kunden", zur_freigabe: "Hinweis-Mail in den Freigaben", im_portal: "im Kundenportal" }[d.status] ?? d.status}</span>
                      <a className="knopf klein" href={`/datei/${d.id}`} target="_blank">Öffnen</a>
                      {d.richtung === "an_kunden" && d.status === "entwurf" ? <form action={dateiFreigeben}><input type="hidden" name="betriebId" value={id} /><input type="hidden" name="dateiId" value={d.id} /><button className="knopf klein">Im Portal bereitstellen</button></form> : null}
                      {d.status === "zur_freigabe" && d.eintragId ? <Link className="knopf klein" href={`/freigaben/${d.eintragId}`}>Zur Freigabe</Link> : null}
                      {d.status !== "zur_freigabe" ? <form action={dateiLoeschen}><input type="hidden" name="betriebId" value={id} /><input type="hidden" name="dateiId" value={d.id} /><button className="knopf klein gefahr" aria-label={`${d.name} löschen`}>Löschen</button></form> : null}
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
            <details className="schnell-aufgabe">
              <summary className="knopf klein">+ Datei für den Kunden hochladen</summary>
              <form action={dateiAnKunden} className="schnell-form" style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr) auto" }}>
                <input type="hidden" name="betriebId" value={id} />
                <input type="file" name="datei" required accept="image/jpeg,image/png,image/webp,application/pdf" aria-label="Datei" />
                <input name="notiz" placeholder="Kurzer Hinweis für den Kunden (freiwillig)" aria-label="Hinweis" />
                <button className="knopf klein">Hochladen</button>
              </form>
            </details>
          </section>
        ) : null}
        <div className="raster zwei" style={{ alignItems: "start", marginBottom: 12 }}>
          <section className="karte">
            <h2>Angebote</h2>
            {angebote.length ? (
              <ul className="liste">
                {angebote.map((a) => {
                  const dok = doks.find((d) => d.art === "angebot" && (d.daten as { angebotId?: number }).angebotId === a.id) ?? (a.id === angebot?.id ? doks.find((d) => d.art === "angebot") : null) ?? null;
                  return (
                    <li key={a.id}>
                      <div><div className="titel">{PAKETE[a.paket as PaketKey]?.name ?? a.paket}{(a.module ?? []).length ? ` + ${(a.module ?? []).length} Modul${(a.module ?? []).length > 1 ? "e" : ""}` : ""}</div><div className="unter">{euro(a.einmalig)} einmalig · {euro(a.monatlich)} im Monat · {datum(a.erstelltAm)}</div></div>
                      <div className="knopfreihe" style={{ gap: 8 }}><span className="status">{ANGEBOT_TEXT[a.status] ?? a.status}</span>{dok ? <a className="knopf klein" href={`/dokument/${dok.id}`} target="_blank">PDF</a> : null}</div>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="leise klein">Noch kein Angebot.</p>}
          </section>
          <section className="karte">
            <h2>Rechnungen</h2>
            {rechnungen.length ? (
              <ul className="liste">
                {rechnungen.map((r) => {
                  const dok = doks.find((d) => d.art === "rechnung" && (d.daten as { nummer?: string }).nummer === r.nummer);
                  return (
                    <li key={r.id}>
                      <div><div className="titel">{r.nummer} · {r.art === "anzahlung" ? "Erste Rate" : r.art === "schluss" ? "Schlussrechnung" : "Monatsbeitrag"}</div><div className="unter">{euro(Math.round(r.netto * 1.19))} brutto · {datum(r.erstelltAm)}{r.faelligAm ? ` · fällig ${datum(r.faelligAm)}` : ""}</div></div>
                      <div className="knopfreihe" style={{ gap: 8 }}><Status wert={r.status} />{dok ? <a className="knopf klein" href={`/dokument/${dok.id}`} target="_blank">PDF</a> : null}</div>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="leise klein">Noch keine Rechnungen.</p>}
          </section>
        </div>
        <div className="raster zwei" style={{ alignItems: "start" }}>
        <section className="karte">
          <h2>Alle Unterlagen</h2>
          {doks.length || demos.length ? (
            <ul className="liste">
              {demos.map((d) => (
                <li key={d.slug}>
                  <div><div className="titel">Demo-Website</div><div className="unter">Code <span className="mono">{d.zugangscode}</span> · {d.loeschenAm && new Date(d.loeschenAm) > new Date() ? "wird gelöscht am" : "gelöscht am"} {datum(d.loeschenAm)}</div></div>
                  <a className="knopf klein" href={`/vorschau/${d.slug}?code=${d.zugangscode}`} target="_blank">Öffnen</a>
                </li>
              ))}
              {doks.map((d) => (
                <li key={d.id}>
                  <div><div className="titel">{DOKART[d.art] ?? d.art}{(d.daten as { widerrufenAm?: string; ersetztAm?: string }).widerrufenAm ? <> <span className="status fehler">widerrufen</span></> : (d.daten as { ersetztAm?: string }).ersetztAm ? <> <span className="status">ersetzt</span></> : null}</div><div className="unter">{d.titel} · {datum(d.erstelltAm)}</div></div>
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
        </>
      ) : null}

      {tab === "stammdaten" ? (
        <>
          <div>
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

      {tab === "zustaendig" ? (
          <form action={betriebZuweisen} className="karte">
            <h2>Zuständig und Schlagworte</h2>
            <p className="leise klein">Wer kümmert sich um diesen Betrieb? Schlagworte helfen beim Suchen und Filtern, z. B. „Messe 2027“.</p>
            <input type="hidden" name="id" value={id} />
            <div className="raster zwei">
              <label className="feld"><span>Zuständig</span><select name="zustaendig" defaultValue={b.zustaendig ?? ""}><option value="">niemand</option>{benutzer.map((x) => <option key={x.name}>{x.name}</option>)}</select></label>
              <label className="feld"><span>Schlagworte (mit Komma)</span><input name="tags" defaultValue={b.tags.join(", ")} placeholder="Messe 2027, Empfehlung" /></label>
            </div>
            <button className="knopf">Speichern</button>
          </form>
      ) : null}

      {tab === "tickets" ? (
          <section className="karte">
            <div className="kopfzeile" style={{ marginBottom: 4 }}><h2 style={{ margin: 0 }}>Tickets</h2>{b.status === "kunde" ? <Link className="knopf klein" href={`/tickets?betrieb=${id}`}>Ticket aufnehmen</Link> : null}</div>
            {tickets.length ? <ul className="liste">{tickets.map((t) => <li key={t.id}><div><div className="titel"><Link href={`/tickets/${t.id}`}>{ticketNummer(t.id)} {t.betreff}</Link></div><div className="unter">{datum(t.erstelltAm)}</div></div><Status wert={t.status === "in_arbeit" ? "in_arbeit_ticket" : t.status === "erledigt" ? "fertig" : t.status} /></li>)}</ul> : <p className="leise klein">Keine Tickets.</p>}
          </section>
      ) : null}

      {tab === "log" ? (
          <section className="karte">
            <h2>Änderungsprotokoll</h2>
            <p className="leise klein">Wer hat an diesem Betrieb wann was geändert (Nachweis nach DSGVO). Gespräche, Besuche und Nachrichten stehen unter „Aktivitäten“.</p>
            {verlauf.length ? (
              <ul className="zeilen">
                {verlauf.map((v) => <li key={v.id}><div><div>{v.aktion}</div><div className="unter">{v.wer}</div></div><span className="leise klein mono">{datumZeit(v.am)}</span></li>)}
              </ul>
            ) : <p className="leise">Noch nichts.</p>}
          </section>
      ) : null}

      {tab === "datenschutz" ? (
        <>
      {!gesperrt ? (
        <details className="karte">
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

/** Zusammenfassung eines aufgenommenen Gesprächs (aus der Auswertung), im Verlauf aufklappbar. */
function Zusammenfassung({ a }: { a: Auswertung }) {
  const liste = (titel: string, punkte?: string[]) => (punkte?.length ? <div><b className="klein">{titel}</b><ul className="klein" style={{ margin: "2px 0 8px", paddingLeft: 18 }}>{punkte.map((x) => <li key={x}>{x}</li>)}</ul></div> : null);
  return (
    <div className="zusammenfassung">
      {liste("Ziele des Betriebs", a.ziele)}
      {liste("Probleme", a.probleme)}
      {a.empfehlung?.paket ? <p className="klein" style={{ margin: "0 0 8px" }}><b>Empfehlung:</b> {PAKETE[a.empfehlung.paket as PaketKey]?.name ?? a.empfehlung.paket}{a.empfehlung.begruendung ? ` · ${a.empfehlung.begruendung}` : ""}</p> : null}
      {liste("Offene Fragen", a.offeneFragen)}
      {liste("Maßnahmen", a.massnahmen?.map((m) => `${m.was} (${m.wer}, ${m.wann})`))}
    </div>
  );
}
