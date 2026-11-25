import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { brauchtBenutzer } from "@/lib/auth";
import { Status } from "@/components/Status";
import { NeuLaden } from "@/components/NeuLaden";
import { datumZeit, DOKART, KANAL, ZWECK } from "@/lib/format";
import { ablehnen, angebotAendern, anhangEntfernen, eintragSpeichern, freigeben, protokollAusfuellen, versandWiederholen } from "../../aktionen";
import { AngebotEditor } from "@/components/AngebotEditor";
import type { AngebotDaten } from "@/lib/docs/vorlagen";
import { mailSignatur } from "@/lib/recht";
import { mailHtml } from "@/lib/docs/mailvorlage";

export const metadata = { title: "Freigabe prüfen" };

export default async function Eintrag({ params }: { params: Promise<{ id: string }> }) {
  const ich = await brauchtBenutzer();
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const db = await getDb();
  const [e] = await db.select().from(schema.postausgang).where(eq(schema.postausgang.id, id));
  if (!e) notFound();
  const [betrieb] = e.betriebId ? await db.select().from(schema.betriebe).where(eq(schema.betriebe.id, e.betriebId)) : [];
  // In der Reihenfolge der Anhänge; das Hauptdokument (z. B. Auftragsbestätigung) steht vorn
  const HAUPT = ["auftragsbestaetigung", "rechnung", "angebot", "abnahmeprotokoll", "monatsreport", "brief"];
  const doks = (e.anhaenge.length ? await db.select().from(schema.dokumente).where(inArray(schema.dokumente.id, e.anhaenge)) : [])
    .sort((x, y) => e.anhaenge.indexOf(x.id) - e.anhaenge.indexOf(y.id))
    .sort((x, y) => Number(HAUPT.includes(y.art)) - Number(HAUPT.includes(x.art)));
  const offen = e.status === "zur_freigabe";
  // Von wessen Postfach die Mail rausgehen wird (wer unterschreibt, sonst wer zuerst freigibt)
  const absender = e.kanal === "mail" ? await (await import("@/lib/postfach")).absenderFuer({ text: e.text, freigaben: e.freigaben.length ? e.freigaben : [{ name: ich.name }] }) : null;
  const angebotDok = e.zweck === "angebot" ? doks.find((d) => d.art === "angebot" && !d.archivPfad) : undefined;
  const schonFreigegeben = e.freigaben.some((f) => f.name === ich.name);
  const slug = typeof e.meta.slug === "string" ? e.meta.slug : null;
  const [seite] = slug ? await db.select().from(schema.seiten).where(eq(schema.seiten.slug, slug)) : [];
  // Beim Angebot zeigt der Editor oben schon die Live-Vorschau; unten dann keine zweite (sonst steht das PDF doppelt da)
  const editorZeigtAngebot = offen && !!angebotDok;
  const vorschauDok = editorZeigtAngebot ? doks.find((d) => d.id !== angebotDok!.id) : doks[0];
  const vorschauUrl = e.kanal === "livegang" && slug ? `/vorschau/${slug}${seite?.zugangscode ? `?code=${seite.zugangscode}` : ""}` : !editorZeigtAngebot && vorschauDok ? `/dokument/${vorschauDok.id}/ansicht` : null;

  const hatDokument = (offen && !!angebotDok) || !!vorschauUrl;
  const nachricht = e.kanal === "mail" || e.kanal === "whatsapp";
  const n = { dok: 1, msg: hatDokument ? 2 : 1, ok: (hatDokument ? 1 : 0) + (nachricht ? 1 : 0) + 1 };
  const qk = (
    <div className={`hinweis ${e.qkStatus === "bestanden" ? "ok" : e.qkStatus === "blockiert" ? "fehler" : ""}`} role="note" style={{ marginBottom: 12 }}>
      <b>Qualitätskontrolle: </b><Status wert={e.qkStatus} />
      {e.qkStatus === "ausstehend" ? <><span className="leise"> Läuft gerade, die Seite aktualisiert sich selbst.</span><NeuLaden /></> : null}
      {e.qkStatus === "bestanden" ? <span className="leise"> Keine Auffälligkeiten.</span> : null}
      {e.hinweise.length ? <ul>{e.hinweise.map((h) => <li key={h}>{h}</li>)}</ul> : null}
    </div>
  );

  return (
    <>
      <Link href="/freigaben" className="zurueck">← Freigaben</Link>
      <div className="kopfzeile">
        <div>
          <h1>{ZWECK[e.zweck] ?? e.zweck}{betrieb ? ` · ${betrieb.name}` : ""}</h1>
          <p>{KANAL[e.kanal]} an {e.empfaenger}{betrieb ? <> · <Link href={`/leads/${betrieb.id}`}>zur Kundenakte</Link></> : null}</p>
        </div>
        <div className="knopfreihe"><Status wert={e.qkStatus} />{e.status === "freigegeben" && e.fehler ? <span className="status fehler">Versand fehlgeschlagen</span> : <Status wert={e.status} />}</div>
      </div>
      {offen ? <nav className="schrittleiste" aria-label="Ablauf">{hatDokument ? <a href="#schritt-dokument"><span className="nr">{n.dok}</span> {angebotDok ? "Angebot" : "Dokument"}</a> : null}{nachricht ? <a href="#schritt-nachricht"><span className="nr">{n.msg}</span> {e.kanal === "mail" ? "E-Mail" : "WhatsApp"}</a> : null}<a href="#schritt-freigeben"><span className="nr">{n.ok}</span> Prüfen und freigeben</a></nav> : null}
      {e.status === "abgelehnt" ? <div className="hinweis fehler">Abgelehnt: {e.ablehnGrund}</div> : null}
      {e.fehler ? (
        <div className="hinweis fehler" role="alert">
          <p style={{ margin: "0 0 8px" }}><strong>Nicht versendet.</strong> Der Mailserver meldet: {e.fehler}</p>
          <p className="klein" style={{ margin: "0 0 8px" }}>Meist stimmen die Zugangsdaten des Postfachs nicht (Einstellungen → Mein Postfach oder SMTP in Coolify). Danach erneut senden; Inhalt und Freigabe bleiben gleich.</p>
          {e.status === "freigegeben" ? <form action={versandWiederholen}><input type="hidden" name="id" value={e.id} /><button className="knopf klein">Erneut senden</button></form> : null}
        </div>
      ) : null}

      {hatDokument ? (
        <section className="schritt" id="schritt-dokument">
          <h2 className="schritt-titel"><span className="nr">{n.dok}</span> {angebotDok ? "Das Angebot" : e.kanal === "livegang" ? "Die Website" : "Das Dokument"}</h2>
          {offen && angebotDok ? (
            <AngebotEditor
              dokumentId={angebotDok.id}
              eintragId={e.id}
              start={{ positionen: (angebotDok.daten as AngebotDaten).positionen?.length ? (angebotDok.daten as AngebotDaten).positionen! : [{ text: "Paket", einmalig: (angebotDok.daten as AngebotDaten).einmalig, monatlich: (angebotDok.daten as AngebotDaten).monatlich }], einleitung: (angebotDok.daten as AngebotDaten).einleitung, anmerkungen: (angebotDok.daten as AngebotDaten).anmerkungen ?? "" }}
              speichern={angebotAendern}
            />
          ) : vorschauUrl ? <iframe className="vorschau" src={vorschauUrl} title="Vorschau" /> : null}
          {doks.length ? (
            <div className="knopfreihe" style={{ marginTop: 12 }}>
              {doks.map((d) => <a key={d.id} className="knopf klein umbruch" href={`/dokument/${d.id}`} target="_blank" title={DOKART[d.art] ?? d.art}>{d.titel}</a>)}
            </div>
          ) : null}
          {offen ? doks.filter((d) => d.art === "protokoll" && (d.daten as { unvollstaendig?: boolean }).unvollstaendig).map((d) => (
            <div key={d.id} className="hinweis" style={{ marginTop: 12 }}>
              <b>Protokoll unvollständig:</b> Ziele und Probleme fehlen, weil keine KI-Auswertung lief. Bitte ausfüllen oder das Protokoll weglassen.
              <form action={protokollAusfuellen} style={{ display: "grid", gap: 8, marginTop: 8 }}>
                <input type="hidden" name="eintragId" value={e.id} /><input type="hidden" name="dokumentId" value={d.id} />
                <label className="feld"><span>Ziele des Betriebs (eine Zeile je Ziel)</span><textarea name="ziele" rows={3} required /></label>
                <label className="feld"><span>Was heute bremst (eine Zeile je Punkt)</span><textarea name="probleme" rows={3} required /></label>
                <div className="knopfreihe"><button className="knopf klein">Protokoll speichern</button></div>
              </form>
              <form action={anhangEntfernen} style={{ marginTop: 8 }}><input type="hidden" name="eintragId" value={e.id} /><input type="hidden" name="dokumentId" value={d.id} /><button className="knopf klein">Ohne Protokoll senden</button></form>
            </div>
          )) : null}
        </section>
      ) : null}

      {nachricht ? (
        <section className="schritt" id="schritt-nachricht">
          <h2 className="schritt-titel"><span className="nr">{n.msg}</span> {e.kanal === "mail" ? "Die E-Mail an den Kunden" : "Die WhatsApp an den Kunden"}</h2>
          <div className="raster zwei" style={{ alignItems: "start" }}>
            {e.kanal === "mail" ? (
              <div className="karte">
                <h3 style={{ marginTop: 0 }}>So kommt sie an</h3>
                <p className="klein"><b>Von:</b> {absender ? <>{absender.konto.name} &lt;{absender.konto.absender}&gt; <span className="leise">(Postfach von {absender.benutzer}, danach in „Gesendet“)</span></> : <>{process.env.SMTP_FROM || process.env.MAIL_FROM || "allgemeiner Absender"} <span className="leise">(allgemein; eigenes Postfach unter Einstellungen → Konto)</span></>}</p>
                <p><b>Betreff:</b> {e.betreff}</p>
                {/* sandbox: keine Skripte, keine Formulare, Links öffnen nichts im System */}
                <iframe className="vorschau mailvorschau" sandbox="" srcDoc={mailHtml({ betreff: e.betreff, text: e.text, vorschau: true })} title="Vorschau der E-Mail" />
                {e.anhaenge.length ? <p className="klein" style={{ marginTop: 8 }}><b>Anhang:</b> {doks.map((d) => d.titel).join(", ")}</p> : null}
                <details style={{ marginTop: 8 }}>
                  <summary className="leise klein" style={{ cursor: "pointer" }}>Nur-Text-Fassung (für alte Mail-Programme)</summary>
                  <div className="textblock">{e.text}<span className="leise">{mailSignatur()}</span></div>
                </details>
                <p className="leise klein" style={{ marginTop: 8 }}>Logo, Design und Signatur mit den Pflichtangaben setzt Levarex OS automatisch.</p>
              </div>
            ) : (
              <div className="karte">
                <h3 style={{ marginTop: 0 }}>So kommt sie an</h3>
                <div style={{ background: "#e7ddd0", borderRadius: 8, padding: 16 }}>
                  <div style={{ background: "#dcf8c6", color: "#1b1b1b", borderRadius: 8, padding: "8px 12px", marginLeft: "auto", maxWidth: "85%", whiteSpace: "pre-wrap", fontSize: 14, lineHeight: 1.45 }}>{e.text}</div>
                </div>
                <p className="leise klein" style={{ marginTop: 8 }}>Geht nur raus, wenn der Kunde in den letzten 24 Stunden selbst geschrieben hat (Regel von WhatsApp).</p>
              </div>
            )}
            {offen ? (
              <form action={eintragSpeichern} className="karte">
                <h3 style={{ marginTop: 0 }}>Text ändern</h3>
                <input type="hidden" name="id" value={e.id} />
                <label className="feld"><span>Empfänger</span><input name="empfaenger" defaultValue={e.empfaenger} /></label>
                <label className="feld"><span>Betreff</span><input name="betreff" defaultValue={e.betreff} required /></label>
                <label className="feld"><span>Text</span><textarea name="text" defaultValue={e.text} style={{ minHeight: 300 }} required /></label>
                <button className="knopf">Änderung speichern</button>
                <p className="leise klein" style={{ marginTop: 8 }}>Nach einer Änderung prüft die Qualitätskontrolle neu.</p>
              </form>
            ) : null}
          </div>
        </section>
      ) : null}

      {!nachricht && (e.kanal === "livegang" || e.kanal === "lastschrift" || e.kanal === "brief") && !vorschauUrl ? (
        <div className="karte abstand-klein">{e.kanal === "lastschrift" ? <h2>SEPA-Lastschrift über Qonto</h2> : null}<div className="textblock">{e.text}</div></div>
      ) : null}

      <section className="schritt" id="schritt-freigeben">
        <h2 className="schritt-titel"><span className="nr">{n.ok}</span> {offen ? "Prüfen und freigeben" : "Verlauf"}</h2>
        {qk}
        {offen ? (
          <div className="karte">
            {e.noetigeFreigaben > 1 ? <p className="leise">Braucht {e.noetigeFreigaben} Freigaben von verschiedenen Personen. Bisher: {e.freigaben.map((f) => f.name).join(", ") || "keine"}.</p> : null}
            <div className="raster" style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 24, alignItems: "end" }}>
              <div>
                {schonFreigegeben ? (
                  <p>Du hast schon freigegeben. Jetzt fehlt die andere Person.</p>
                ) : e.qkStatus === "ausstehend" ? (
                  <p className="leise">Freigeben geht, sobald die Qualitätskontrolle fertig ist.</p>
                ) : e.qkStatus === "blockiert" ? (
                  <p>Die Qualitätskontrolle hat Fehler gefunden. Bitte zuerst beheben (Text ändern oder Unterlagen beim Betrieb ergänzen).</p>
                ) : (
                  <form action={freigeben}>
                    <input type="hidden" name="id" value={e.id} />
                    {e.kanal === "livegang" ? (
                      <label className="feld"><span>Code aus der Authenticator-App</span><input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required /></label>
                    ) : null}
                    <button className="knopf haupt" style={{ width: "100%" }}>{e.kanal === "livegang" ? "Livegang freigeben" : e.kanal === "lastschrift" ? "Lastschrift freigeben" : e.kanal === "brief" ? "Brief freigeben und versenden" : e.kanal === "whatsapp" ? "WhatsApp freigeben und senden" : "Freigeben und senden"}</button>
                  </form>
                )}
              </div>
              <form action={ablehnen} className="knopfreihe" style={{ alignItems: "end" }}>
                <input type="hidden" name="id" value={e.id} />
                <label className="feld" style={{ flex: 1, margin: 0 }}><span>Oder ablehnen</span><input name="grund" placeholder="Grund (optional)" /></label>
                <button className="knopf gefahr klein">Ablehnen</button>
              </form>
            </div>
          </div>
        ) : (
          <div className="karte">
            <ul className="liste">
              <li><span>Erstellt</span><span className="leise">{datumZeit(e.erstelltAm)}</span></li>
              {e.freigaben.map((f) => <li key={f.am}><span>Freigegeben von {f.name}</span><span className="leise">{datumZeit(f.am)}</span></li>)}
              {e.versendetAm ? <li><span>Versendet</span><span className="leise">{datumZeit(e.versendetAm)}</span></li> : null}
            </ul>
          </div>
        )}
      </section>
    </>
  );
}
