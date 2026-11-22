import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { Status } from "@/components/Status";
import { datum } from "@/lib/format";
import { basisUrl } from "@/lib/ablauf/gemeinsam";
import { PAKETE, PaketKey } from "@/lib/pakete";
import { abnahmeErneut, kuendigungErfassen, neuBauen, providerwechselErledigt, umzugPruefen } from "../../aktionen";
import { umzugVon } from "@/lib/ablauf/umzug";
import { checkliste, PHASEN } from "@/lib/ablauf/checkliste";
import { BAUSTEINE, stunden, TAETIGKEITEN, ZIEL_STUNDEN, zeitenVonProjekt } from "@/lib/ablauf/zeiten";
import { checklistePunkt, zeitErfassen, zeitLoeschen } from "../../aktionen";
import { bfsgHinweis } from "@/lib/ablauf/lieferung";
import { bereitgestellt, lieferfristBis, mitwirkungsliste } from "@/lib/ablauf/lieferfrist";

const SCHRITTE = [
  { key: "inhalte", text: "Inhalte vom Kunden" },
  { key: "bau", text: "Bau" },
  { key: "pruefung", text: "Prüfung" },
  { key: "bereit", text: "Vorschau beim Kunden" },
  { key: "abnahme", text: "Abnahme" },
  { key: "live", text: "Live" },
];

const ABNAHME: Record<string, string> = { offen: "wartet auf Abnahme", abgenommen: "abgenommen", vorbehalt: "abgenommen mit Mängeln", verweigert: "Abnahme verweigert", fiktion: "abgenommen (Frist abgelaufen)" };

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const db = await getDb();
  const [x] = await db.select({ name: schema.betriebe.name }).from(schema.projekte).innerJoin(schema.betriebe, eq(schema.betriebe.id, schema.projekte.betriebId)).where(eq(schema.projekte.id, Number((await params).id) || 0));
  return { title: x ? `Projekt ${x.name}` : "Projekt" };
}

