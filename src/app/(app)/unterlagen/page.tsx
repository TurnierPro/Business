import Link from "next/link";
import { Status } from "@/components/Status";
import { Fortschritt } from "@/components/FinanzReiter";
import { datum } from "@/lib/format";
import { ENTSCHEIDUNGEN, ETAPPEN, FRISTEN, inLevarexOs, stand, UNTERLAGEN } from "@/lib/unterlagen";
import { unterlageSpeichern } from "../aktionen";
import { AufEinenBlick, SeitenKopf, SeitenReiter, reiterWahl } from "@/components/Seite";

export const metadata = { title: "Unterlagen" };

// Alle Verträge, Anmeldungen und Nachweise für die GmbH, aus dem Bericht „Dokumente für die Levarex GmbH“.
// Wir haken hier ab, was erledigt ist, und legen die fertige Datei gleich dazu.

const STATUS = [
  { wert: "offen", text: "offen" },
  { wert: "in_arbeit", text: "in Arbeit" },
  { wert: "erledigt", text: "erledigt" },
  { wert: "entfaellt", text: "entfällt" },
];

type Suche = { reiter?: string; status?: string; q?: string };

export default async function Unterlagen({ searchParams }: { searchParams: Promise<Suche> }) {
  const s = await searchParams;
  const st = await stand();
  const statusVon = (key: string, etappe: number) => st.get(key)?.status ?? (etappe === 0 ? "entfaellt" : "offen");
  const heute = new Date().toISOString().slice(0, 10);
  const q = (s.q ?? "").toLowerCase();

  const fertig = (u: (typeof UNTERLAGEN)[number]) => ["erledigt", "entfaellt"].includes(statusVon(u.key, u.etappe));
  const fristen = FRISTEN.filter((f) => f.datum >= heute);
  const naechste = fristen[0];
  const offen = UNTERLAGEN.filter((u) => statusVon(u.key, u.etappe) === "offen").length;
  const inArbeit = UNTERLAGEN.filter((u) => statusVon(u.key, u.etappe) === "in_arbeit").length;
  const erledigt = UNTERLAGEN.filter((u) => statusVon(u.key, u.etappe) === "erledigt").length;
  // Reiter: eine Etappe je Reiter (Zahl = noch offen), dazu Fristen und Entscheidungen
  const etappen = ETAPPEN.filter((e) => UNTERLAGEN.some((u) => u.etappe === e.nr));
  const reiterListe = [
    ...etappen.map((e) => {
      const rest = UNTERLAGEN.filter((u) => u.etappe === e.nr && !fertig(u)).length;
      return { key: `e${e.nr}`, name: e.nr ? `${e.nr}. ${e.name}` : e.name, zahl: rest || "✓", ton: rest ? ("warten" as const) : undefined };
    }),
    { key: "fristen", name: "Fristen", zahl: fristen.length },
    { key: "entscheiden", name: "Zu entscheiden", zahl: ENTSCHEIDUNGEN.length },
  ];
  const erste = etappen.find((e) => e.nr > 0 && UNTERLAGEN.some((u) => u.etappe === e.nr && !fertig(u)));
  const reiter = reiterWahl(s.reiter ?? (erste ? `e${erste.nr}` : undefined), reiterListe);
  const etappe = reiter.startsWith("e") ? ETAPPEN.find((e) => `e${e.nr}` === reiter) : undefined;
  const liste = etappe
    ? UNTERLAGEN.filter(
        (u) =>
          u.etappe === etappe.nr &&
          (!s.status || statusVon(u.key, u.etappe) === s.status) &&
          (!q || `${u.titel} ${u.kategorie} ${u.grundlage} ${u.wer}`.toLowerCase().includes(q)),
      )
    : [];
  const kategorien = [...new Set(liste.map((u) => u.kategorie))];
  const teil = etappe ? UNTERLAGEN.filter((u) => u.etappe === etappe.nr) : [];

  return (
    <>
      <SeitenKopf titel="Unterlagen" text="Verträge, Anmeldungen und Nachweise der GmbH, nach Etappen. Keine Rechtsberatung: Wo Anwalt, Steuerberater oder Notar steht, prüfen diese." />
      <AufEinenBlick werte={[
        { wert: naechste ? datum(new Date(naechste.datum)) : "–", name: naechste ? `nächste Frist · ${naechste.was.length > 38 ? `${naechste.was.slice(0, 38)} …` : naechste.was}` : "keine Frist", ton: "warten", href: "/unterlagen?reiter=fristen" },
        { wert: offen, name: "offen", ton: offen ? "warten" : "ok" },
        { wert: inArbeit, name: "in Arbeit" },
        { wert: erledigt, name: "erledigt", ton: "ok" },
        { wert: UNTERLAGEN.length, name: "Unterlagen insgesamt" },
      ]} />
      <SeitenReiter basis="/unterlagen" aktiv={reiter} liste={reiterListe} />

      {etappe ? (
        <>
          <div className="kopfzeile" style={{ marginBottom: 8, alignItems: "center" }}>
            <div style={{ flex: 1, maxWidth: 520 }}>
              <p className="klein" style={{ margin: "0 0 6px" }}><b>{etappe.name}</b>{etappe.nr ? <> · bis {datum(new Date(etappe.bis))}</> : null}</p>
              <Fortschritt ist={teil.filter(fertig).length} ziel={teil.length} format={(n) => String(n)} />
            </div>
            <form className="filterleiste" method="get" role="search" aria-label="Unterlagen filtern" style={{ margin: 0 }}>
              <input type="hidden" name="reiter" value={reiter} />
              <input name="q" defaultValue={s.q ?? ""} placeholder="Suchen, z. B. AGB" aria-label="Suchbegriff" />
              <select name="status" defaultValue={s.status ?? ""} aria-label="Status">
                <option value="">Jeder Status</option>
                {STATUS.map((x) => <option key={x.wert} value={x.wert}>{x.text}</option>)}
              </select>
              <button className="knopf">Filtern</button>
            </form>
          </div>
      <section className="karte abstand" style={{ padding: 0 }}>
        {kategorien.map((kat) => (
        <div key={kat}>
        <h3 className="gruppe-titel" style={{ padding: "16px 16px 0", marginTop: 0 }}>{kat} · {liste.filter((u) => u.kategorie === kat && !fertig(u)).length} offen von {liste.filter((u) => u.kategorie === kat).length}</h3>
        <div className="register">
          {[...liste.filter((u) => u.kategorie === kat && !fertig(u)), ...liste.filter((u) => u.kategorie === kat && fertig(u))].map((u) => {
            const z = st.get(u.key);
            const wert = statusVon(u.key, u.etappe);
            const os = inLevarexOs(u);
            return (
              <details key={u.key}>
                <summary>
                  <div>
                    <div className="titel">{u.titel}</div>
                    <div className="klein leise">{u.wer} · {u.prioritaet}</div>
                    {os ? <span className="marke">In Levarex OS umgesetzt</span> : null}
                  </div>
                  <Status wert={wert} />
                </summary>
                <div className="inhalt">
                  <div className="klein">
                    <div><strong>Pflicht?</strong> {u.status}</div>
                    <div><strong>Grundlage:</strong> {u.grundlage}</div>
                    {os ? <div><strong>In Levarex OS:</strong> {os}</div> : null}
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
        </div>
        </div>
        ))}
          {!liste.length ? <div className="leer"><strong>Nichts gefunden.</strong><Link href={`/unterlagen?reiter=${reiter}`}>Filter zurücksetzen</Link></div> : null}
      </section>
        </>
      ) : null}

      {reiter === "fristen" ? (
        <section className="karte">
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
      ) : null}
      {reiter === "entscheiden" ? (
        <section className="karte">
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
      ) : null}
    </>
  );
}
