import { kennzahlen } from "@/lib/kennzahlen";
import { Status } from "@/components/Status";

export const metadata = { title: "Kennzahlen" };

export default async function Kennzahlen() {
  const { messgroessen, trichter } = await kennzahlen();
  const max = Math.max(1, ...trichter.map((t) => t.anzahl));
  return (
    <>
      <div className="kopfzeile">
        <div><h1>Kennzahlen</h1><p>Die Messgrößen aus dem Business Case. Liegen sie Ende März 2027 deutlich darüber, gilt das vorsichtige Szenario. Grundlage: Zeiterfassung, Termine, Angebote, Projekte.</p></div>
      </div>
      <div className="raster zwei">
        {messgroessen.map((m) => (
          <section key={m.name} className="karte">
            <div className="kopfzeile" style={{ marginBottom: 4 }}><h2 style={{ margin: 0 }}>{m.name}</h2><Status wert={m.ok === null ? "keine_daten" : m.ok ? "im_ziel" : "nicht_im_ziel"} /></div>
            <div className="mono" style={{ fontSize: 28, margin: "8px 0" }}>{m.wert}</div>
            <div className="klein">Ziel: {m.ziel}</div>
            <div className="klein leise" style={{ marginTop: 6 }}>{m.erklaerung}</div>
          </section>
        ))}
      </div>
      <section className="karte abstand">
        <h2>Vertriebstrichter</h2>
        <ul className="liste">
          {trichter.map((t, i) => (
            <li key={t.stufe} style={{ display: "grid", gridTemplateColumns: "220px 1fr 80px", alignItems: "center" }}>
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