export default async function Projekt({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const db = await getDb();
  const [p] = await db.select().from(schema.projekte).where(eq(schema.projekte.id, id));
  if (!p) notFound();
  const [b] = await db.select().from(schema.betriebe).where(eq(schema.betriebe.id, p.betriebId));
  const [seite] = p.seitenSlug ? await db.select().from(schema.seiten).where(eq(schema.seiten.slug, p.seitenSlug)) : [];
  const projektPost = await db.select().from(schema.postausgang).where(eq(schema.postausgang.projektId, id));
  const livegang = projektPost.find((e) => e.zweck === "livegang" && e.status === "zur_freigabe");
  const bitteUmAbnahme = projektPost.find((e) => e.zweck === "abnahme_aufforderung" && e.status === "zur_freigabe");
  const offenePost = projektPost.filter((e) => e.status === "zur_freigabe");
  const abgenommen = ["abgenommen", "vorbehalt", "fiktion"].includes(p.abnahmeStatus ?? "");
  // Reihenfolge: Bau → Prüfung → Vorschau → Abnahme → Livegang (nur Maximilian mit Code)
  const index = p.status === "live" || p.status === "beendet" ? SCHRITTE.length : abgenommen ? 5 : SCHRITTE.findIndex((s) => s.key === p.status);
  const bfsg = bfsgHinweis(p.onboarding);
  const frist = lieferfristBis(p);
  const fristTage = frist ? Math.ceil((frist.getTime() - Date.now()) / 864e5) : null;
  const mitwirkung = mitwirkungsliste(p);
  const umzug = umzugVon(p);
  const [punkte, zeit] = await Promise.all([checkliste(id), zeitenVonProjekt(id)]);
  const ziel = (ZIEL_STUNDEN[p.paket] ?? 12) * 60;
  const erledigtePunkte = punkte.filter((x) => x.erledigtAm).length;
  const UMZUG: Record<string, string> = { geprueft: "geprüft, Umstellung beim Livegang", providerwechsel: "Providerwechsel durch Levarex offen", wartet_dns: "wartet auf Umstellung beim Kunden", umgestellt: "umgestellt" };
  const portal = `${basisUrl()}/portal/${p.portalToken}`;

  const prozent = Math.round((Math.min(index, SCHRITTE.length) / SCHRITTE.length) * 100);
  // Genau ein nächster Schritt mit genau einem Messing-Knopf
  const naechstes: { was: string; unter?: string; knopf?: React.ReactNode } =
    p.status === "inhalte"
      ? { was: "Wir warten auf Texte und Fotos vom Kunden", unter: `Mitwirkungsliste: ${mitwirkung.filter((m) => m.erledigt).length} von ${mitwirkung.length} da. Der Kunde reicht alles im Kundenportal ein.` }
      : p.status === "bau"
        ? { was: "Die Seite wird gebaut und geprüft", unter: "In einer Minute neu laden." }
        : p.status === "pruefung"
          ? { was: "Prüfung nicht bestanden: beheben und neu bauen", unter: `${(p.pruefung ?? []).filter((x) => !x.ok).length} Punkte offen, siehe Qualitätsprüfung.`, knopf: <form action={neuBauen}><input type="hidden" name="id" value={id} /><button className="knopf haupt">Neu bauen und prüfen</button></form> }
          : livegang
            ? { was: "Abgenommen: Livegang freigeben", unter: "Nur Maximilian, mit Code aus der Authenticator-App. Danach Domain, Schlussrechnung und Lastschrift.", knopf: <Link className="knopf haupt" href={`/freigaben/${livegang.id}`}>Livegang prüfen</Link> }
            : bitteUmAbnahme
              ? { was: "Bitte um Abnahme freigeben", unter: "Mit dem Versand beginnt die Frist von 14 Kalendertagen.", knopf: <Link className="knopf haupt" href={`/freigaben/${bitteUmAbnahme.id}`}>Prüfen und freigeben</Link> }
              : p.status === "bereit" && p.abnahmeStatus === "verweigert"
                ? { was: "Abnahme verweigert: Mängel beheben", unter: p.abnahmeMaengel ?? "", knopf: <form action={abnahmeErneut}><input type="hidden" name="id" value={id} /><button className="knopf haupt">Erneut zur Abnahme vorlegen</button></form> }
                : p.status === "bereit"
                  ? { was: "Der Kunde prüft die Vorschau", unter: p.abnahmeFrist ? `Frist bis ${datum(p.abnahmeFrist)}; danach gilt die Seite als abgenommen.` : "" }
                  : p.status === "live"
                    ? { was: "Live, Betreuung läuft", unter: `Seit ${datum(p.liveAm)}. Die Seite wird alle 10 Minuten geprüft.` }
                    : { was: `Vertrag beendet am ${datum(p.endeAm)}` };

  return (
    <>
      <Link href="/projekte" className="zurueck">← Kunden</Link>
      <div className="akte">
        <div className="akte-kopf">
          <div>
            <h1>{b.name}</h1>
            <div className="unter">{PAKETE[p.paket as PaketKey].name}{p.domain ? ` · ${p.domain}` : ""}</div>
          </div>
          <div className="knopfreihe">
            <Status wert={p.status} />
            <Link className="knopf klein" href={`/leads/${b.id}`}>Zum Betrieb</Link>
          </div>
        </div>
        <section className="akte-held" aria-label="Stand">
          <div className="portal-held" style={{ padding: 0, border: 0, background: "transparent" }}>
            <div className="stand">
              <div className="stand-zeile"><span>Lieferung</span><b>{index >= SCHRITTE.length ? "fertig" : `${index + 1} von ${SCHRITTE.length} · ${SCHRITTE[index]?.text}`}</b></div>
              <div className="portal-balken" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={prozent} aria-label="Fortschritt"><span style={{ width: `${prozent}%` }} /></div>
            </div>
          </div>
          <ol className="schritte weg" aria-label="Lieferschritte">
            {SCHRITTE.map((s, i) => <li key={s.key} className={i < index ? "erledigt" : i === index ? "aktuell" : ""} aria-current={i === index ? "step" : undefined}>{s.text}</li>)}
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
          <div className="blick">
            <span className="etikett">Lieferfrist</span>
            <span className="wert">{frist ? (bereitgestellt(p) ? "eingehalten" : datum(frist)) : "startet mit den Inhalten"}</span>
            <span className="unter">{frist && !bereitgestellt(p) && fristTage !== null ? (fristTage < 0 ? `${-fristTage} Tage überschritten` : `noch ${fristTage} Tage`) : `${PAKETE[p.paket as PaketKey]?.wochen ?? 6} Wochen nach Eingang der Inhalte`}</span>
          </div>
          <div className="blick">
            <span className="etikett">Abnahme</span>
            <span className="wert">{p.abnahmeStatus ? ABNAHME[p.abnahmeStatus] : "noch nicht"}</span>
            <span className="unter">{p.abnahmeAm ? `am ${datum(p.abnahmeAm)}` : p.abnahmeFrist ? `Frist bis ${datum(p.abnahmeFrist)}` : "nach der Vorschau"}</span>
          </div>
          <div className="blick">
            <span className="etikett">Stunden</span>
            <span className="wert">{stunden(zeit.lieferungMinuten)} von {stunden(ziel)}</span>
            <span className="unter">Lieferung ohne Betreuung</span>
          </div>
          <Link className="blick" href={`/freigaben`}>
            <span className="etikett">Freigaben</span>
            <span className="wert">{offenePost.length ? `${offenePost.length} warten` : "nichts offen"}</span>
            <span className="unter">für dieses Projekt</span>
          </Link>
          {seite ? (
            <a className="blick" target="_blank" rel="noopener noreferrer" href={p.status === "live" && p.domain ? `https://${p.domain}` : `/vorschau/${seite.slug}${seite.zugangscode ? `?code=${seite.zugangscode}` : ""}`}>
              <span className="etikett">Website</span>
              <span className="wert">{p.status === "live" ? "live ansehen" : "Vorschau ansehen"}</span>
              <span className="unter">{p.domain ?? "noch ohne Domain"}</span>
            </a>
          ) : null}
          <a className="blick" target="_blank" rel="noopener noreferrer" href={portal}>
            <span className="etikett">Kundenportal</span>
            <span className="wert">So sieht es der Kunde</span>
            <span className="unter">öffnet in neuem Fenster</span>
          </a>
        </div>
      </div>

      <div className="raster zwei" style={{ alignItems: "start" }}>
        <section className="karte">
          <h2>Stand im Detail</h2>
          {p.status === "inhalte" ? <><p>Wir warten auf Texte und Fotos. Der Kunde hat den Link mit der Start-Mail bekommen.</p><p className="leise klein mono" style={{ wordBreak: "break-all" }}>{portal}</p></> : null}
          {p.status === "bau" ? <p>Die Seite wird gerade gebaut und geprüft. In einer Minute neu laden.</p> : null}
          {p.status === "pruefung" ? <><div className="hinweis fehler">Die Prüfung ist nicht bestanden. Der Livegang ist gesperrt, bis alles grün ist.</div></> : null}
          {p.status === "bereit" && !abgenommen ? <p>Alle Prüfungen bestanden. Die Vorschau liegt beim Kunden zur Abnahme{p.abnahmeFrist ? ` (Frist bis ${datum(p.abnahmeFrist)})` : ", die Bitte um Abnahme wartet auf Freigabe"}.</p> : null}
          {p.status === "bereit" && livegang ? <><p>Abgenommen. Bitte die Vorschau noch einmal ansehen und den Livegang freigeben (nur Maximilian, mit Code aus der Authenticator-App).</p><Link className="knopf" href={`/freigaben/${livegang.id}`}>Zur Freigabe</Link></> : null}
          {frist && !bereitgestellt(p) ? <p className={fristTage !== null && fristTage <= 5 ? "hinweis" : "leise"}>Lieferfrist: Vorschau spätestens am {datum(frist)}{fristTage !== null ? (fristTage < 0 ? `, ${-fristTage} Tage überschritten` : `, noch ${fristTage} Tage`) : ""}.</p> : null}
          {p.status === "live" ? <p>Live seit {datum(p.liveAm)}. Betreuung läuft seit {datum(p.aboAb)}. Die Seite wird alle 10 Minuten geprüft.</p> : null}
          {p.abnahmeStatus ? (
            <div style={{ marginTop: 12 }}>
              <p><b>Abnahme:</b> <Status wert={p.abnahmeStatus === "offen" ? "wartet" : p.abnahmeStatus} /> {ABNAHME[p.abnahmeStatus]}{p.abnahmeFrist && p.abnahmeStatus === "offen" ? `, Frist bis ${datum(p.abnahmeFrist)}` : p.abnahmeStatus === "offen" ? ", Aufforderung wartet auf Freigabe" : ""}{p.abnahmeAm ? ` am ${datum(p.abnahmeAm)}` : ""}{p.abnahmeName ? ` von ${p.abnahmeName}` : ""}</p>
              {p.abnahmeMaengel ? <div className="hinweis">Mängel: {p.abnahmeMaengel}</div> : null}
              
            </div>
          ) : null}
          {p.gekuendigtAm ? <p className="hinweis" style={{ marginTop: 12 }}>Gekündigt am {datum(p.gekuendigtAm)}, Ende {datum(p.endeAm)}.</p> : null}
          {p.status === "beendet" ? <p>Vertrag beendet am {datum(p.endeAm)}.</p> : null}
          {["inhalte", "bau", "pruefung"].includes(p.status) ? (
            <details style={{ marginTop: 12 }} open={p.status === "inhalte"}>
              <summary style={{ cursor: "pointer" }}>Mitwirkungsliste ({mitwirkung.filter((m) => m.erledigt).length} von {mitwirkung.length} da)</summary>
              <ul className="liste-schlicht" style={{ marginTop: 8 }}>
                {mitwirkung.map((m) => <li key={m.titel}><span className={`status ${m.erledigt ? "ok" : "warten"}`}>{m.erledigt ? "da" : "fehlt"}</span> {m.titel}{m.hinweis ? <span className="leise klein"> · {m.hinweis}</span> : null}</li>)}
              </ul>
            </details>
          ) : null}
          {seite ? <p style={{ marginTop: 16 }}><a className="knopf klein" target="_blank" href={`/vorschau/${seite.slug}${seite.zugangscode ? `?code=${seite.zugangscode}` : ""}`}>Seite ansehen</a></p> : null}
        </section>

        <section className="karte">
          {bfsg ? <div className="hinweis" style={{ marginBottom: 16 }}>{bfsg}</div> : null}
          {Object.keys(p.onboarding).length ? <p className="leise klein">Onboarding: {p.onboarding.mitarbeiter} Mitarbeitende · Umsatz {p.onboarding.umsatz === "ueber2" ? "über" : "bis"} 2 Mio. € · Verbraucherfunktion: {p.onboarding.verbraucher === "nein" ? "keine" : p.onboarding.verbraucher === "termin" ? "Terminbuchung" : "Bestellung/Vertrag"}</p> : null}
          <h2>Qualitätsprüfung</h2>
          {p.pruefung?.length ? (
            <ul className="liste">
              {p.pruefung.map((x) => (
                <li key={x.name}><div><div className="titel">{x.name}</div><div className="unter">{x.detail}</div></div><Status wert={x.ok ? "bestanden" : "fehler"} /></li>
              ))}
            </ul>
          ) : <p className="leise">Läuft nach dem ersten Bau.</p>}
        </section>
      </div>


      <div className="raster zwei abstand" style={{ alignItems: "start" }}>
        <section className="karte">
          <div className="kopfzeile" style={{ marginBottom: 4 }}><h2 style={{ margin: 0 }}>Lieferschritte</h2><span className="mono klein">{erledigtePunkte} / {punkte.length}</span></div>
          <div className="balken" role="progressbar" aria-valuenow={erledigtePunkte} aria-valuemax={punkte.length}><span style={{ width: `${(erledigtePunkte / Math.max(1, punkte.length)) * 100}%` }} /></div>
          {PHASEN.map((ph) => {
            const teil = punkte.filter((x) => x.phase === ph);
            return teil.length ? (
              <div key={ph}>
                <h3>{ph}</h3>
                <ul className="liste">
                  {teil.map((x) => (
                    <li key={x.id}>
                      <form action={checklistePunkt} style={{ display: "contents" }}>
                        <input type="hidden" name="projektId" value={id} />
                        <input type="hidden" name="id" value={x.id} />
                        <button className="haken-knopf" style={x.erledigtAm ? { background: "var(--ok)", borderColor: "var(--ok)", color: "var(--grund)" } : undefined} aria-label={`${x.titel}: ${x.erledigtAm ? "erledigt, zurücknehmen" : "abhaken"}`}>✓</button>
                      </form>
                      <div style={{ flex: 1 }}><div className="titel" style={x.erledigtAm ? { color: "var(--leise)" } : undefined}>{x.titel}</div><div className="unter">{x.erledigtAm ? `erledigt ${datum(x.erledigtAm)} · ${x.erledigtVon}` : x.schluessel ? "hakt Levarex OS selbst ab" : "offen"}</div></div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null;
          })}
          <form action={checklistePunkt} className="knopfreihe" style={{ marginTop: 12 }}>
            <input type="hidden" name="projektId" value={id} />
            <select name="phase" defaultValue="Bau" aria-label="Phase" style={{ width: "auto" }}>{PHASEN.map((ph) => <option key={ph}>{ph}</option>)}</select>
            <input name="titel" placeholder="Eigener Schritt" aria-label="Eigener Schritt" required style={{ maxWidth: 260 }} />
            <button className="knopf klein">Hinzufügen</button>
          </form>
        </section>
        <section className="karte">
          <h2>Zeiterfassung</h2>
          <p>Lieferung: <b className="mono">{stunden(zeit.lieferungMinuten)}</b> von Ziel <span className="mono">{stunden(ziel)}</span>{zeit.gesamtMinuten > zeit.lieferungMinuten ? <span className="leise"> · Betreuung {stunden(zeit.gesamtMinuten - zeit.lieferungMinuten)}</span> : null}</p>
          <div className="balken" role="progressbar" aria-valuenow={zeit.lieferungMinuten} aria-valuemax={ziel}><span style={{ width: `${Math.min(100, (zeit.lieferungMinuten / ziel) * 100)}%`, background: zeit.lieferungMinuten > ziel ? "var(--fehler)" : undefined }} /></div>
          <p className="leise klein" style={{ marginTop: 6 }}>Ziel aus dem Business Case (Paket {PAKETE[p.paket as PaketKey].name}). Daraus entsteht die Kennzahl „Stunden je Projekt“.</p>
          <form action={zeitErfassen} className="raster zwei" style={{ marginTop: 12 }}>
            <input type="hidden" name="projektId" value={id} />
            <input type="hidden" name="zurueck" value={`/projekte/${id}`} />
            <label className="feld"><span>Dauer</span><select name="minuten" defaultValue="60">{[15, 30, 45, 60, 90, 120, 180, 240, 300, 360, 480].map((m) => <option key={m} value={m}>{stunden(m)}</option>)}</select></label>
            <label className="feld"><span>Tätigkeit</span><select name="taetigkeit" defaultValue="bau">{Object.entries(TAETIGKEITEN).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
            <label className="feld"><span>Baustein</span><select name="baustein" defaultValue="webauftritt">{Object.entries(BAUSTEINE).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
            <label className="feld"><span>Datum</span><input type="date" name="datum" defaultValue={new Date().toISOString().slice(0, 10)} /></label>
            <label className="feld"><span>Notiz</span><input name="notiz" /></label>
            <div><button className="knopf">Zeit erfassen</button></div>
          </form>
          {zeit.liste.length ? (
            <ul className="liste" style={{ marginTop: 12 }}>
              {zeit.liste.slice(0, 20).map((z) => (
                <li key={z.id}>
                  <div style={{ flex: 1 }}><div className="titel">{stunden(z.minuten)} · {TAETIGKEITEN[z.taetigkeit] ?? z.taetigkeit}</div><div className="unter">{datum(z.datum)} · {z.wer}{z.notiz ? ` · ${z.notiz}` : ""}</div></div>
                  <form action={zeitLoeschen}><input type="hidden" name="id" value={z.id} /><input type="hidden" name="zurueck" value={`/projekte/${id}`} /><button className="knopf klein">Löschen</button></form>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      </div>

      {umzug ? (
        <section className="karte abstand">
          <div className="kopfzeile" style={{ marginBottom: 8 }}>
            <div><h2 style={{ margin: 0 }}>Domain-Umzug: <span className="mono">{umzug.domain}</span></h2>
              <p className="leise klein">{umzug.weg === "uebernehmen" ? "Weg B: Levarex übernimmt die Domain-Verwaltung (AuthInfo)" : "Weg A: Kunde ändert A-Einträge, Domain und E-Mail bleiben beim Anbieter"} · Auftrag vom {datum(umzug.vollmachtAm ? new Date(umzug.vollmachtAm) : null)}{umzug.rechteBestaetigt ? " · Rechte an Inhalten bestätigt" : ""}</p></div>
            <Status wert={umzug.status === "umgestellt" ? "fertig" : umzug.status ? "wartet" : "laeuft"} />
          </div>
          <p><b>Stand:</b> {umzug.status ? UMZUG[umzug.status] : "Bestandsaufnahme läuft"}{umzug.stand ? ` · Domain bei ${umzug.stand.dnsAnbieter ?? umzug.anbieterAngabe ?? "unbekannt"} · E-Mail bei ${umzug.stand.mailAnbieter ?? "keinem erkannten Dienst"}` : ""}{umzug.stand?.simuliert ? " · Simulator" : ""}</p>
          {umzug.letztePruefung ? <p className="leise klein">Letzte Prüfung {datum(new Date(umzug.letztePruefung.am))}: {umzug.letztePruefung.detail}</p> : null}
          {umzug.warnungen?.length ? <ul>{umzug.warnungen.map((w) => <li key={w}>{w}</li>)}</ul> : null}
          {umzug.stand ? (
            <details style={{ marginTop: 8 }}>
              <summary style={{ cursor: "pointer" }}>{umzug.stand.eintraege.length} DNS-Einträge (Bestandsaufnahme) · Nameserver {umzug.stand.nameserver.join(", ") || "–"}</summary>
              <table className="tabelle klein"><thead><tr><th>Typ</th><th>Name</th><th>Wert</th></tr></thead>
                <tbody>{umzug.stand.eintraege.map((e, i) => <tr key={i}><td className="mono">{e.typ}</td><td className="mono">{e.name}</td><td className="mono" style={{ wordBreak: "break-all" }}>{e.wert}</td></tr>)}</tbody></table>
            </details>
          ) : null}
          {umzug.alteSeiten?.length ? (
            <details style={{ marginTop: 8 }}>
              <summary style={{ cursor: "pointer" }}>{umzug.alteSeiten.length} alte Adressen mit Weiterleitung · {umzug.gesichert === 1 ? "1 Seite" : `${umzug.gesichert ?? 0} Seiten`} der alten Website gesichert</summary>
              <ul className="klein mono">{umzug.alteSeiten.map((a) => <li key={a.pfad}>{a.pfad} → /{a.ziel}</li>)}</ul>
            </details>
          ) : null}
          <div className="knopfreihe" style={{ marginTop: 12 }}>
            <form action={umzugPruefen}><input type="hidden" name="id" value={id} /><button className="knopf klein">Jetzt neu prüfen</button></form>
            {umzug.status === "providerwechsel" ? <form action={providerwechselErledigt}><input type="hidden" name="id" value={id} /><button className="knopf klein">Providerwechsel erledigt</button></form> : null}
          </div>
        </section>
      ) : null}

      {p.status === "live" && !p.gekuendigtAm ? (
        <details className="karte abstand">
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>Kündigung der Betreuung erfassen</summary>
          <form action={kuendigungErfassen} style={{ marginTop: 12 }}>
            <input type="hidden" name="id" value={id} />
            <p className="leise">Levarex OS berechnet das Ende (24 Monate ab Livegang, danach je 12 Monate; Kündigung bis 3 Monate vor Ende), legt die Bestätigung in den Postausgang und beendet die Qonto-Lastschrift nach Freigabe.</p>
            <label className="feld"><span>Kündigung eingegangen am</span><input type="date" name="eingang" required defaultValue={new Date().toISOString().slice(0, 10)} style={{ maxWidth: 220 }} /></label>
            <button className="knopf">Kündigung erfassen</button>
          </form>
        </details>
      ) : null}
    </>
  );
}
