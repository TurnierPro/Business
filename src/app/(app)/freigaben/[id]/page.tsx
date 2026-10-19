import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { brauchtBenutzer } from "@/lib/auth";
import { Status } from "@/components/Status";
import { NeuLaden } from "@/components/NeuLaden";
import { datumZeit, DOKART, KANAL, ZWECK } from "@/lib/format";
import { ablehnen, angebotAendern, eintragSpeichern, freigeben } from "../../aktionen";
import { AngebotEditor } from "@/components/AngebotEditor";
import type { AngebotDaten } from "@/lib/docs/vorlagen";
import { mailSignatur } from "@/lib/recht";

export const metadata = { title: "Freigabe prüfen" };

export default async function Eintrag({ params }: { params: Promise<{ id: string }> }) {
  const ich = await brauchtBenutzer();
  const id = Number((await params).id);
  const db = await getDb();
  const [e] = await db.select().from(schema.postausgang).where(eq(schema.postausgang.id, id));
  if (!e) notFound();
  const [betrieb] = e.betriebId ? await db.select().from(schema.betriebe).where(eq(schema.betriebe.id, e.betriebId)) : [];
  const doks = e.anhaenge.length ? await db.select().from(schema.dokumente).where(inArray(schema.dokumente.id, e.anhaenge)) : [];
  const offen = e.status === "zur_freigabe";
  const angebotDok = e.zweck === "angebot" ? doks.find((d) => d.art === "angebot" && !d.archivPfad) : undefined;
  const schonFreigegeben = e.freigaben.some((f) => f.name === ich.name);
  const slug = typeof e.meta.slug === "string" ? e.meta.slug : null;
  const [seite] = slug ? await db.select().from(schema.seiten).where(eq(schema.seiten.slug, slug)) : [];
  const vorschauUrl = e.kanal === "livegang" && slug ? `/vorschau/${slug}${seite?.zugangscode ? `?code=${seite.zugangscode}` : ""}` : doks[0] ? `/dokument/${doks[0].id}/ansicht` : null;

  return (
    <>
      <Link href="/freigaben" className="zurueck">← Freigaben</Link>
      <div className="kopfzeile">
        <div>
          <h1>{ZWECK[e.zweck] ?? e.zweck}</h1>
          <p>{KANAL[e.kanal]} an {e.empfaenger}{betrieb ? <> · <Link href={`/leads/${betrieb.id}`}>{betrieb.name}</Link></> : null}</p>
        </div>
        <Status wert={e.status} />
      </div>

      <div className={`hinweis ${e.qkStatus === "bestanden" ? "ok" : e.qkStatus === "blockiert" ? "fehler" : ""}`} role="note">
        <b>Qualitätskontrolle: </b><Status wert={e.qkStatus} />
        {e.qkStatus === "ausstehend" ? <><span className="leise"> Läuft gerade, die Seite aktualisiert sich selbst.</span><NeuLaden /></> : null}
        {e.qkStatus === "bestanden" ? <span className="leise"> Keine Auffälligkeiten.</span> : null}
        {e.hinweise.length ? <ul>{e.hinweise.map((h) => <li key={h}>{h}</li>)}</ul> : null}
      </div>
      {e.status === "abgelehnt" ? <div className="hinweis fehler">Abgelehnt: {e.ablehnGrund}</div> : null}
      {e.fehler ? <div className="hinweis fehler">Fehler beim Versand: {e.fehler}</div> : null}

      {offen && angebotDok ? (
        <div style={{ marginBottom: 24 }}>
          <AngebotEditor
            dokumentId={angebotDok.id}
            eintragId={e.id}
            start={{ positionen: (angebotDok.daten as AngebotDaten).positionen?.length ? (angebotDok.daten as AngebotDaten).positionen! : [{ text: "Paket", einmalig: (angebotDok.daten as AngebotDaten).einmalig, monatlich: (angebotDok.daten as AngebotDaten).monatlich }], einleitung: (angebotDok.daten as AngebotDaten).einleitung, anmerkungen: (angebotDok.daten as AngebotDaten).anmerkungen ?? "" }}
            speichern={angebotAendern}
          />
        </div>
      ) : null}

      <div className="raster zwei" style={{ alignItems: "start" }}>
        <section>
          {vorschauUrl ? <iframe className="vorschau" src={vorschauUrl} title="Vorschau" /> : null}
          {e.kanal === "mail" ? (
            <div className="karte" style={{ marginTop: vorschauUrl ? 16 : 0 }}>
              <h2>E-Mail</h2>
              <p><b>Betreff:</b> {e.betreff}</p>
              <div className="textblock">{e.text}<span className="leise">{mailSignatur()}</span></div>
              <p className="leise klein" style={{ marginTop: 8 }}>Die Signatur mit den Pflichtangaben (§ 35a GmbHG) hängt Stelax OS automatisch an.</p>
            </div>
          ) : null}
          {doks.length ? (
            <div className="knopfreihe" style={{ marginTop: 12 }}>
              {doks.map((d) => <a key={d.id} className="knopf klein" href={`/dokument/${d.id}`} target="_blank">{DOKART[d.art] ?? d.art} als PDF</a>)}
            </div>
          ) : null}
          {e.kanal === "livegang" || e.kanal === "zahlung" ? <div className="karte" style={{ marginTop: e.kanal === "livegang" ? 16 : 0 }}>{e.kanal === "zahlung" ? <h2>Zahlung über Stripe</h2> : null}<div className="textblock">{e.text}</div></div> : null}
        </section>

        <section>
          {offen ? (
            <div className="karte">
              <h2>Entscheiden</h2>
              {e.noetigeFreigaben > 1 ? <p className="leise">Braucht {e.noetigeFreigaben} Freigaben von verschiedenen Personen. Bisher: {e.freigaben.map((f) => f.name).join(", ") || "keine"}.</p> : null}
              {schonFreigegeben ? (
                <p>Du hast schon freigegeben. Jetzt fehlt die andere Person.</p>
              ) : e.qkStatus === "ausstehend" ? (
                <p className="leise">Freigeben geht, sobald die Qualitätskontrolle fertig ist.</p>
              ) : e.qkStatus === "blockiert" ? (
                <p>Die Qualitätskontrolle hat Fehler gefunden. Bitte zuerst beheben (Text ändern oder Unterlagen beim Betrieb ergänzen).</p>
              ) : (
                <form action={freigeben}>
                  <input type="hidden" name="id" value={e.id} />
                  <button className="knopf haupt" style={{ width: "100%" }}>{e.kanal === "livegang" ? "Livegang freigeben" : e.kanal === "zahlung" ? "Zahlung freigeben" : e.kanal === "brief" ? "Brief freigeben und versenden" : "Freigeben und senden"}</button>
                </form>
              )}
              <form action={ablehnen} style={{ marginTop: 16 }}>
                <input type="hidden" name="id" value={e.id} />
                <label className="feld"><span>Oder ablehnen</span><input name="grund" placeholder="Grund (optional)" /></label>
                <button className="knopf gefahr klein">Ablehnen</button>
              </form>
            </div>
          ) : (
            <div className="karte">
              <h2>Verlauf</h2>
              <ul className="liste">
                <li><span>Erstellt</span><span className="leise">{datumZeit(e.erstelltAm)}</span></li>
                {e.freigaben.map((f) => <li key={f.am}><span>Freigegeben von {f.name}</span><span className="leise">{datumZeit(f.am)}</span></li>)}
                {e.versendetAm ? <li><span>Versendet</span><span className="leise">{datumZeit(e.versendetAm)}</span></li> : null}
              </ul>
            </div>
          )}

          {offen && e.kanal !== "livegang" && e.kanal !== "zahlung" ? (
            <form action={eintragSpeichern} className="karte">
              <h2>Text ändern</h2>
              <input type="hidden" name="id" value={e.id} />
              <label className="feld"><span>Empfänger</span><input name="empfaenger" defaultValue={e.empfaenger} /></label>
              <label className="feld"><span>Betreff</span><input name="betreff" defaultValue={e.betreff} required /></label>
              <label className="feld"><span>Text</span><textarea name="text" defaultValue={e.text} style={{ minHeight: 320 }} required /></label>
              <button className="knopf">Änderung speichern</button>
              <p className="leise klein" style={{ marginTop: 8 }}>Nach einer Änderung muss neu freigegeben werden.</p>
            </form>
          ) : null}
        </section>
      </div>
    </>
  );
}
