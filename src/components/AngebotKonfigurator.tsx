"use client";
import { useMemo, useState } from "react";
import { AUSBAUSTUFEN, berechne, laufzeitSumme, type Auswahl, type Katalog } from "@/lib/katalog";
import { PaketKey, euro, UST } from "@/lib/pakete";

// Angebot live beim Kunden zusammenstellen (Baukasten): 1. Webauftritt, 2. Module, 3. Zusatzmodule.
// Der Katalog kommt vom Server (Stammdaten), damit Browser und Server mit denselben Preisen rechnen.
const betrag = (t: string) => (t ? Math.round(Number(t.replace(/\./g, "").replace(",", ".")) * 100) || 0 : 0);

export function AngebotKonfigurator({ gewerk, startPaket, katalog }: { gewerk: string; startPaket: PaketKey; katalog: Katalog }) {
  const pakete = (Object.keys(katalog.pakete) as PaketKey[]).filter((k) => katalog.pakete[k].aktiv !== false);
  const MODULE = katalog.module.filter((m) => m.aktiv !== false);
  const ZUSAETZE = katalog.zusaetze.filter((z) => z.aktiv !== false);
  const PAKETE = katalog.pakete;
  const [paket, setPaket] = useState<PaketKey>(startPaket);
  const [module, setModule] = useState<string[]>([]);
  const [zusaetze, setZusaetze] = useState<string[]>([]);
  const [pilot, setPilot] = useState(false);
  const [ind, setInd] = useState({ einmalig: "", monatlich: "", text: "" });
  const [anrechnen, setAnrechnen] = useState(false);
  const umschalten = (liste: string[], setze: (l: string[]) => void, key: string) => setze(liste.includes(key) ? liste.filter((k) => k !== key) : [...liste, key]);
  const auswahl: Auswahl = { paket, module, zusaetze, pilot, individuell: { einmalig: betrag(ind.einmalig), monatlich: betrag(ind.monatlich), text: ind.text }, prozessCheckAnrechnen: anrechnen };
  const r = useMemo(() => berechne(auswahl, katalog), [paket, module, zusaetze, pilot, ind, anrechnen]); // eslint-disable-line react-hooks/exhaustive-deps
  const summe = laufzeitSumme(r.einmalig, r.monatlich);
  const stufe = (a: (typeof AUSBAUSTUFEN)[number]["auswahl"]) => {
    setPaket(a.paket);
    setModule([...a.module]);
    setZusaetze([...a.zusaetze]);
  };
  const gewaehlt = { borderColor: "var(--akzent)" };

  return (
    <div className="raster zwei" style={{ alignItems: "start" }}>
      <div>
        <section className="karte">
          <h2>Schnellwahl: Ausbaustufen</h2>
          <div className="knopfreihe">
            {AUSBAUSTUFEN.map((s) => <button key={s.nr} type="button" className="knopf klein" onClick={() => stufe(s.auswahl)}>{s.nr}. {s.name}</button>)}
          </div>
          <p className="leise klein" style={{ marginTop: 8 }}>Setzt Webauftritt, Module und Zusatzmodule. Danach frei anpassen.</p>
        </section>

        <section className="karte">
          <h2>1. Webauftritt</h2>
          <div className="raster" style={{ gap: 8 }}>
            {pakete.map((k) => (
              <label key={k} className="haken" style={paket === k ? gewaehlt : undefined}>
                <input type="radio" name="paket" value={k} checked={paket === k} onChange={() => setPaket(k)} />
                <span>
                  <b>{PAKETE[k].name}</b> <span className="mono klein">{euro(PAKETE[k].einmalig)} + {euro(PAKETE[k].monatlich)}/Monat</span>
                  <br /><span className="leise klein">{PAKETE[k].problem}</span>
                  <br /><span className="leise klein">Online {PAKETE[k].wochen} Wochen nach Erhalt der Inhalte</span>
                </span>
              </label>
            ))}
          </div>
        </section>

        <section className="karte">
          <h2>2. Module</h2>
          <div className="raster" style={{ gap: 8 }}>
            {MODULE.map((m) => (
              <label key={m.key} className="haken" style={module.includes(m.key) ? gewaehlt : undefined}>
                <input type="checkbox" name="module" value={m.key} checked={module.includes(m.key)} onChange={() => umschalten(module, setModule, m.key)} />
                <span>
                  <b>{m.name}</b> <span className="leise klein">{m.stufe === 2 ? "· Prozess-Check Pflicht" : ""}{m.nurFuer ? ` · ${m.nurFuer}` : ""}</span>
                  <br /><span className="leise klein">{m.problem ?? m.text}</span>
                  <br /><span className="mono klein">{m.einmalig === null ? "Preis individuell" : `${euro(m.einmalig)} + ${euro(m.monatlich)}/Monat`}</span>
                </span>
              </label>
            ))}
          </div>
          {MODULE.some((m) => m.pilot && module.includes(m.key)) ? (
            <label className="haken abstand">
              <input type="checkbox" name="pilot" value="ja" checked={pilot} onChange={() => setPilot(!pilot)} />
              <span><b>Pilotpreis Kundenmanagement</b><br /><span className="leise klein">{MODULE.find((m) => m.pilot)?.pilot?.hinweis}</span></span>
            </label>
          ) : null}
          {gewerk !== "Kfz" && gewerk !== "SHK" && gewerk !== "Elektro" && module.includes("kundenmanagement") ? <div className="hinweis">Branchenvorlagen fürs Kundenmanagement gibt es für Kfz und SHK/Elektro.</div> : null}
          <p className="leise klein" style={{ marginTop: 12 }}>Preise und Texte pflegst du unter Stammdaten → Katalog.</p>
        </section>

        <section className="karte">
          <h2>3. Zusatzmodule und Vorab</h2>
          <div className="raster" style={{ gap: 8 }}>
            {ZUSAETZE.map((z) => (
              <label key={z.key} className="haken" style={zusaetze.includes(z.key) ? gewaehlt : undefined}>
                <input type="checkbox" name="zusaetze" value={z.key} checked={zusaetze.includes(z.key)} onChange={() => umschalten(zusaetze, setZusaetze, z.key)} />
                <span><b>{z.name}</b>{z.text ? <><br /><span className="leise klein">{z.text}</span></> : null}<br /><span className="mono klein">{z.individuell ? "Festpreis nach Prozess-Check" : `${z.einmalig ? euro(z.einmalig) : ""}${z.einmalig && z.monatlich ? " + " : ""}${z.monatlich ? `${euro(z.monatlich)}/Monat` : ""}`}</span></span>
              </label>
            ))}
            <label className="haken">
              <input type="checkbox" name="prozessCheckAnrechnen" value="ja" checked={anrechnen} onChange={() => setAnrechnen(!anrechnen)} />
              <span><b>Bezahlten Prozess-Check anrechnen</b><br /><span className="leise klein">wenn der Auftrag innerhalb von 60 Tagen kommt</span></span>
            </label>
          </div>
          {ZUSAETZE.some((z) => z.individuell && zusaetze.includes(z.key)) ? (
            <div className="raster drei abstand">
              <label className="feld"><span>Individuelles Modul: was</span><input name="individuellText" value={ind.text} onChange={(e) => setInd({ ...ind, text: e.target.value })} placeholder="z. B. Anbindung Werkstattsoftware" /></label>
              <label className="feld"><span>Festpreis einmalig (€)</span><input name="individuellEinmalig" inputMode="decimal" value={ind.einmalig} onChange={(e) => setInd({ ...ind, einmalig: e.target.value })} placeholder="z. B. 1.700" /></label>
              <label className="feld"><span>Monatsbeitrag (€)</span><input name="individuellMonatlich" inputMode="decimal" value={ind.monatlich} onChange={(e) => setInd({ ...ind, monatlich: e.target.value })} placeholder="z. B. 50" /></label>
            </div>
          ) : null}
        </section>
      </div>

      <aside style={{ position: "sticky", top: 16 }}>
        <section className="karte">
          <h2>Angebot</h2>
          <div className="raster zwei" style={{ gap: 8, marginBottom: 12 }}>
            <div className="kennzahl"><div className="wert">{euro(r.einmalig)}</div><div className="name">einmalig netto</div></div>
            <div className="kennzahl"><div className="wert">{euro(r.monatlich)}</div><div className="name">Monatsbeitrag netto</div></div>
          </div>
          <p className="klein">Gesamt {summe.monate} Monate: <b className="mono">{euro(summe.gesamt)}</b> · Ø <b className="mono">{euro(summe.schnitt)}</b> im Monat</p>
          <table className="tabelle">
            <thead><tr><th>Baustein</th><th className="zahl">Einmalig</th><th className="zahl">Monatl.</th></tr></thead>
            <tbody>
              {r.positionen.map((x) => (
                <tr key={x.text}><td className="klein">{x.text}</td><td className="zahl klein">{x.einmalig ? euro(x.einmalig) : "–"}</td><td className="zahl klein">{x.monatlich ? euro(x.monatlich) : "–"}</td></tr>
              ))}
              <tr><td className="leise">Brutto</td><td className="zahl leise">{euro(Math.round(r.einmalig * (1 + UST)))}</td><td className="zahl leise">{euro(Math.round(r.monatlich * (1 + UST)))}</td></tr>
            </tbody>
          </table>
          <p className="klein" style={{ marginTop: 12 }}>Erste Rate bei Unterschrift (50 %): <b className="mono">{euro(Math.round((r.einmalig / 2) * (1 + UST)))}</b> brutto, zweite beim Livegang.</p>
          {r.hinweise.length ? <div className="hinweis"><ul>{r.hinweise.map((h) => <li key={h}>{h}</li>)}</ul></div> : null}
          <label className="feld abstand"><span>Persönlicher Einstieg (optional)</span><textarea name="einleitung" style={{ minHeight: 90 }} placeholder="z. B. vielen Dank für das gute Gespräch heute. Wie besprochen …" /></label>
          <button className="knopf haupt" style={{ width: "100%" }}>Angebot erstellen und prüfen</button>
          <p className="leise klein" style={{ marginTop: 8 }}>Danach läuft die Qualitätskontrolle. Mit deiner Freigabe geht das Angebot an den Kunden.</p>
        </section>
      </aside>
    </div>
  );
}
