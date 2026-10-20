import Link from "next/link";
import { brauchtBenutzer, darf } from "@/lib/auth";
import { geaendert, katalogLaden, paketDaten } from "@/lib/katalog-db";
import { euro, type PaketKey } from "@/lib/pakete";
import { katalogZuruecksetzen, modulSpeichern, paketSpeichern, zusatzSpeichern } from "../aktionen";

export const metadata = { title: "Stammdaten" };

const eu = (cent: number | null) => (cent === null ? "" : (cent / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

function Abweichung({ an }: { an: boolean }) {
  return an ? <span className="marke-klein" style={{ borderColor: "var(--akzent)", color: "var(--akzent)" }}>geändert</span> : <span className="marke-klein">Werkseinstellung</span>;
}

function Zuruecksetzen({ art, k }: { art: string; k: string }) {
  return <form action={katalogZuruecksetzen}><input type="hidden" name="art" value={art} /><input type="hidden" name="key" value={k} /><button className="knopf klein">Zurücksetzen</button></form>;
}

export default async function Stammdaten({ searchParams }: { searchParams: Promise<{ bereich?: string }> }) {
  const ich = await brauchtBenutzer();
  const admin = darf(ich, "verwalten");
  const { bereich = "pakete" } = await searchParams;
  const k = await katalogLaden();
  const anders = await geaendert();
  const reiter = [["pakete", "Pakete"], ["module", "KI-Module"], ["zusaetze", "Zusatzleistungen"]];
  return (
    <>
      <div className="kopfzeile"><div><h1>Katalog</h1><p>Pakete, KI-Module und Zusatzleistungen für den Angebots-Konfigurator. Änderungen gelten für neue Angebote; verschickte Angebote bleiben unverändert.{admin ? "" : " Nur Admins können ändern."}</p></div></div>
      <nav className="knopfreihe" aria-label="Katalog" style={{ marginBottom: 16 }}>
        {reiter.map(([key, name]) => <Link key={key} href={`/stammdaten?bereich=${key}`} className="knopf klein" aria-current={bereich === key ? "page" : undefined} style={bereich === key ? { borderColor: "var(--akzent)" } : { color: "var(--leise)" }}>{name}</Link>)}
      </nav>

      {bereich === "pakete" ? (
        <section className="karte" style={{ padding: 0 }}>
          {(Object.keys(k.pakete) as PaketKey[]).map((key) => {
            const p = paketDaten(key);
            return (
              <details key={key} className="zeile-aufklappen">
                <summary><span><b>{p.name}</b> {p.aktiv === false ? <span className="status">ausgeblendet</span> : null}<br /><span className="mono klein leise">{euro(p.einmalig)} + {euro(p.monatlich)}/Monat · {p.wochen} Wochen{p.inklusiveModule ? ` · ${p.inklusiveModule} Module inklusive` : ""}</span></span><Abweichung an={anders.has(`paket:${key}`)} /></summary>
                <form action={paketSpeichern} className="inhalt">
                  <fieldset disabled={!admin} style={{ border: 0, padding: 0, margin: 0 }}>
                    <input type="hidden" name="key" value={key} />
                    <div className="raster drei">
                      <label className="feld"><span>Name</span><input name="name" defaultValue={p.name} required maxLength={80} /></label>
                      <label className="feld"><span>Einmalig netto (€)</span><input name="einmalig" inputMode="decimal" defaultValue={eu(p.einmalig)} required /></label>
                      <label className="feld"><span>Monatlich netto (€)</span><input name="monatlich" inputMode="decimal" defaultValue={eu(p.monatlich)} required /></label>
                      <label className="feld"><span>Wochen bis Livegang</span><input name="wochen" type="number" min={0} max={52} defaultValue={p.wochen} /></label>
                      <label className="feld"><span>Module inklusive</span><input name="inklusiveModule" type="number" min={0} max={10} defaultValue={p.inklusiveModule ?? 0} /></label>
                      <label className="feld"><span>Änderungen im Monat (Min.)</span><input name="aenderungsMinuten" type="number" min={0} max={600} defaultValue={p.aenderungsMinuten} /></label>
                      <label className="feld"><span>Ziel-Stunden Lieferung</span><input name="zielStunden" type="number" min={0} max={500} defaultValue={p.zielStunden} /></label>
                    </div>
                    <div className="raster zwei">
                      <label className="feld"><span>Enthalten (eine Zeile je Punkt)</span><textarea name="inhalt" rows={6} defaultValue={p.inhalt.join("\n")} /></label>
                      <label className="feld"><span>Nicht enthalten (eine Zeile je Punkt)</span><textarea name="nichtEnthalten" rows={6} defaultValue={p.nichtEnthalten.join("\n")} /></label>
                    </div>
                    <label className="haken" style={{ marginBottom: 12 }}><input type="checkbox" name="aktiv" value="ja" defaultChecked={p.aktiv !== false} /><span>Im Konfigurator anbieten</span></label>
                    <div className="knopfreihe"><button className="knopf">Speichern</button></div>
                  </fieldset>
                </form>
                {admin && anders.has(`paket:${key}`) ? <div className="inhalt" style={{ paddingTop: 0 }}><Zuruecksetzen art="paket" k={key} /></div> : null}
              </details>
            );
          })}
        </section>
      ) : null}

      {bereich === "module" ? (
        <section className="karte" style={{ padding: 0 }}>
          {[...k.module, null].map((m) => (
            <details key={m?.key ?? "neu"} className="zeile-aufklappen">
              <summary>{m ? <><span><b>{m.nr}. {m.name}</b> {m.aktiv === false ? <span className="status">ausgeblendet</span> : null}<br /><span className="mono klein leise">{m.einmalig === null ? "Preis individuell" : `${euro(m.einmalig)} + ${euro(m.monatlich)}/Monat`}{m.stufe === 2 ? " · nach Prozess-Check" : ""}</span></span><Abweichung an={anders.has(`modul:${m.key}`)} /></> : <span className="akzent">+ Neues Modul anlegen</span>}</summary>
              <form action={modulSpeichern} className="inhalt">
                <fieldset disabled={!admin} style={{ border: 0, padding: 0, margin: 0 }}>
                  <input type="hidden" name="key" value={m?.key ?? ""} />
                  <div className="raster zwei">
                    <label className="feld"><span>Name</span><input name="name" defaultValue={m?.name} required maxLength={80} /></label>
                    <label className="feld"><span>Nur für (optional)</span><input name="nurFuer" defaultValue={m?.nurFuer} placeholder="z. B. Kfz" /></label>
                  </div>
                  <label className="feld"><span>Beschreibung</span><input name="text" defaultValue={m?.text} required maxLength={300} /></label>
                  <div className="raster drei">
                    <label className="feld"><span>Einmalig netto (€)</span><input name="einmalig" inputMode="decimal" defaultValue={m ? eu(m.einmalig) : ""} placeholder="leer = individuell" /></label>
                    <label className="feld"><span>Monatlich netto (€)</span><input name="monatlich" inputMode="decimal" defaultValue={m ? eu(m.monatlich) : ""} required /></label>
                    <label className="feld"><span>Voraussetzung</span><select name="stufe" defaultValue={String(m?.stufe ?? 1)}><option value="1">keine</option><option value="2">Prozess-Check</option></select></label>
                  </div>
                  <label className="feld"><span>Hinweis im Angebot (optional)</span><input name="hinweis" defaultValue={m?.hinweis} placeholder="z. B. zzgl. WhatsApp-Gebühren" /></label>
                  {m?.kombi ? <p className="leise klein">Kombi-Preis mit Modul {k.module.find((x) => x.key === m.kombi!.mit)?.nr}: {euro(m.kombi.einmalig)} + {euro(m.kombi.monatlich)}/Monat</p> : null}
                  <label className="haken" style={{ marginBottom: 12 }}><input type="checkbox" name="aktiv" value="ja" defaultChecked={m?.aktiv !== false} /><span>Im Konfigurator anbieten</span></label>
                  <button className="knopf">{m ? "Speichern" : "Anlegen"}</button>
                </fieldset>
              </form>
              {admin && m && anders.has(`modul:${m.key}`) ? <div className="inhalt" style={{ paddingTop: 0 }}><Zuruecksetzen art="modul" k={m.key} /></div> : null}
            </details>
          ))}
        </section>
      ) : null}

      {bereich === "zusaetze" ? (
        <section className="karte" style={{ padding: 0 }}>
          {[...k.zusaetze, null].map((z) => (
            <details key={z?.key ?? "neu"} className="zeile-aufklappen">
              <summary>{z ? <><span><b>{z.name}</b> {z.aktiv === false ? <span className="status">ausgeblendet</span> : null}<br /><span className="mono klein leise">{euro(z.einmalig)}{z.monatlich ? ` + ${euro(z.monatlich)}/Monat` : ""}</span></span><Abweichung an={anders.has(`zusatz:${z.key}`)} /></> : <span className="akzent">+ Neue Zusatzleistung anlegen</span>}</summary>
              <form action={zusatzSpeichern} className="inhalt">
                <fieldset disabled={!admin} style={{ border: 0, padding: 0, margin: 0 }}>
                  <input type="hidden" name="key" value={z?.key ?? ""} />
                  <div className="raster drei">
                    <label className="feld"><span>Name</span><input name="name" defaultValue={z?.name} required maxLength={80} /></label>
                    <label className="feld"><span>Einmalig netto (€)</span><input name="einmalig" inputMode="decimal" defaultValue={z ? eu(z.einmalig) : ""} required /></label>
                    <label className="feld"><span>Monatlich netto (€)</span><input name="monatlich" inputMode="decimal" defaultValue={z ? eu(z.monatlich) : "0"} required /></label>
                  </div>
                  <label className="haken" style={{ marginBottom: 12 }}><input type="checkbox" name="aktiv" value="ja" defaultChecked={z?.aktiv !== false} /><span>Im Konfigurator anbieten</span></label>
                  <button className="knopf">{z ? "Speichern" : "Anlegen"}</button>
                </fieldset>
              </form>
              {admin && z && anders.has(`zusatz:${z.key}`) ? <div className="inhalt" style={{ paddingTop: 0 }}><Zuruecksetzen art="zusatz" k={z.key} /></div> : null}
            </details>
          ))}
        </section>
      ) : null}
    </>
  );
}
