"use client";
import { useEffect, useRef, useState } from "react";

type Position = { text: string; einmalig: number; monatlich: number; hinweis?: string };
type Start = { positionen: Position[]; einleitung: string; anmerkungen: string };

const euro = (c: number) => (c / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
const alsText = (c: number) => (c ? (c / 100).toFixed(2).replace(".", ",") : "");
const alsCent = (t: string) => {
  const n = Math.round(Number(t.trim().replace(/\s|€/g, "").replace(/\./g, "").replace(",", ".")) * 100);
  return Number.isFinite(n) ? n : 0;
};

// Angebot vor dem Versand anpassen: Zeilen ziehen oder mit Pfeilen verschieben, Texte und Beträge ändern.
export function AngebotEditor({ dokumentId, eintragId, start, speichern }: { dokumentId: number; eintragId: number; start: Start; speichern: (f: FormData) => void }) {
  const [pos, setPos] = useState<(Position & { k: number; e: string; m: string })[]>(() => start.positionen.map((p, i) => ({ ...p, k: i, e: alsText(p.einmalig), m: alsText(p.monatlich) })));
  const [einleitung, setEinleitung] = useState(start.einleitung);
  const [anmerkungen, setAnmerkungen] = useState(start.anmerkungen);
  const [ziehe, setZiehe] = useState<number | null>(null);
  const [html, setHtml] = useState("");
  const naechster = useRef(start.positionen.length);

  const daten = { positionen: pos.map((p) => ({ text: p.text, einmalig: alsCent(p.e), monatlich: alsCent(p.m), hinweis: p.hinweis })), einleitung, anmerkungen };
  const json = JSON.stringify(daten);
  const summeE = daten.positionen.reduce((s, p) => s + p.einmalig, 0);
  const summeM = daten.positionen.reduce((s, p) => s + p.monatlich, 0);

  useEffect(() => {
    const t = setTimeout(async () => {
      const r = await fetch(`/dokument/${dokumentId}/vorschau`, { method: "POST", body: json });
      if (r.ok) setHtml(await r.text());
    }, 500);
    return () => clearTimeout(t);
  }, [json, dokumentId]);

  const aendern = (i: number, feld: "text" | "e" | "m" | "hinweis", wert: string) => setPos((l) => l.map((p, j) => (j === i ? { ...p, [feld]: wert } : p)));
  const verschieben = (von: number, nach: number) =>
    setPos((l) => {
      if (nach < 0 || nach >= l.length) return l;
      const neu = [...l];
      const [x] = neu.splice(von, 1);
      neu.splice(nach, 0, x);
      return neu;
    });

  return (
    <div className="raster zwei" style={{ alignItems: "start" }}>
      <form action={speichern} className="karte">
        <h2>Angebot anpassen</h2>
        <input type="hidden" name="id" value={eintragId} />
        <input type="hidden" name="daten" value={json} />
        <label className="feld"><span>Einstieg (erster Absatz)</span><textarea value={einleitung} onChange={(e) => setEinleitung(e.target.value)} style={{ minHeight: 90 }} /></label>

        <div className="feld"><span>Positionen <span className="leise klein">(ziehen oder mit ↑ ↓ verschieben)</span></span></div>
        <ol className="positionen">
          {pos.map((p, i) => (
            <li
              key={p.k}
              draggable
              onDragStart={() => setZiehe(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => { if (ziehe !== null) verschieben(ziehe, i); setZiehe(null); }}
              className={ziehe === i ? "zieht" : ""}
            >
              <div className="griff" aria-hidden="true">⋮⋮</div>
              <div className="felder">
                <input aria-label={`Bezeichnung Position ${i + 1}`} value={p.text} onChange={(e) => aendern(i, "text", e.target.value)} />
                <div className="betraege">
                  <label><span className="leise klein">Einmalig €</span><input inputMode="decimal" value={p.e} onChange={(e) => aendern(i, "e", e.target.value)} placeholder="0,00" /></label>
                  <label><span className="leise klein">Monatlich €</span><input inputMode="decimal" value={p.m} onChange={(e) => aendern(i, "m", e.target.value)} placeholder="0,00" /></label>
                </div>
                <input aria-label={`Hinweis Position ${i + 1}`} className="klein" value={p.hinweis ?? ""} onChange={(e) => aendern(i, "hinweis", e.target.value)} placeholder="Hinweis (optional), z. B. im Paket enthalten" />
              </div>
              <div className="knoepfe">
                <button type="button" className="knopf klein" onClick={() => verschieben(i, i - 1)} disabled={i === 0} aria-label="nach oben">↑</button>
                <button type="button" className="knopf klein" onClick={() => verschieben(i, i + 1)} disabled={i === pos.length - 1} aria-label="nach unten">↓</button>
                <button type="button" className="knopf klein gefahr" onClick={() => setPos((l) => l.filter((_, j) => j !== i))} aria-label="Position entfernen" disabled={pos.length === 1}>×</button>
              </div>
            </li>
          ))}
        </ol>
        <button type="button" className="knopf klein" onClick={() => setPos((l) => [...l, { text: "", einmalig: 0, monatlich: 0, k: naechster.current++, e: "", m: "" }])}>+ Position hinzufügen</button>

        <p className="abstand">Summe netto: <b className="mono">{euro(summeE)}</b> einmalig · <b className="mono">{euro(summeM)}</b> im Monat</p>
        <label className="feld"><span>Anmerkungen (erscheinen im PDF)</span><textarea value={anmerkungen} onChange={(e) => setAnmerkungen(e.target.value)} style={{ minHeight: 90 }} placeholder="z. B. Fotoshooting am 12.11. vereinbart. Logo liefert Ihr Grafiker." /></label>
        <button className="knopf">Änderungen übernehmen</button>
        <p className="leise klein" style={{ marginTop: 8 }}>Danach läuft die Qualitätskontrolle neu, und das Angebot muss wieder freigegeben werden.</p>
      </form>
      <section>
        <iframe className="vorschau" style={{ height: 900 }} srcDoc={html} title="Live-Vorschau des Angebots" />
        <p className="leise klein">Live-Vorschau, noch nicht gespeichert.</p>
      </section>
    </div>
  );
}
