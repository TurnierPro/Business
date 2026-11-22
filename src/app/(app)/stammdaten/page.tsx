import { brauchtBenutzer, darf } from "@/lib/auth";
import { geaendert, katalogLaden, paketDaten } from "@/lib/katalog-db";
import { euro, type PaketKey } from "@/lib/pakete";
import { AufEinenBlick, SeitenKopf, SeitenReiter, reiterWahl } from "@/components/Seite";
import { LAUFZEIT_MONATE } from "@/lib/recht";
import Link from "next/link";
import { katalogZuruecksetzen, modulSpeichern, paketSpeichern, zusatzSpeichern } from "../aktionen";

export const metadata = { title: "Katalog" };

const eu = (cent: number | null) => (cent === null ? "" : (cent / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

function Abweichung({ an }: { an: boolean }) {
  return an ? <span className="marke-klein" style={{ borderColor: "var(--akzent)", color: "var(--akzent)" }}>geändert</span> : <span className="marke-klein">Werkseinstellung</span>;
}

function Zuruecksetzen({ art, k }: { art: string; k: string }) {
  return <form action={katalogZuruecksetzen}><input type="hidden" name="art" value={art} /><input type="hidden" name="key" value={k} /><button className="knopf klein">Zurücksetzen</button></form>;
}

export default async function Stammdaten({ searchParams }: { searchParams: Promise<{ reiter?: string }> }) {
  const ich = await brauchtBenutzer();
  const admin = darf(ich, "verwalten");
  const k = await katalogLaden();
  const anders = await geaendert();
  const pakete = (Object.keys(k.pakete) as PaketKey[]).map((key) => ({ key, ...paketDaten(key) }));
  const zeilen = [
    ...pakete.map((p) => ({ gruppe: "Webauftritt", reiter: "webauftritt", name: p.name, einmalig: p.einmalig as number | null, monatlich: p.monatlich, aktiv: p.aktiv !== false, geaendert: anders.has(`paket:${p.key}`), hinweis: `online ${p.wochen} Wochen nach Inhalten` })),
    ...k.module.map((m) => ({ gruppe: "Module", reiter: "module", name: m.name, einmalig: m.einmalig, monatlich: m.monatlich, aktiv: m.aktiv !== false, geaendert: anders.has(`modul:${m.key}`), hinweis: m.stufe === 2 ? "nach Prozess-Check" : m.pilot ? `Pilot ${euro(m.pilot.einmalig)}` : "" })),
    ...k.zusaetze.map((z) => ({ gruppe: "Zusatzmodule und Vorab", reiter: "zusatz", name: z.name, einmalig: z.individuell ? null : z.einmalig, monatlich: z.monatlich, aktiv: z.aktiv !== false, geaendert: anders.has(`zusatz:${z.key}`), hinweis: z.individuell ? "Festpreis nach Prozess-Check" : "" })),
  ];
  const liste = [
    { key: "uebersicht", name: "Preisübersicht", zahl: zeilen.length },
    { key: "webauftritt", name: "Webauftritt", zahl: pakete.length },
    { key: "module", name: "Module", zahl: k.module.length },
    { key: "zusatz", name: "Zusatzmodule und Vorab", zahl: k.zusaetze.length },
  ];
  const reiter = reiterWahl((await searchParams).reiter, liste);
  return (
    <>
      <SeitenKopf titel="Katalog" text={`Der Baukasten für den Angebots-Konfigurator. Änderungen gelten für neue Angebote; verschickte Angebote bleiben unverändert.${admin ? "" : " Nur Admins können ändern."}`} />
      <AufEinenBlick werte={[
        { wert: pakete.length, name: "Webauftritte", href: "/stammdaten?reiter=webauftritt" },
        { wert: k.module.length, name: "Module", href: "/stammdaten?reiter=module" },
        { wert: k.zusaetze.length, name: "Zusatzmodule und Vorab", href: "/stammdaten?reiter=zusatz" },
        { wert: anders.size, name: "von der Werkseinstellung geändert", ton: anders.size ? "warten" : "ok" },
        { wert: zeilen.filter((z) => !z.aktiv).length, name: "im Konfigurator ausgeblendet" },
      ]} />
      <SeitenReiter basis="/stammdaten" aktiv={reiter} liste={liste} />

      {reiter === "uebersicht" ? (
        <section className="karte">
          <table className="tabelle">
            <thead><tr><th>Baustein</th><th className="zahl">Einmalig</th><th className="zahl">Monatlich</th><th className="zahl weg-mobil">{LAUFZEIT_MONATE} Monate gesamt</th><th className="weg-mobil">Hinweis</th><th>Stand</th></tr></thead>
            {["Webauftritt", "Module", "Zusatzmodule und Vorab"].map((g) => (
              <tbody key={g}>
                <tr><th colSpan={6} className="gruppe-titel" style={{ paddingTop: 16 }}>{g}</th></tr>
                {zeilen.filter((z) => z.gruppe === g).map((z) => (
                  <tr key={z.name} className={z.aktiv ? undefined : "leise"}>
                    <td><Link href={`/stammdaten?reiter=${z.reiter}`}>{z.name}</Link></td>
                    <td className="zahl">{z.einmalig === null ? "individuell" : euro(z.einmalig)}</td>
                    <td className="zahl">{z.monatlich ? euro(z.monatlich) : "–"}</td>
                    <td className="zahl weg-mobil leise">{z.einmalig === null ? "–" : euro(z.einmalig + LAUFZEIT_MONATE * z.monatlich)}</td>
                    <td className="weg-mobil leise klein">{z.hinweis}</td>
                    <td>{!z.aktiv ? <span className="status">ausgeblendet</span> : z.geaendert ? <span className="status warten">geändert</span> : <span className="status ok">Werkseinstellung</span>}</td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
          <p className="leise klein" style={{ marginTop: 8 }}>Alle Preise netto. Bearbeiten: Baustein anklicken oder Reiter oben wählen.</p>
        </section>
      ) : null}

      {reiter === "webauftritt" ? (
      <section className="katalog-raster">
          {(Object.keys(k.pakete) as PaketKey[]).map((key) => {
            const p = paketDaten(key);
            return (
              <details key={key} className="zeile-aufklappen katalog-karte">
                <summary><span><b>{p.name}</b> {p.aktiv === false ? <span className="status">ausgeblendet</span> : null}<br /><span className="mono klein leise">{euro(p.einmalig)} + {euro(p.monatlich)}/Monat · online {p.wochen} Wochen nach Inhalten</span><span className="problem">{p.problem}</span><ul className="punkte">{p.inhalt.map((x) => <li key={x}>{x}</li>)}</ul></span><Abweichung an={anders.has(`paket:${key}`)} /></summary>
                <form action={paketSpeichern} className="inhalt">
                  <fieldset disabled={!admin} style={{ border: 0, padding: 0, margin: 0 }}>
                    <input type="hidden" name="key" value={key} />
                    <div className="raster drei">
                      <label className="feld"><span>Name</span><input name="name" defaultValue={p.name} required maxLength={80} /></label>
                      <label className="feld"><span>Einmalig netto (€)</span><input name="einmalig" inputMode="decimal" defaultValue={eu(p.einmalig)} required /></label>
                      <label className="feld"><span>Monatlich netto (€)</span><input name="monatlich" inputMode="decimal" defaultValue={eu(p.monatlich)} required /></label>
                      <label className="feld"><span>Wochen bis online</span><input name="wochen" type="number" min={0} max={52} defaultValue={p.wochen} /></label>
                      <label className="feld"><span>Änderungen im Monat (Min.)</span><input name="aenderungsMinuten" type="number" min={0} max={600} defaultValue={p.aenderungsMinuten} /></label>
                      <label className="feld"><span>Ziel-Stunden Lieferung</span><input name="zielStunden" type="number" min={0} max={500} defaultValue={p.zielStunden} /></label>
                    </div>
                    <label className="feld"><span>Das Problem (ein Satz aus Sicht des Betriebs)</span><input name="problem" defaultValue={p.problem} required maxLength={300} /></label>
                    <div className="raster zwei">
                      <label className="feld"><span>Wir lösen das mit … (genau fünf Punkte, eine Zeile je Punkt)</span><textarea name="inhalt" rows={6} defaultValue={p.inhalt.join("\n")} /></label>
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
      {reiter === "module" ? (
      <section className="katalog-raster">
          {[...k.module, null].map((m) => (
            <details key={m?.key ?? "neu"} className="zeile-aufklappen katalog-karte">
              <summary>{m ? <><span><b>{m.name}</b> {m.aktiv === false ? <span className="status">ausgeblendet</span> : null}<br /><span className="mono klein leise">{m.einmalig === null ? "Preis individuell" : `${euro(m.einmalig)} + ${euro(m.monatlich)}/Monat`}{m.stufe === 2 ? " · nach Prozess-Check" : ""}</span>{m.problem ? <span className="problem">{m.problem}</span> : null}{m.punkte?.length ? <ul className="punkte">{m.punkte.map((x) => <li key={x}>{x}</li>)}</ul> : null}</span><Abweichung an={anders.has(`modul:${m.key}`)} /></> : <span className="akzent">+ Neues Modul anlegen</span>}</summary>
              <form action={modulSpeichern} className="inhalt">
                <fieldset disabled={!admin} style={{ border: 0, padding: 0, margin: 0 }}>
                  <input type="hidden" name="key" value={m?.key ?? ""} />
                  <div className="raster zwei">
                    <label className="feld"><span>Name</span><input name="name" defaultValue={m?.name} required maxLength={80} /></label>
                    <label className="feld"><span>Nur für (optional)</span><input name="nurFuer" defaultValue={m?.nurFuer} placeholder="z. B. Kfz" /></label>
                  </div>
                  <label className="feld"><span>Kurzbeschreibung (Konfigurator)</span><input name="text" defaultValue={m?.text} required maxLength={300} /></label>
                  <label className="feld"><span>Das Problem (ein Satz aus Sicht des Betriebs)</span><input name="problem" defaultValue={m?.problem} maxLength={300} /></label>
                  <label className="feld"><span>Wir lösen das mit … (genau fünf Punkte, eine Zeile je Punkt)</span><textarea name="punkte" rows={5} defaultValue={m?.punkte?.join("\n")} /></label>
                  <div className="raster drei">
                    <label className="feld"><span>Einmalig netto (€)</span><input name="einmalig" inputMode="decimal" defaultValue={m ? eu(m.einmalig) : ""} placeholder="leer = individuell" /></label>
                    <label className="feld"><span>Monatlich netto (€)</span><input name="monatlich" inputMode="decimal" defaultValue={m ? eu(m.monatlich) : ""} required /></label>
                    <label className="feld"><span>Voraussetzung</span><select name="stufe" defaultValue={String(m?.stufe ?? 1)}><option value="1">keine</option><option value="2">Prozess-Check</option></select></label>
                  </div>
                  <label className="feld"><span>Hinweis im Angebot (optional)</span><input name="hinweis" defaultValue={m?.hinweis} placeholder="z. B. zzgl. WhatsApp-Gebühren" /></label>
                  {m?.pilot ? <p className="leise klein">Pilotpreis: {euro(m.pilot.einmalig)} einmalig. {m.pilot.hinweis}</p> : null}
                  <label className="haken" style={{ marginBottom: 12 }}><input type="checkbox" name="aktiv" value="ja" defaultChecked={m?.aktiv !== false} /><span>Im Konfigurator anbieten</span></label>
                  <button className="knopf">{m ? "Speichern" : "Anlegen"}</button>
                </fieldset>
              </form>
              {admin && m && anders.has(`modul:${m.key}`) ? <div className="inhalt" style={{ paddingTop: 0 }}><Zuruecksetzen art="modul" k={m.key} /></div> : null}
            </details>
          ))}
      </section>

      ) : null}
      {reiter === "zusatz" ? (
      <section className="katalog-raster">
          {[...k.zusaetze, null].map((z) => (
            <details key={z?.key ?? "neu"} className="zeile-aufklappen katalog-karte">
              <summary>{z ? <><span><b>{z.name}</b> {z.aktiv === false ? <span className="status">ausgeblendet</span> : null}<br /><span className="mono klein leise">{z.individuell ? "Festpreis nach Prozess-Check" : `${euro(z.einmalig)}${z.monatlich ? ` + ${euro(z.monatlich)}/Monat` : ""}`}</span>{z.text ? <span className="problem">{z.text}</span> : null}</span><Abweichung an={anders.has(`zusatz:${z.key}`)} /></> : <span className="akzent">+ Neues Zusatzmodul anlegen</span>}</summary>
              <form action={zusatzSpeichern} className="inhalt">
                <fieldset disabled={!admin} style={{ border: 0, padding: 0, margin: 0 }}>
                  <input type="hidden" name="key" value={z?.key ?? ""} />
                  <div className="raster drei">
                    <label className="feld"><span>Name</span><input name="name" defaultValue={z?.name} required maxLength={80} /></label>
                    <label className="feld"><span>Einmalig netto (€)</span><input name="einmalig" inputMode="decimal" defaultValue={z ? eu(z.einmalig) : ""} required /></label>
                    <label className="feld"><span>Monatlich netto (€)</span><input name="monatlich" inputMode="decimal" defaultValue={z ? eu(z.monatlich) : "0"} required /></label>
                  </div>
                  <label className="feld"><span>Beschreibung (eine Zeile)</span><input name="text" defaultValue={z?.text} maxLength={300} /></label>
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
