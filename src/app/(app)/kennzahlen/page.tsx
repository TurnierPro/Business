import { kennzahlen } from "@/lib/kennzahlen";
import { Status } from "@/components/Status";
import { stundenJeBaustein } from "@/lib/ablauf/zeiten";
import { SeitenKopf } from "@/components/Seite";

export const metadata = { title: "Kennzahlen" };

export default async function Kennzahlen() {
  const [{ messgroessen, trichter }, bausteine] = await Promise.all([kennzahlen(), stundenJeBaustein()]);
  const h = (x: number | null) => (x === null ? "–" : `${x.toLocaleString("de-DE", { maximumFractionDigits: 1 })} h`);
  const max = Math.max(1, ...trichter.map((t) => t.anzahl));
  return (
    <>
      <SeitenKopf titel="Kennzahlen" text="Die Messgrößen aus dem Business Case. Liegen sie Ende März 2027 deutlich darüber, gilt das vorsichtige Szenario." />
      <div className="raster vier">
        {messgroessen.map((m) => (
          <section key={m.name} className="karte">
            <div className="kopfzeile" style={{ marginBottom: 6, alignItems: "start" }}><h3 style={{ margin: 0 }}>{m.name}</h3><Status wert={m.ok === null ? "keine_daten" : m.ok ? "im_ziel" : "nicht_im_ziel"} /></div>
            <div className="mono" style={{ fontSize: m.ok === null ? 16 : 26, margin: "6px 0", color: m.ok === null ? "var(--leise)" : m.ok ? "var(--ok)" : "var(--fehler)" }}>{m.wert}</div>
            <div className="klein">Ziel: {m.ziel}</div>
            <div className="klein leise" style={{ marginTop: 4 }}>{m.erklaerung}</div>
          </section>
        ))}
      </div>
      <section className="karte abstand">
        <h2>Stunden je Baustein</h2>
        <p className="leise klein">Lieferzeit ohne Betreuung, Durchschnitt je Projekt. Gemessen ab Projekt 1; Ziel aus dem Baukasten (Start-Werte liegen höher).</p>
        <table className="tabelle">
          <thead><tr><th>Baustein</th><th className="zahl">Projekte</th><th className="zahl">Ø Stunden</th><th className="zahl">Ziel</th><th>Stand</th></tr></thead>
          <tbody>
            {bausteine.map((b) => (
              <tr key={b.key}><td>{b.name}</td><td className="zahl">{b.projekte}</td><td className="zahl">{h(b.schnitt)}</td><td className="zahl">{h(b.ziel)}</td><td><Status wert={b.schnitt === null || b.ziel === null ? "keine_daten" : b.schnitt <= b.ziel ? "im_ziel" : "nicht_im_ziel"} /></td></tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="karte abstand">
        <h2>Vertriebstrichter</h2>
        <ul className="liste">
          {trichter.map((t, i) => (
            <li key={t.stufe} className="trichter-zeile">
              <span>{t.stufe}</span>
              <div className="balken" role="img" aria-label={`${t.anzahl} Betriebe`}><span style={{ width: `${(t.anzahl / max) * 100}%` }} /></div>
              <span className="mono" style={{ textAlign: "right" }}>{t.anzahl}{i > 0 && trichter[i - 1].anzahl ? <span className="leise klein"> · {Math.round((t.anzahl / trichter[i - 1].anzahl) * 100)} %</span> : null}</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
