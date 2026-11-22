"use client";
import { useMemo, useState } from "react";
import { AUSBAUSTUFEN, berechne, laufzeitSumme, type Auswahl, type Katalog } from "@/lib/katalog";
import { PaketKey, euro, UST } from "@/lib/pakete";
import { SendenKnopf } from "./SendenKnopf";

// Angebot live beim Kunden zusammenstellen (Baukasten): 1. Webauftritt, 2. Module, 3. Zusatzmodule.
// Der Katalog kommt vom Server (Stammdaten), damit Browser und Server mit denselben Preisen rechnen.
const betrag = (t: string) => (t ? Math.round(Number(t.replace(/\./g, "").replace(",", ".")) * 100) || 0 : 0);

export function AngebotKonfigurator({ gewerk, startPaket, katalog, email = "", inhaber }: { gewerk: string; startPaket: PaketKey; katalog: Katalog; email?: string; inhaber?: string | null }) {
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
  // Welche Bausteine eine Ausbaustufe wählt, in Klartext (damit „Kunden“ nicht mit „Kundenmanagement“ verwechselt wird)
  const bausteineVon = (a: (typeof AUSBAUSTUFEN)[number]["auswahl"]) =>
    [PAKETE[a.paket]?.name, ...a.module.map((k) => katalog.module.find((m) => m.key === k)?.name ?? k), ...a.zusaetze.map((k) => katalog.zusaetze.find((z) => z.key === k)?.name ?? k)].filter(Boolean).join(" + ");
  const preis = (einmalig: number | null, monatlich: number) => (einmalig === null ? "Preis individuell" : `${euro(einmalig)}${monatlich ? ` + ${euro(monatlich)}/Monat` : ""}`);

  return (
    <div className="angebot-ablauf">
      <nav className="reiter" aria-label="Schnellwahl Ausbaustufen" style={{ alignItems: "center" }}>
        <span className="leise klein" style={{ marginRight: 4 }}>Schnellwahl:</span>
        {AUSBAUSTUFEN.map((s) => <a key={s.nr} href="#webauftritt" role="button" title={bausteineVon(s.auswahl)} onClick={(e) => { e.preventDefault(); stufe(s.auswahl); }}>{s.nr}. {s.name}<span className="leise klein" style={{ display: "block", fontWeight: 400 }}>{bausteineVon(s.auswahl)}</span></a>)}
      </nav>

      <section className="karte" id="webauftritt">
        <h2><span className="nr">1</span> Welcher Webauftritt?</h2>
        <div className="wahl-raster zwei">
          {pakete.map((k) => (
            <label key={k} className={`wahl${paket === k ? " an" : ""}`}>
              <input type="radio" name="paket" value={k} checked={paket === k} onChange={() => setPaket(k)} />
              <span className="wahl-kopf"><b>{PAKETE[k].name}</b><span className="haekchen" aria-hidden="true">{paket === k ? "✓" : ""}</span></span>
              <span className="preis">{preis(PAKETE[k].einmalig, PAKETE[k].monatlich)}</span>
              <span className="leise klein">{PAKETE[k].problem}</span>
              <span className="leise klein">Fertig {PAKETE[k].wochen} Wochen nach Erhalt der Inhalte</span>
            </label>
          ))}
        </div>
      </section>

      <section className="karte">
        <h2><span className="nr">2</span> Welche Module? <span className="leise klein" style={{ fontWeight: 400 }}>keins, eins oder mehrere</span></h2>
        <div className="wahl-raster drei">
          {MODULE.map((m) => (
            <label key={m.key} className={`wahl${module.includes(m.key) ? " an" : ""}`}>
              <input type="checkbox" name="module" value={m.key} checked={module.includes(m.key)} onChange={() => umschalten(module, setModule, m.key)} />
              <span className="wahl-kopf"><b>{m.name}</b><span className="haekchen" aria-hidden="true">{module.includes(m.key) ? "✓" : ""}</span></span>
              <span className="preis">{preis(m.einmalig, m.monatlich)}</span>
              <span className="leise klein">{m.problem ?? m.text}</span>
              {m.stufe === 2 || m.nurFuer ? <span className="klein" style={{ color: "var(--akzent)" }}>{[m.stufe === 2 ? "Prozess-Check Pflicht" : null, m.nurFuer].filter(Boolean).join(" · ")}</span> : null}
            </label>
          ))}
        </div>
        {MODULE.some((m) => m.pilot && module.includes(m.key)) ? (
          <label className="haken abstand">
            <input type="checkbox" name="pilot" value="ja" checked={pilot} onChange={() => setPilot(!pilot)} />
            <span><b>Pilotpreis Kundenmanagement</b><br /><span className="leise klein">{MODULE.find((m) => m.pilot)?.pilot?.hinweis}</span></span>
          </label>
        ) : null}
        {gewerk !== "Kfz" && gewerk !== "SHK" && gewerk !== "Elektro" && module.includes("kundenmanagement") ? <div className="hinweis abstand">Branchenvorlagen fürs Kundenmanagement gibt es für Kfz und SHK/Elektro.</div> : null}
      </section>

      <section className="karte">
        <h2><span className="nr">3</span> Zusatzmodule <span className="leise klein" style={{ fontWeight: 400 }}>optional</span></h2>
        <div className="wahl-raster zwei">
          {ZUSAETZE.map((z) => (
            <label key={z.key} className={`wahl kompakt${zusaetze.includes(z.key) ? " an" : ""}`}>
              <input type="checkbox" name="zusaetze" value={z.key} checked={zusaetze.includes(z.key)} onChange={() => umschalten(zusaetze, setZusaetze, z.key)} />
              <span className="wahl-kopf"><b>{z.name}</b><span className="knopfreihe" style={{ gap: 10 }}><span className="preis">{z.individuell ? "nach Prozess-Check" : preis(z.einmalig || 0, z.monatlich || 0)}</span><span className="haekchen" aria-hidden="true">{zusaetze.includes(z.key) ? "✓" : ""}</span></span></span>
              {z.text ? <span className="leise klein">{z.text}</span> : null}
            </label>
          ))}
          <label className={`wahl kompakt${anrechnen ? " an" : ""}`}>
            <input type="checkbox" name="prozessCheckAnrechnen" value="ja" checked={anrechnen} onChange={() => setAnrechnen(!anrechnen)} />
            <span className="wahl-kopf"><b>Bezahlten Prozess-Check anrechnen</b><span className="haekchen" aria-hidden="true">{anrechnen ? "✓" : ""}</span></span>
            <span className="leise klein">wenn der Auftrag innerhalb von 60 Tagen kommt</span>
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

      <section className="karte" id="pruefen">
        <h2><span className="nr">4</span> Zusammenfassung</h2>
        <div className="raster links-schmal" style={{ gap: 24, alignItems: "start" }}>
          <div>
            <div className="raster zwei" style={{ gap: 10, marginBottom: 12 }}>
              <div className="kennzahl"><div className="wert">{euro(r.einmalig)}</div><div className="name">einmalig netto</div></div>
              <div className="kennzahl"><div className="wert">{euro(r.monatlich)}</div><div className="name">Monatsbeitrag netto</div></div>
            </div>
            <p className="klein">Über {summe.monate} Monate: <b>{euro(summe.gesamt)}</b> netto, im Schnitt <b>{euro(summe.schnitt)}</b> im Monat. Erste Rate bei Unterschrift (50 %): <b>{euro(Math.round((r.einmalig / 2) * (1 + UST)))}</b> brutto, zweite beim Livegang.</p>
          </div>
          <div>
            <table className="tabelle">
              <thead><tr><th>Baustein</th><th className="zahl">Einmalig</th><th className="zahl">Monatlich</th></tr></thead>
              <tbody>
                {r.positionen.map((x) => (
                  <tr key={x.text}><td className="klein">{x.text}</td><td className="zahl klein">{x.einmalig ? euro(x.einmalig) : "–"}</td><td className="zahl klein">{x.monatlich ? euro(x.monatlich) : "–"}</td></tr>
                ))}
                <tr><td className="leise klein">Brutto (mit 19 % USt)</td><td className="zahl leise klein">{euro(Math.round(r.einmalig * (1 + UST)))}</td><td className="zahl leise klein">{euro(Math.round(r.monatlich * (1 + UST)))}</td></tr>
              </tbody>
            </table>
            {r.hinweise.length ? <div className="hinweis" style={{ marginTop: 12 }}><ul>{r.hinweise.map((h) => <li key={h}>{h}</li>)}</ul></div> : null}
          </div>
        </div>
      </section>

      <section className="karte" id="senden">
        <h2><span className="nr">5</span> An wen geht das Angebot?</h2>
        <div className="raster links-schmal" style={{ gap: 24, alignItems: "start" }}>
          <label className="feld"><span>E-Mail-Adresse {inhaber ? `von ${inhaber}` : "des Kunden"}</span><input name="email" type="email" required defaultValue={email} placeholder="name@betrieb.de" /><small>Dorthin gehen Angebot und Link zum Kundenportal.</small></label>
          <label className="feld"><span>Persönlicher Einstieg <em>optional</em></span><textarea name="einleitung" style={{ minHeight: 100 }} placeholder="z. B. vielen Dank für das gute Gespräch heute. Wie besprochen … (leer: Standardtext aus der Angebotsvorlage)" /></label>
        </div>
        <div className="knopfreihe" style={{ marginTop: 4 }}>
          <SendenKnopf text="Angebot erstellen" warten="Angebot und PDF werden erstellt …" />
          <span className="leise klein">Als Nächstes siehst du das fertige Angebot und die E-Mail dazu. Die Qualitätskontrolle prüft beides; erst mit deiner Freigabe geht es an den Kunden.</span>
        </div>
      </section>

      <div className="summenleiste" role="status" aria-live="polite">
        <span><span className="leise klein">einmalig</span> <b>{euro(r.einmalig)}</b></span>
        <span><span className="leise klein">monatlich</span> <b>{euro(r.monatlich)}</b></span>
        <span className="weg-schmal"><span className="leise klein">{summe.monate} Monate</span> <b>{euro(summe.gesamt)}</b></span>
        <button type="button" className="knopf klein" onClick={() => document.getElementById("pruefen")?.scrollIntoView({ behavior: "smooth", block: "start" })}>Zur Zusammenfassung</button>
      </div>
    </div>
  );
}
