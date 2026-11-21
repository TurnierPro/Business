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
import { aktivitaetAnlegen, antwortEntwerfen, nachrichtErledigt, portalLinkErneuern, portalZugangAnlegen, portalZugangSperren, betriebSpeichern, betriebZuweisen, datenLoeschen, einstufen, kontaktLoeschen, kontaktSpeichern, terminHochladen, widerspruch, zahlungSimulieren } from "../../aktionen";
import { AufgabenListe } from "@/components/AufgabenListe";
import { ARTEN } from "@/lib/ablauf/crm";
import { ticketNummer } from "@/lib/ablauf/tickets";
import { KANAELE } from "@/lib/ablauf/nachrichten";
import { WEG, wegIndex, wegProzent, wegText } from "@/lib/weg";

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

  return (
    <>
      {b.status === "kunde" ? <Link href="/projekte" className="zurueck">← Kunden</Link> : <Link href="/leads" className="zurueck">← Leads</Link>}
      <div className="akte">
        <div className="akte-kopf">
          <div>
            <h1>{b.name}</h1>
            <div className="unter">{[b.gewerk, b.inhaber, [b.plz, b.ort].filter(Boolean).join(" "), b.mitarbeiter ? `${b.mitarbeiter} Mitarbeitende` : null].filter(Boolean).join(" · ")}</div>
          </div>
          <div className="knopfreihe">
            <Status wert={b.status} />
            {!gesperrt && b.status !== "neu" && b.status !== "nicht_interessant" && !(angebot && ["interessant", "termin"].includes(b.status)) ? <Link className="knopf klein" href={`/leads/${id}/angebot`}>{angebot ? "Neues Angebot" : "Angebot erstellen"}</Link> : null}
          </div>
        </div>

        <section className="akte-held" aria-label="Stand">
          <div className="portal-held" style={{ padding: 0, border: 0, background: "transparent" }}>
            <div className="stand">
              <div className="stand-zeile"><span>Wo wir stehen</span><b>{wegText(index)}</b></div>
              <div className="portal-balken" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={wegProzent(index)} aria-label="Fortschritt"><span style={{ width: `${wegProzent(index)}%` }} /></div>
            </div>
          </div>
          <ol className="schritte weg" aria-label="Weg des Betriebs">
            {WEG.map((s, i) => <li key={s} className={i < index ? "erledigt" : i === index ? "aktuell" : ""} aria-current={i === index ? "step" : undefined}>{i < index ? <span className="sr-only">erledigt: </span> : null}{s}</li>)}
          </ol>
          <div className="portal-naechstes">
            <div style={{ minWidth: 0, flex: "1 1 320px" }}>
              <div className="etikett">Als Nächstes</div>
              <div className="was">{naechstes.was}</div>
              {naechstes.unter ? <div className="leise klein" style={{ marginTop: 4 }}>{naechstes.unter}</div> : null}
            </div>
            {naechstes.knopf ?? null}
          </div>
        </section>

        <div className="auf-einen-blick" aria-label="Auf einen Blick">
          <Link className="blick" href={angebot ? (doks.find((d) => d.art === "angebot") ? `/dokument/${doks.find((d) => d.art === "angebot")!.id}` : `/leads/${id}?tab=dokumente`) : `/leads/${id}/angebot`} target={angebot && doks.some((d) => d.art === "angebot") ? "_blank" : undefined}>
            <span className="etikett">Angebot</span>
            <span className="wert">{angebot ? (PAKETE[angebot.paket as PaketKey]?.name ?? angebot.paket) : "noch keins"}</span>
            <span className="unter">{angebot ? `${euro(angebot.einmalig)} + ${euro(angebot.monatlich)}/Monat · ${ANGEBOT_TEXT[angebot.status] ?? angebot.status}` : "Nach dem Gespräch erstellen"}</span>
          </Link>
          <Link className="blick" href={`/leads/${id}?tab=dokumente`}>
            <span className="etikett">Unterlagen</span>
            <span className="wert">{doks.length + demos.length} {doks.length + demos.length === 1 ? "Dokument" : "Dokumente"}</span>
            <span className="unter">{doks[0] ? `zuletzt: ${DOKART[doks[0].art] ?? doks[0].art}` : "noch keine"} · {verschickt} verschickt</span>
          </Link>
          <Link className="blick" href={`/leads/${id}?tab=dokumente`}>
            <span className="etikett">Rechnungen</span>
            <span className="wert">{rechnungen.length ? (offeneRechnungen.length ? `${offeneRechnungen.length} offen` : "alle bezahlt") : "keine"}</span>
            <span className="unter">{rechnungen.length ? `${euro(offeneRechnungen.reduce((s, r) => s + r.netto, 0))} netto offen · ${rechnungen.length} insgesamt` : "Erste Rate nach der Unterschrift"}</span>
          </Link>
          <Link className="blick" href={offenePost[0] ? `/freigaben/${offenePost[0].id}` : `/leads/${id}?tab=dokumente`}>
            <span className="etikett">Freigaben</span>
            <span className="wert">{offenePost.length ? `${offenePost.length} warten` : "nichts offen"}</span>
            <span className="unter">{offenePost[0] ? (ZWECK[offenePost[0].zweck] ?? offenePost[0].zweck) : "Alles an den Kunden ist durch"}</span>
          </Link>
          {projekt ? (
            <Link className="blick" href={`/projekte/${projekt.id}`}>
              <span className="etikett">Projekt</span>
              <span className="wert">{PROJEKT_TEXT[projekt.status] ?? projekt.status}</span>
              <span className="unter">{projekt.liveAm ? `live seit ${datum(projekt.liveAm)}` : projekt.abnahmeStatus ? `Abnahme: ${projekt.abnahmeStatus}` : PAKETE[projekt.paket as PaketKey]?.name ?? projekt.paket}</span>
            </Link>
          ) : null}
          <Link className="blick" href={`/leads/${id}?tab=ueberblick#kontakte`}>
            <span className="etikett">Ansprechpartner</span>
            <span className="wert">{hauptkontakt?.name ?? b.inhaber ?? "noch keiner"}</span>
            <span className="unter">{hauptkontakt?.telefon ?? b.telefon ?? hauptkontakt?.email ?? b.email ?? "Telefon und E-Mail fehlen"}</span>
          </Link>
          {b.portalToken ? (
            <a className="blick" href={`${basisUrl()}/portal/k/${b.portalToken}`} target="_blank" rel="noopener noreferrer">
              <span className="etikett">Kundenportal</span>
              <span className="wert">So sieht es der Kunde</span>
              <span className="unter">öffnet in neuem Fenster</span>
            </a>
          ) : null}
        </div>
      </div>

      <nav className="reiter" aria-label="Bereiche des Betriebs">
        {REITER.map(([k, n]) => <Link key={k} href={`/leads/${id}?tab=${k}`} aria-current={tab === k ? "page" : undefined}>{n}{k === "aktivitaeten" && offeneAufgaben.length ? ` · ${offeneAufgaben.length} offen` : ""}</Link>)}
      </nav>

      {tab === "ueberblick" ? (
        <>
          <div className="raster zwei" style={{ alignItems: "start" }}>
            <div className="raster">
              {offenePost.length > 1 ? (
                <section className="karte">
                  <h2>Wartet auf Freigabe</h2>
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
              <section className="karte">
                <h2>Offene Aufgaben</h2>
                {offeneAufgaben.length ? <AufgabenListe eintraege={offeneAufgaben.map((a) => ({ a, betrieb: null }))} zurueck={`/leads/${id}`} mitBetrieb={false} /> : <p className="leise klein">Keine. Neue Aufgabe unter „Aktivitäten“.</p>}
              </section>
              {!gesperrt && ["interessant", "angeschrieben", "termin"].includes(b.status) ? (
                <details className="karte" open={b.status === "termin"}>
                  <summary style={{ cursor: "pointer", fontWeight: 600 }}>Gespräch vor Ort aufnehmen</summary>
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
              {termine.length ? (
                <section className="karte">
                  <h2>Gespräche</h2>
                  <ul className="liste">
                    {termine.map((t) => (
                      <li key={t.id}><div><div className="titel">Termin {datumZeit(t.datum)}</div><div className="unter">Einwilligung von {t.einwilligungVon} · {t.audioGeloeschtAm ? `Aufnahme gelöscht am ${datum(t.audioGeloeschtAm)}` : "Aufnahme gespeichert"}</div></div><Status wert={t.status} /></li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </div>

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
          </div>
        </>
      ) : null}

      {tab === "aktivitaeten" ? (
        <section className="karte">
          <h2>Aktivitäten</h2>
          <form action={aktivitaetAnlegen} className="raster zwei" style={{ marginBottom: 12 }}>
            <input type="hidden" name="betriebId" value={id} />
            <input type="hidden" name="zurueck" value={`/leads/${id}?tab=aktivitaeten`} />
            <label className="feld"><span>Art</span><select name="art" defaultValue="anruf">{Object.entries(ARTEN).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
            <label className="feld"><span>Kurz</span><input name="titel" placeholder="z. B. Rückruf wegen Fotos" /></label>
            <label className="feld" style={{ gridColumn: "1 / -1" }}><span>Notiz</span><textarea name="text" rows={2} placeholder="Was wurde besprochen? Bei Aufgabe oder Termin: Datum unten." /></label>
            <label className="feld"><span>Datum (Aufgabe, Termin)</span><input type="date" name="faellig" defaultValue={morgen} /></label>
            <label className="feld"><span>Für</span><select name="zustaendig" defaultValue={b.zustaendig ?? ""}><option value="">mich</option>{benutzer.map((x) => <option key={x.name}>{x.name}</option>)}</select></label>
            <div><button className="knopf">Speichern</button></div>
          </form>
          {offeneAufgaben.length ? <><h3>Offen</h3><AufgabenListe eintraege={offeneAufgaben.map((a) => ({ a, betrieb: null }))} zurueck={`/leads/${id}`} mitBetrieb={false} /></> : <p className="leise klein">Kein nächster Schritt geplant.</p>}
          {nachrichten.length ? (
            <>
              <h3>Nachrichten</h3>
              <ul className="liste">
                {nachrichten.map((n) => (
                  <li key={n.id} style={{ flexWrap: "wrap" }}>
                    <div style={{ flex: "1 1 280px" }}>
                      <div className="titel">{n.richtung === "ein" ? "←" : "→"} {KANAELE[n.kanal]}{n.betreff ? `: ${n.betreff}` : ""}</div>
                      <div className="unter">{datumZeit(n.zeit)} · {n.richtung === "ein" ? n.absender : `an ${n.empfaenger}`}{n.dauerSek ? ` · ${Math.round(n.dauerSek / 60)} Min.` : ""}</div>
                      <div className="klein" style={{ whiteSpace: "pre-wrap", marginTop: 4 }}>{n.inhalt.length > 400 ? `${n.inhalt.slice(0, 400)} …` : n.inhalt}</div>
                    </div>
                    {n.richtung === "ein" && n.status === "neu" ? (
                      <div className="knopfreihe">
                        {n.kanal === "mail" || n.kanal === "whatsapp" ? <form action={antwortEntwerfen}><input type="hidden" name="id" value={n.id} /><input type="hidden" name="zurueck" value={`/leads/${id}?tab=aktivitaeten`} /><button className="knopf klein">Antwort entwerfen</button></form> : null}
                        <form action={nachrichtErledigt}><input type="hidden" name="id" value={n.id} /><input type="hidden" name="zurueck" value={`/leads/${id}?tab=aktivitaeten`} /><button className="knopf klein">Erledigt</button></form>
                      </div>
                    ) : <Status wert={n.richtung === "aus" ? "versendet" : n.status} />}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {chronik.length ? (
            <>
              <h3>Chronik</h3>
              <ul className="liste">
                {chronik.slice(0, 25).map((a) => <li key={a.id}><div><div className="titel">{ARTEN[a.art]}: {a.titel}</div><div className="unter">{datumZeit(a.erledigtAm ?? a.erstelltAm)} · {a.erstelltVon}{a.text ? ` · ${a.text}` : ""}</div></div></li>)}
              </ul>
            </>
          ) : null}
        </section>
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
