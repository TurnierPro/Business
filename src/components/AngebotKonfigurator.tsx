"use client";
import { useMemo, useState } from "react";
import { berechne, type Auswahl, type Katalog } from "@/lib/katalog";
import { PaketKey, euro, UST } from "@/lib/pakete";

// Angebot live beim Kunden zusammenstellen: Preis rechnet sofort mit.
// Der Katalog kommt vom Server (Stammdaten), damit Browser und Server mit denselben Preisen rechnen.
export function AngebotKonfigurator({ gewerk, startPaket, katalog }: { gewerk: string; startPaket: PaketKey; katalog: Katalog }) {
  const pakete = (Object.keys(katalog.pakete) as PaketKey[]).filter((k) => katalog.pakete[k].aktiv !== false);
  const MODULE = katalog.module.filter((m) => m.aktiv !== false);
  const ZUSAETZE = katalog.zusaetze.filter((z) => z.aktiv !== false);
  const PAKETE = katalog.pakete;
  const [paket, setPaket] = useState<PaketKey>(startPaket);
  const [module, setModule] = useState<string[]>([]);
  const [zusaetze, setZusaetze] = useState<string[]>([]);
  const [preis8, setPreis8] = useState("");
  const [anrechnen, setAnrechnen] = useState(false);
  const umschalten = (liste: string[], setze: (l: string[]) => void, key: string) => setze(liste.includes(key) ? liste.filter((k) => k !== key) : [...liste, key]);
  const auswahl: Auswahl = { paket, module, zusaetze, preisModul8: preis8 ? Math.round(Number(preis8.replace(/\./g, "").replace(",", ".")) * 100) : undefined, prozessCheckAnrechnen: anrechnen };
  const r = useMemo(() => berechne(auswahl, katalog), [paket, module, zusaetze, preis8, anrechnen]); // eslint-disable-line react-hooks/exhaustive-deps
  const individuell = MODULE.find((m) => m.einmalig === null && module.includes(m.key));

  return (
    <div className="raster zwei" style={{ alignItems: "start" }}>
      <div>
        <section className="karte">
          <h2>1. Paket</h2>
          <div className="raster" style={{ gap: 8 }}>
            {pakete.map((k) => (
              <label key={k} className="haken" style={paket === k ? { borderColor: "var(--akzent)" } : undefined}>
                <input type="radio" name="paket" value={k} checked={paket === k} onChange={() => setPaket(k)} />
                <span><b>{PAKETE[k].name}</b><br /><span className="leise klein mono">{euro(PAKETE[k].einmalig)} + {euro(PAKETE[k].monatlich)}/Monat</span></span>
              </label>
            ))}
          </div>
        </section>

        <section className="karte">
          <h2>2. Entlastungs-Module {PAKETE[paket]?.inklusiveModule ? <span className="leise klein">({PAKETE[paket].inklusiveModule} im Paket enthalten)</span> : null}</h2>
          <div className="raster" style={{ gap: 8 }}>
            {MODULE.map((m) => (
              <label key={m.key} className="haken" style={module.includes(m.key) ? { borderColor: "var(--akzent)" } : undefined}>
                <input type="checkbox" name="module" value={m.key} checked={module.includes(m.key)} onChange={() => umschalten(module, setModule, m.key)} />
                <span>
                  <b>{m.nr}. {m.name}</b> <span className="leise klein">{m.stufe === 2 ? "· nach Prozess-Check" : ""}{m.nurFuer ? ` · ${m.nurFuer}` : ""}</span>
                  <br /><span className="leise klein">{m.text}</span>
                  <br /><span className="mono klein">{m.einmalig === null ? "Preis individuell" : `${euro(m.einmalig)} + ${euro(m.monatlich)}/Monat`}{m.hinweis && m.einmalig !== null ? ` · ${m.hinweis}` : ""}</span>
                </span>
              </label>
            ))}
          </div>
          {individuell ? (
            <label className="feld abstand"><span>Preis Modul {individuell.nr} (einmalig, netto, €)</span><input name="preisModul8" inputMode="decimal" value={preis8} onChange={(e) => setPreis8(e.target.value)} placeholder="z. B. 1.500" /></label>
          ) : null}
          {gewerk !== "Kfz" && module.includes("m6") ? <div className="hinweis">Modul 6 ist für Kfz-Werkstätten gedacht.</div> : null}
          <p className="leise klein" style={{ marginTop: 12 }}>Preise pflegst du unter Stammdaten.</p>
        </section>

        <section className="karte">
          <h2>3. Zusatzleistungen</h2>
          <div className="raster" style={{ gap: 8 }}>
            {ZUSAETZE.map((z) => (
              <label key={z.key} className="haken" style={zusaetze.includes(z.key) ? { borderColor: "var(--akzent)" } : undefined}>
                <input type="checkbox" name="zusaetze" value={z.key} checked={zusaetze.includes(z.key)} onChange={() => umschalten(zusaetze, setZusaetze, z.key)} />
                <span><b>{z.name}</b><br /><span className="mono klein">{z.einmalig ? euro(z.einmalig) : ""}{z.einmalig && z.monatlich ? " + " : ""}{z.monatlich ? `${euro(z.monatlich)}/Monat` : ""}</span></span>
              </label>
            ))}
            <label className="haken">
              <input type="checkbox" name="prozessCheckAnrechnen" value="ja" checked={anrechnen} onChange={() => setAnrechnen(!anrechnen)} />
              <span><b>Bezahlten Prozess-Check anrechnen</b><br /><span className="leise klein">wenn der Auftrag innerhalb von 60 Tagen kommt</span></span>
            </label>
          </div>
        </section>
      </div>

      <aside style={{ position: "sticky", top: 16 }}>
        <section className="karte">
          <h2>Angebot</h2>
          <table className="tabelle">
            <thead><tr><th>Position</th><th className="zahl">Einmalig</th><th className="zahl">Monatl.</th></tr></thead>
            <tbody>
              {r.positionen.map((x) => (
                <tr key={x.text}><td className="klein">{x.text}{x.hinweis ? <div className="leise">{x.hinweis}</div> : null}</td><td className="zahl klein">{x.einmalig ? euro(x.einmalig) : "–"}</td><td className="zahl klein">{x.monatlich ? euro(x.monatlich) : "–"}</td></tr>
              ))}
              <tr><td><b>Netto</b></td><td className="zahl"><b>{euro(r.einmalig)}</b></td><td className="zahl"><b>{euro(r.monatlich)}</b></td></tr>
              <tr><td className="leise">Brutto</td><td className="zahl leise">{euro(Math.round(r.einmalig * (1 + UST)))}</td><td className="zahl leise">{euro(Math.round(r.monatlich * (1 + UST)))}</td></tr>
            </tbody>
          </table>
          <p className="klein" style={{ marginTop: 12 }}>Anzahlung bei Annahme: <b className="mono">{euro(Math.round((r.einmalig / 2) * (1 + UST)))}</b> brutto</p>
          {r.hinweise.length ? <div className="hinweis"><ul>{r.hinweise.map((h) => <li key={h}>{h}</li>)}</ul></div> : null}
          <label className="feld abstand"><span>Persönlicher Einstieg (optional)</span><textarea name="einleitung" style={{ minHeight: 90 }} placeholder="z. B. vielen Dank für das gute Gespräch heute. Wie besprochen …" /></label>
          <button className="knopf haupt" style={{ width: "100%" }}>Angebot erstellen und prüfen</button>
          <p className="leise klein" style={{ marginTop: 8 }}>Danach läuft die Qualitätskontrolle. Mit deiner Freigabe geht das Angebot an den Kunden.</p>
        </section>
      </aside>
    </div>
  );
}
