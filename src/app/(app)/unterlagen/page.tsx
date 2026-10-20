import Link from "next/link";
import { Status } from "@/components/Status";
import { Fortschritt } from "@/components/FinanzReiter";
import { datum } from "@/lib/format";
import { ENTSCHEIDUNGEN, ETAPPEN, FRISTEN, inNexovaOs, stand, UNTERLAGEN } from "@/lib/unterlagen";
import { unterlageSpeichern } from "../aktionen";

export const metadata = { title: "Unterlagen" };

// Alle Verträge, Anmeldungen und Nachweise für die GmbH, aus dem Bericht „Dokumente für die Nexova GmbH“.
// Wir haken hier ab, was erledigt ist, und legen die fertige Datei gleich dazu.

const STATUS = [
  { wert: "offen", text: "offen" },
  { wert: "in_arbeit", text: "in Arbeit" },
  { wert: "erledigt", text: "erledigt" },
  { wert: "entfaellt", text: "entfällt" },
];

type Suche = { etappe?: string; status?: string; q?: string };

export default async function Unterlagen({ searchParams }: { searchParams: Promise<Suche> }) {
  const s = await searchParams;
  const st = await stand();
  const statusVon = (key: string, etappe: number) => st.get(key)?.status ?? (etappe === 0 ? "entfaellt" : "offen");
  const heute = new Date().toISOString().slice(0, 10);
  const q = (s.q ?? "").toLowerCase();

  const liste = UNTERLAGEN.filter(
    (u) =>
      (!s.etappe || String(u.etappe) === s.etappe) &&
      (!s.status || statusVon(u.key, u.etappe) === s.status) &&
      (!q || `${u.titel} ${u.kategorie} ${u.grundlage} ${u.wer}`.toLowerCase().includes(q)),
  );
  const fristen = FRISTEN.filter((f) => f.datum >= heute);
  const naechste = fristen[0];

  return (
    <>
      <div className="kopfzeile">
        <div>
          <h1>Unterlagen</h1>
          <p>Alles, was die GmbH an Verträgen, Anmeldungen und Nachweisen braucht. Keine Rechtsberatung: Wo Anwalt, Steuerberater oder Notar steht, prüfen diese.</p>
        </div>
      </div>

      {naechste ? (
        <div className="hinweis">Nächste Frist: <strong>{datum(new Date(naechste.datum))}</strong> · {naechste.was}</div>
      ) : null}

      <div className="raster drei">
        {ETAPPEN.filter((e) => e.nr > 0).map((e) => {
          const teil = UNTERLAGEN.filter((u) => u.etappe === e.nr);
          const fertig = teil.filter((u) => ["erledigt", "entfaellt"].includes(statusVon(u.key, u.etappe))).length;
          return (
            <Link key={e.nr} href={`/unterlagen?etappe=${e.nr}`} className="karte" style={{ display: "block", textDecoration: "none", color: "inherit" }} aria-current={s.etappe === String(e.nr) ? "page" : undefined}>
              <h3 style={{ margin: "0 0 4px" }}>{e.nr}. {e.name}</h3>
              <div className="klein leise" style={{ marginBottom: 10 }}>bis {datum(new Date(e.bis))}</div>
              <Fortschritt ist={fertig} ziel={teil.length} format={(n) => String(n)} />
            </Link>
          );
        })}
      </div>

      <form className="knopfreihe abstand" method="get" role="search" aria-label="Unterlagen filtern">
        <select name="etappe" defaultValue={s.etappe ?? ""} aria-label="Etappe" style={{ width: "auto" }}>
          <option value="">Alle Etappen</option>
          {ETAPPEN.map((e) => <option key={e.nr} value={e.nr}>{e.nr ? `${e.nr}. ` : ""}{e.name}</option>)}
        </select>
        <select name="status" defaultValue={s.status ?? ""} aria-label="Status" style={{ width: "auto" }}>
          <option value="">Jeder Status</option>
          {STATUS.map((x) => <option key={x.wert} value={x.wert}>{x.text}</option>)}
        </select>
        <input name="q" defaultValue={s.q ?? ""} placeholder="Suchen, z. B. AGB" aria-label="Suchbegriff" style={{ width: 220 }} />
        <button className="knopf">Filtern</button>
        {s.etappe || s.status || s.q ? <Link href="/unterlagen" className="knopf klein">Zurücksetzen</Link> : null}
      </form>

      <section className="karte abstand" style={{ padding: 0 }}>
        <div className="klein leise" style={{ padding: "12px 16px" }}>{liste.length} von {UNTERLAGEN.length} Unterlagen</div>
        <div className="register">
          {liste.map((u) => {
            const z = st.get(u.key);
            const wert = statusVon(u.key, u.etappe);
            const os = inNexovaOs(u);
            return (
              <details key={u.key}>
                <summary>
                  <div>
                    <div className="titel">{u.titel}</div>
                    <div className="klein leise">{u.kategorie} · {u.wer} · {u.prioritaet}</div>
                    {os ? <span className="marke">In Nexova OS umgesetzt</span> : null}
                  </div>
                  <Status wert={wert} />
                </summary>
                <div className="inhalt">
                  <div className="klein">
                    <div><strong>Pflicht?</strong> {u.status}</div>
                    <div><strong>Grundlage:</strong> {u.grundlage}</div>
                    {os ? <div><strong>In Nexova OS:</strong> {os}</div> : null}
                    {z?.geaendertAm ? <div className="leise">Zuletzt geändert {datum(z.geaendertAm)} von {z.geaendertVon}</div> : null}
                  </div>
                  <form action={unterlageSpeichern} encType="multipart/form-data" className="raster zwei">
                    <input type="hidden" name="key" value={u.key} />
                    <label className="feld"><span>Status</span>
                      <select name="status" defaultValue={wert}>{STATUS.map((x) => <option key={x.wert} value={x.wert}>{x.text}</option>)}</select>
                    </label>
                    <label className="feld"><span>Datei</span>
                      <input type="file" name="datei" />
                      {z?.dateiName ? <small>Liegt ab: <a href={`/unterlagen-datei/${u.key}`}>{z.dateiName}</a></small> : <small>z. B. unterschriebener Vertrag als PDF</small>}
                    </label>
                    <label className="feld" style={{ gridColumn: "1 / -1" }}><span>Notiz</span>
                      <textarea name="notiz" rows={2} defaultValue={z?.notiz ?? ""} placeholder="Wer kümmert sich, was fehlt noch?" />
                    </label>
                    <div><button className="knopf">Speichern</button></div>
                  </form>
                </div>
              </details>
            );
          })}
          {!liste.length ? <div className="leer"><strong>Nichts gefunden.</strong>Filter zurücksetzen.</div> : null}
        </div>
      </section>

      <div className="raster zwei abstand">
        <section className="karte">
          <h2>Fristen</h2>
          <ul className="liste">
            {FRISTEN.map((f) => (
              <li key={f.datum + f.was} style={f.datum < heute ? { opacity: 0.55 } : undefined}>
                <div>
                  <div className="titel"><span className="mono">{datum(new Date(f.datum))}</span> · {f.was}</div>
                  <div className="unter">{f.quelle}{f.datum < heute ? " · vorbei" : ""}</div>
                </div>
              </li>
            ))}
          </ul>
        </section>
        <section className="karte">
          <h2>Zu entscheiden</h2>
          <ul className="liste">
            {ENTSCHEIDUNGEN.map((e) => (
              <li key={e.titel}>
                <div>
                  <div className="titel">{e.titel}</div>
                  <div className="unter">{e.text} · <strong>Wer:</strong> {e.wer}</div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
