import Link from "next/link";
import { desc } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { datum, datumZeit } from "@/lib/format";
import { LOESCHFRISTEN } from "@/lib/recht";
import { DIENSTLEISTER, DSB_HINWEIS, TOMS, VERARBEITUNGEN } from "@/lib/datenschutz-doku";
import { ANFRAGE_ARTEN, anfrageFrist, PANNE_RISIKO, restStunden, verarbeitungen } from "@/lib/ablauf/datenschutz";
import { betroffenenanfrageErfassen, betroffenenanfrageErledigt, panneAktualisieren, panneErfassen } from "../aktionen";

export const metadata = { title: "Datenschutz" };

export default async function Datenschutz() {
  const db = await getDb();
  const [pannen, anfragen, auftrag] = await Promise.all([
    db.select().from(schema.datenpannen).orderBy(desc(schema.datenpannen.entdecktAm)),
    db.select().from(schema.betroffenenanfragen).orderBy(desc(schema.betroffenenanfragen.eingangAm)),
    verarbeitungen(),
  ]);
  const offenePannen = pannen.filter((p) => !p.abgeschlossenAm);
  const offeneAnfragen = anfragen.filter((a) => !a.erledigtAm);
  const heute = new Date().toISOString().slice(0, 10);
  const umgesetzt = TOMS.filter((t) => t.umgesetzt).length;
  return (
    <>
      <div className="kopfzeile">
        <div><h1>Datenschutz und Sicherheit</h1><p>Alles, was die DSGVO von euch als Verantwortliche verlangt: Verzeichnis, Maßnahmen, Dienstleister, Löschfristen, Datenpannen und Anfragen von Betroffenen. Keine Rechtsberatung: vor dem ersten Kunden mit Anwalt oder externem Datenschutzberater abstimmen.</p></div>
      </div>

      {offenePannen.some((p) => p.risiko !== "kein" && !p.gemeldetAm) ? <div className="hinweis fehler" role="alert">Offene Datenpanne: Meldung an die Aufsicht binnen 72 Stunden ab Kenntnis, wenn ein Risiko besteht.</div> : null}

      <div className="raster vier">
        <div className="kennzahl"><div className="wert" style={offenePannen.length ? { color: "var(--fehler)" } : undefined}>{offenePannen.length}</div><div className="name">Offene Datenpannen</div></div>
        <div className="kennzahl"><div className="wert" style={offeneAnfragen.length ? { color: "var(--akzent)" } : undefined}>{offeneAnfragen.length}</div><div className="name">Offene Anfragen</div></div>
        <div className="kennzahl"><div className="wert">{umgesetzt}/{TOMS.length}</div><div className="name">Maßnahmen umgesetzt</div></div>
        <div className="kennzahl"><div className="wert">{VERARBEITUNGEN.length}</div><div className="name">Verarbeitungen</div></div>
      </div>

      <div className="raster zwei abstand" style={{ alignItems: "start" }}>
        <section className="karte">
          <h2>Datenpannen (Art. 33/34)</h2>
          <p className="leise klein">Beispiele: Laptop verloren, Mail an falschen Empfänger, unbefugter Zugriff, gelöschte Daten ohne Backup. Alles erfassen; melden, wenn ein Risiko für Personen besteht. Zuständig in Baden-Württemberg: LfDI BW (Online-Formular).</p>
          {pannen.length ? (
            <ul className="liste">
              {pannen.map((p) => {
                const rest = restStunden(p.entdecktAm);
                return (
                  <li key={p.id} style={{ display: "block" }}>
                    <div className="titel">#{p.id} · entdeckt {datumZeit(p.entdecktAm)} · {PANNE_RISIKO[p.risiko]}</div>
                    <div className="unter">{p.beschreibung}{p.betroffene ? ` · Betroffen: ${p.betroffene}` : ""}</div>
                    <div className="klein" style={{ margin: "4px 0", color: !p.gemeldetAm && p.risiko !== "kein" && !p.abgeschlossenAm ? "var(--fehler)" : undefined }}>
                      {p.abgeschlossenAm ? `abgeschlossen ${datum(p.abgeschlossenAm)}` : p.gemeldetAm ? `gemeldet ${datumZeit(p.gemeldetAm)}` : p.risiko === "kein" ? "nicht meldepflichtig, dokumentiert" : rest >= 0 ? `noch ${rest} Stunden bis zur Meldefrist` : `Meldefrist seit ${-rest} Stunden überschritten: sofort melden und Verzögerung begründen`}
                    </div>
                    {!p.abgeschlossenAm ? (
                      <form action={panneAktualisieren} className="raster zwei">
                        <input type="hidden" name="id" value={p.id} />
                        <label className="feld"><span>Bewertung</span><select name="risiko" defaultValue={p.risiko}>{Object.entries(PANNE_RISIKO).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
                        <label className="feld"><span>Maßnahmen</span><input name="massnahmen" defaultValue={p.massnahmen ?? ""} placeholder="z. B. Passwörter geändert" /></label>
                        <div className="knopfreihe" style={{ gridColumn: "1 / -1" }}>
                          <label className="haken"><input type="checkbox" name="gemeldet" value="ja" defaultChecked={!!p.gemeldetAm} /><span>an Aufsicht gemeldet</span></label>
                          <label className="haken"><input type="checkbox" name="informiert" value="ja" defaultChecked={!!p.betroffeneInformiertAm} /><span>Betroffene informiert</span></label>
                          <label className="haken"><input type="checkbox" name="abgeschlossen" value="ja" /><span>abgeschlossen</span></label>
                          <button className="knopf klein">Speichern</button>
                        </div>
                      </form>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : <p className="leise">Keine Datenpannen erfasst.</p>}
          <details style={{ marginTop: 12 }}>
            <summary style={{ cursor: "pointer" }}>Datenpanne erfassen</summary>
            <form action={panneErfassen} style={{ marginTop: 8 }}>
              <div className="raster zwei">
                <label className="feld"><span>Entdeckt am</span><input type="date" name="datum" defaultValue={heute} required /></label>
                <label className="feld"><span>Uhrzeit</span><input type="time" name="datumUhr" defaultValue="09:00" /></label>
              </div>
              <label className="feld"><span>Was ist passiert?</span><textarea name="beschreibung" rows={3} required /></label>
              <div className="raster zwei">
                <label className="feld"><span>Wer ist betroffen?</span><input name="betroffene" placeholder="z. B. 3 Kunden" /></label>
                <label className="feld"><span>Welche Daten?</span><input name="daten" placeholder="z. B. Name, E-Mail" /></label>
              </div>
              <button className="knopf">Erfassen</button>
            </form>
          </details>
        </section>

        <section className="karte">
          <h2>Anfragen von Betroffenen (Art. 15–21)</h2>
          <p className="leise klein">Antwort spätestens einen Monat nach Eingang. Auskunft und Löschung je Betrieb direkt auf der Betriebsseite. Widerspruch gegen Werbung: Betrieb auf die Sperrliste.</p>
          {anfragen.length ? (
            <ul className="liste">
              {anfragen.map((a) => {
                const frist = anfrageFrist(a.eingangAm);
                const knapp = !a.erledigtAm && frist.getTime() - Date.now() < 7 * 864e5;
                return (
                  <li key={a.id}>
                    <div style={{ flex: 1 }}><div className="titel">{ANFRAGE_ARTEN[a.art]} · {a.person}{a.betriebId ? <> · <Link href={`/leads/${a.betriebId}`}>Betrieb</Link></> : null}</div><div className="unter" style={knapp ? { color: "var(--fehler)" } : undefined}>Eingang {datum(a.eingangAm)} · {a.erledigtAm ? `erledigt ${datum(a.erledigtAm)}` : `Frist ${datum(frist)}`}{a.notiz ? ` · ${a.notiz}` : ""}</div></div>
                    {!a.erledigtAm ? <form action={betroffenenanfrageErledigt}><input type="hidden" name="id" value={a.id} /><button className="knopf klein">Erledigt</button></form> : null}
                  </li>
                );
              })}
            </ul>
          ) : <p className="leise">Keine Anfragen.</p>}
          <details style={{ marginTop: 12 }}>
            <summary style={{ cursor: "pointer" }}>Anfrage erfassen</summary>
            <form action={betroffenenanfrageErfassen} style={{ marginTop: 8 }}>
              <div className="raster zwei">
                <label className="feld"><span>Eingang</span><input type="date" name="eingang" defaultValue={heute} required /></label>
                <label className="feld"><span>Art</span><select name="art">{Object.entries(ANFRAGE_ARTEN).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
              </div>
              <label className="feld"><span>Wer?</span><input name="person" required placeholder="Name, Betrieb" /></label>
              <label className="feld"><span>Notiz</span><input name="notiz" placeholder="Wie kam die Anfrage? Identität geprüft?" /></label>
              <button className="knopf">Erfassen</button>
            </form>
          </details>
        </section>
      </div>

      <section className="karte abstand" style={{ padding: 0 }}>
        <div style={{ padding: "16px 16px 0" }}><h2>Verzeichnis der Verarbeitungstätigkeiten (Art. 30 Abs. 1)</h2><p className="leise klein">Verantwortlich: Nexova Consulting GmbH. {DSB_HINWEIS}</p></div>
        <table className="tabelle klein">
          <thead><tr><th>Verarbeitung</th><th>Zweck und Rechtsgrundlage</th><th className="weg-mobil">Daten und Betroffene</th><th className="weg-mobil">Empfänger, Drittland</th><th>Löschung</th></tr></thead>
          <tbody>{VERARBEITUNGEN.map((v) => <tr key={v.name}><td><b>{v.name}</b></td><td>{v.zweck}<div className="leise">{v.rechtsgrundlage}</div></td><td className="weg-mobil">{v.daten}<div className="leise">{v.betroffene}</div></td><td className="weg-mobil">{v.empfaenger}<div className="leise">Drittland: {v.drittland}</div></td><td>{v.loeschung}</td></tr>)}</tbody>
        </table>
      </section>

      <section className="karte abstand" style={{ padding: 0 }}>
        <div style={{ padding: "16px 16px 0" }}><h2>Technische und organisatorische Maßnahmen (Art. 32)</h2><p className="leise klein">Technisch in Nexova OS umgesetzt und mit Tests abgesichert; „offen“ heißt: vor dem ersten echten Kunden erledigen.</p></div>
        <table className="tabelle klein">
          <thead><tr><th>Bereich</th><th>Maßnahme</th><th>Stand</th></tr></thead>
          <tbody>{TOMS.map((t) => <tr key={t.massnahme}><td>{t.bereich}</td><td>{t.massnahme}</td><td><span className={`status ${t.umgesetzt ? "ok" : "warten"}`}>{t.umgesetzt ? "umgesetzt" : "offen"}</span></td></tr>)}</tbody>
        </table>
      </section>

      <div className="raster zwei abstand" style={{ alignItems: "start" }}>
        <section className="karte" style={{ padding: 0 }}>
          <div style={{ padding: "16px 16px 0" }}><h2>Dienstleister</h2><p className="leise klein">Mit „AV“ braucht es einen Vertrag zur Auftragsverarbeitung (Art. 28), bei Drittland zusätzlich eine Grundlage nach Art. 44 ff. Aktiv wird ein Dienst erst, wenn sein Zugang gesetzt ist.</p></div>
          <table className="tabelle klein">
            <thead><tr><th>Dienst</th><th>Wofür</th><th>AV</th><th>Status</th></tr></thead>
            <tbody>{DIENSTLEISTER.map((d) => <tr key={d.name}><td>{d.name}<div className="leise">{d.sitz}</div></td><td>{d.wofuer}</td><td>{d.av ? "nötig" : "nein"}</td><td><span className={`status ${d.aktivWenn === "immer" || process.env[d.aktivWenn] ? "ok" : ""}`}>{d.aktivWenn === "immer" || process.env[d.aktivWenn] ? "aktiv" : "aus"}</span></td></tr>)}</tbody>
          </table>
        </section>
        <section className="karte" style={{ padding: 0 }}>
          <div style={{ padding: "16px 16px 0" }}><h2>Löschkonzept</h2><p className="leise klein">Automatisch: Der Aufräum-Agent löscht täglich um 3 Uhr.</p></div>
          <table className="tabelle klein">
            <thead><tr><th>Was</th><th>Frist</th><th>Grund</th></tr></thead>
            <tbody>{LOESCHFRISTEN.map((f) => <tr key={f.was}><td>{f.was}{f.automatisch ? "" : <div className="leise">von Hand</div>}</td><td className="mono">{f.tage === null ? "–" : f.tage >= 365 ? `${Math.round(f.tage / 365)} J.` : `${f.tage} T.`}</td><td>{f.grund}</td></tr>)}</tbody>
          </table>
        </section>
      </div>

      <section className="karte abstand">
        <h2>Als Auftragsverarbeiter für Kunden (Art. 30 Abs. 2)</h2>
        <p className="leise">{auftrag.length} Kunden. Details unter System → Verarbeitungen für Kunden.</p>
      </section>
    </>
  );
}
