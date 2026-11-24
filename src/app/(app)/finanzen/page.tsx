import Link from "next/link";
import { auswertung, kategorieName, monatName, nachbar, zeitraum } from "@/lib/finanzen";
import { umsatzDiagramm, FARBEN_HELL } from "@/lib/diagramm";
import { euro, PAKETE, PaketKey, UST } from "@/lib/pakete";
import { datum } from "@/lib/format";
import { Status } from "@/components/Status";
import { ausgabeSpeichern, berichtVorbereiten, kostenplanAnpassen, rechnungBezahlt } from "../aktionen";
import { AusgabeFelder } from "@/components/AusgabeFelder";
import { Fortschritt } from "@/components/FinanzReiter";
import { sollIst, sollwerte } from "@/lib/soll";

export const metadata = { title: "Finanzen" };

export default async function Finanzen({ searchParams }: { searchParams: Promise<{ z?: string }> }) {
  // Standard: der laufende Monat (Monatsbasis); Quartal und Jahr wählbar
  const jetzt = new Date();
  const z = zeitraum((await searchParams).z ?? `${jetzt.getFullYear()}-${String(jetzt.getMonth() + 1).padStart(2, "0")}`);
  const jahr = z.von.getFullYear();
  const [a, jahresWerte] = await Promise.all([auswertung(z), z.art === "jahr" ? null : auswertung(zeitraum(String(jahr)))]);
  const jahresverlauf = (jahresWerte ?? a).proMonat;
  const quartal = Math.floor(z.von.getMonth() / 3) + 1;
  const monat = `${jahr}-${String(z.von.getMonth() + 1).padStart(2, "0")}`;
  const wahl = [
    { key: monat, text: "Monat", aktiv: z.art === "monat" },
    { key: `${jahr}-Q${quartal}`, text: "Quartal", aktiv: z.art === "quartal" },
    { key: String(jahr), text: "Jahr", aktiv: z.art === "jahr" },
  ];
  const [soll, si] = await Promise.all([sollwerte(), sollIst()]);
  const planUmsatz = soll.filter((s) => z.monate.includes(s.monat)).reduce((x, s) => x + s.umsatz, 0);
  const planKosten = a.alleKategorien.reduce((x, k) => x + k.plan, 0); // gleicher Plan wie in „Ausgaben nach Kategorie“
  const kacheln = [
    { name: "Umsatz netto", wert: a.umsatz },
    { name: "Ausgaben netto", wert: a.kosten },
    { name: "Ergebnis", wert: a.ergebnis, akzent: true },
    { name: "Offene Forderungen (brutto)", wert: a.offeneForderungen },
    { name: "USt-Zahllast (Ist)", wert: a.ustZahllast },
    { name: "Steuerrücklage 31,5 %", wert: a.steuerruecklage },
  ];

  return (
    <>
      <div className="kopfzeile">
        <div>
          <h1>Finanzen</h1>
          <p>Einnahmen, Ausgaben und Steuern auf einen Blick. Bilanz und Jahresabschluss macht der Steuerberater.</p>
        </div>
        <div className="knopfreihe">
          <a className="knopf" href={`/finanzen-datei/bericht?z=${z.key}`} target="_blank">Bericht als PDF</a>
          <Link className="knopf haupt" href="/finanzen/ausgabe/neu">Beleg hochladen</Link>
        </div>
      </div>

      <section className="karte zeitwahl" aria-label="Zeitraum wählen">
        <div className="knopfreihe" style={{ justifyContent: "space-between" }}>
          <div className="knopfreihe">
            <Link className="knopf klein" href={`/finanzen?z=${nachbar(z, -1)}`} aria-label="Zeitraum davor">←</Link>
            <b style={{ minWidth: 170, textAlign: "center", fontSize: 18 }}>{z.name}</b>
            <Link className="knopf klein" href={`/finanzen?z=${nachbar(z, 1)}`} aria-label="Zeitraum danach">→</Link>
          </div>
          <nav className="reiter" aria-label="Ansicht" style={{ margin: 0 }}>
            {wahl.map((w) => <Link key={w.text} href={`/finanzen?z=${w.key}`} aria-current={w.aktiv ? "page" : undefined}>{w.text}</Link>)}
          </nav>
        </div>
        <nav className="monatsleiste" aria-label={`Monate ${jahr}`}>
          {Array.from({ length: 12 }, (_, i) => {
            const key = `${jahr}-${String(i + 1).padStart(2, "0")}`;
            const werte = jahresverlauf.find((m) => m.monat === key);
            const aktiv = z.art === "monat" && z.monate[0] === key;
            return (
              <Link key={key} href={`/finanzen?z=${key}`} aria-current={aktiv ? "page" : undefined} className={z.monate.includes(key) ? "im" : ""}>
                <span>{monatName(key).slice(0, 3)}</span>
                <span className="mono klein">{werte && (werte.umsatz || werte.ausgaben) ? euro(werte.umsatz - werte.ausgaben).replace(",00", "") : "–"}</span>
              </Link>
            );
          })}
        </nav>
      </section>

      <section className="karte" style={{ marginBottom: 16 }}>
        <div className="kopfzeile" style={{ marginBottom: 8 }}><h2 style={{ margin: 0 }}>Soll und Ist</h2><Link className="klein" href="/stammdaten/ziele">Soll anpassen</Link></div>
        <div className="raster drei">
          {si.zeitraeume.map((t) => (
            <div key={t.name}>
              <p className="klein"><b>{t.name}</b> · Umsatz</p>
              {t.imPlan ? <Fortschritt ist={t.ist.umsatz} ziel={t.soll.umsatz} format={euro} /> : <p className="leise klein">vor dem Planstart (Dezember 2026)</p>}
              {t.imPlan ? <p className="klein leise" style={{ marginTop: 4 }}>Aufträge: <span className="mono">{t.ist.auftraege}</span> von <span className="mono">{t.soll.auftraege}</span></p> : null}
            </div>
          ))}
        </div>
      </section>

      {a.zuPruefen ? <div className="hinweis">{a.zuPruefen} Beleg{a.zuPruefen > 1 ? "e" : ""} vom Beleg-Agenten ausgelesen. Bitte prüfen und bestätigen.</div> : null}

      <div className="raster sechs">
        {kacheln.map((k) => (
          <div key={k.name} className="kennzahl">
            <div className="wert" style={k.akzent ? { color: k.wert < 0 ? "var(--fehler)" : "var(--akzent)" } : undefined}>{euro(k.wert)}</div>
            <div className="name">{k.name}</div>
          </div>
        ))}
      </div>

      {planUmsatz || planKosten ? (
        <section className="karte abstand">
          <div className="kopfzeile" style={{ marginBottom: 8 }}><h2>Soll im gewählten Zeitraum</h2><Link className="klein" href="/finanzen/plan">Plan und Soll</Link></div>
          <div className="raster zwei">
            <div><p className="klein">Umsatz (Soll)</p><Fortschritt ist={a.umsatz} ziel={planUmsatz} format={euro} /></div>
            <div><p className="klein">Ausgaben (Plan je Kategorie)</p><Fortschritt ist={a.kosten} ziel={planKosten} format={euro} /></div>
          </div>
        </section>
      ) : null}

      <section className="karte abstand">
        <h2>Umsatz und Ausgaben je Monat {jahr}</h2>
        <div className="diagramm-rahmen" dangerouslySetInnerHTML={{ __html: umsatzDiagramm(jahresverlauf.map((m) => ({ name: monatName(m.monat), umsatz: m.umsatz, ausgaben: m.ausgaben })), FARBEN_HELL, 1100) }} />
        <details style={{ marginTop: 8 }}>
          <summary className="leise klein" style={{ cursor: "pointer" }}>Als Tabelle</summary>
          <table className="tabelle"><thead><tr><th>Monat</th><th className="zahl">Umsatz</th><th className="zahl">Ausgaben</th><th className="zahl">Ergebnis</th></tr></thead>
            <tbody>{jahresverlauf.map((m) => <tr key={m.monat}><td>{monatName(m.monat)}</td><td className="zahl">{euro(m.umsatz)}</td><td className="zahl">{euro(m.ausgaben)}</td><td className="zahl">{euro(m.umsatz - m.ausgaben)}</td></tr>)}</tbody>
          </table>
        </details>
      </section>

      <section className="karte abstand" id="kategorien">
        <div className="kopfzeile" style={{ marginBottom: 8 }}>
          <div><h2 style={{ margin: 0 }}>Ausgaben nach Kategorie</h2><p className="leise klein" style={{ margin: "4px 0 0" }}>Plan je Monat kannst du direkt ändern. Ist steigt mit jeder erfassten Ausgabe.</p></div>
          <details className="blase">
            <summary className="knopf">+ Ausgabe erfassen</summary>
            <form action={ausgabeSpeichern} className="blase-inhalt">
              <input type="hidden" name="zurueck" value={`/finanzen?z=${z.key}#kategorien`} />
              <AusgabeFelder />
              <button className="knopf">Ausgabe speichern</button>
            </form>
          </details>
        </div>
        <form action={kostenplanAnpassen}>
          <input type="hidden" name="zurueck" value={`/finanzen?z=${z.key}#kategorien`} />
          <table className="tabelle kategorien">
            <thead><tr><th>Kategorie</th><th className="zahl">Plan je Monat (€)</th><th className="zahl weg-mobil">Plan {z.art === "monat" ? "Monat" : z.art === "quartal" ? "Quartal" : "Jahr"}</th><th className="zahl">Ist</th><th className="weg-mobil" style={{ width: "28%" }}>Verbrauch</th></tr></thead>
            <tbody>
              {a.alleKategorien.map((k) => {
                const anteil = k.plan ? Math.min(100, Math.round((k.ist / k.plan) * 100)) : k.ist ? 100 : 0;
                const drueber = k.plan ? k.ist > k.plan : k.ist > 0;
                return (
                  <tr key={k.key} className={!k.plan && !k.ist ? "leise" : undefined}>
                    <td>{k.name}</td>
                    <td className="zahl"><input className="planfeld" name={`plan-${k.key}`} inputMode="decimal" defaultValue={(k.planMonat / 100).toLocaleString("de-DE")} aria-label={`Plan je Monat ${k.name}`} /></td>
                    <td className="zahl weg-mobil leise">{k.plan ? euro(k.plan) : "–"}</td>
                    <td className="zahl">{euro(k.ist)}</td>
                    <td className="weg-mobil">
                      <span className="verbrauch"><span className="portal-balken" aria-hidden="true" style={{ height: 6 }}><span style={drueber ? { width: "100%", background: "var(--fehler)" } : { width: `${anteil}%` }} /></span>
                      <span className={`status ${drueber ? "fehler" : anteil ? "ok" : "warten"}`}>{drueber ? "über Plan" : anteil ? `${anteil} %` : "nichts"}</span></span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot><tr><th>Summe</th><th className="zahl mono">{euro(a.alleKategorien.reduce((x, k) => x + k.planMonat, 0))}</th><th className="zahl weg-mobil mono">{euro(a.alleKategorien.reduce((x, k) => x + k.plan, 0))}</th><th className="zahl mono">{euro(a.alleKategorien.reduce((x, k) => x + k.ist, 0))}</th><th className="weg-mobil" /></tr></tfoot>
          </table>
          <div className="knopfreihe" style={{ marginTop: 12 }}><button className="knopf klein">Plan speichern</button><span className="leise klein">Werkswerte: Fixkosten aus dem Business Case. Nur Admins können den Plan ändern.</span></div>
        </form>
      </section>

      <section className="karte abstand">
        <h2>Angebote im Zeitraum</h2>
        <div className="raster zwei">
          {[
            { titel: "Offen", hinweis: "erstellt, noch nicht unterschrieben", liste: a.angeboteOffen, datumVon: (x: (typeof a.angeboteOffen)[number]) => x.a.erstelltAm },
            { titel: "Angenommen", hinweis: "unterschrieben im Zeitraum", liste: a.angeboteAngenommen, datumVon: (x: (typeof a.angeboteOffen)[number]) => x.a.unterschriebenAm },
          ].map((g) => (
            <div key={g.titel}>
              <p className="klein"><b>{g.titel}</b> · <span className="mono">{g.liste.length}</span> · {g.hinweis}</p>
              {g.liste.length ? (
                <table className="tabelle">
                  <thead><tr><th>Kunde</th><th className="weg-mobil">Datum</th><th className="zahl">Einmalig</th><th className="zahl">Monatlich</th></tr></thead>
                  <tbody>
                    {g.liste.map((x) => (
                      <tr key={x.a.id}>
                        <td><Link href={`/leads/${x.a.betriebId}?reiter=dokumente`}>{x.kunde}</Link><div className="leise klein">{PAKETE[x.a.paket as PaketKey]?.name ?? x.a.paket}</div></td>
                        <td className="weg-mobil mono klein">{datum(g.datumVon(x))}</td>
                        <td className="zahl">{euro(x.a.einmalig)}</td>
                        <td className="zahl">{euro(x.a.monatlich)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot><tr><th>Summe</th><th className="weg-mobil" /><th className="zahl mono">{euro(g.liste.reduce((s, x) => s + x.a.einmalig, 0))}</th><th className="zahl mono">{euro(g.liste.reduce((s, x) => s + x.a.monatlich, 0))}</th></tr></tfoot>
                </table>
              ) : <p className="leise klein">Keine.</p>}
            </div>
          ))}
        </div>
      </section>

      <section className="karte abstand">
        <h2>Umsatzsteuer und Steuerberater</h2>
        <div className="raster drei">
          <div className="kennzahl"><div className="wert">{euro(a.ustEinnahmen)}</div><div className="name">USt eingenommen</div></div>
          <div className="kennzahl"><div className="wert">{euro(a.vorsteuer)}</div><div className="name">Vorsteuer</div></div>
          <div className="kennzahl"><div className="wert">{euro(a.ustZahllast)}</div><div className="name">Zahllast</div></div>
        </div>
        <div className="knopfreihe" style={{ marginTop: 16 }}>
          <a className="knopf klein" href={`/finanzen-datei/export?z=${z.key}&art=einnahmen`}>Einnahmen als CSV</a>
          <a className="knopf klein" href={`/finanzen-datei/export?z=${z.key}&art=ausgaben`}>Ausgaben als CSV</a>
          <form action={berichtVorbereiten}><button className="knopf klein">Bericht an Steuerberater vorbereiten</button></form>
        </div>
        <p className="leise klein" style={{ marginTop: 8 }}>Ist-Versteuerung: Umsatzsteuer zählt, wenn das Geld da ist. Der Bericht geht durch Qualitätskontrolle und Freigabe; automatisch zu jedem Quartalsanfang.</p>
      </section>

      <section className="karte abstand">
        <h2>Rechnungen im Zeitraum</h2>
        {a.rechnungen.length ? (
          <table className="tabelle">
            <thead><tr><th>Nummer</th><th>Kunde</th><th className="weg-mobil">Datum</th><th className="zahl">Brutto</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {a.rechnungen.map(({ r, kunde }) => (
                <tr key={r.id}>
                  <td className="mono">{r.nummer}</td>
                  <td>{kunde}<div className="leise klein">{r.art === "anzahlung" ? "Anzahlung" : r.art === "schluss" ? "Schlussrechnung" : "Betreuung"}</div></td>
                  <td className="weg-mobil mono klein">{datum(r.erstelltAm)}</td>
                  <td className="zahl">{euro(Math.round(r.netto * (1 + UST)))}</td>
                  <td><Status wert={r.status} />{r.bezahltAm ? <div className="leise klein">{datum(r.bezahltAm)}</div> : null}</td>
                  <td>{r.status === "offen" ? <form action={rechnungBezahlt}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="z" value={z.key} /><button className="knopf klein">Bezahlt</button></form> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="leise">Keine Rechnungen in diesem Zeitraum.</p>}
      </section>

      <section className="karte abstand">
        <h2>Ausgaben im Zeitraum</h2>
        {a.ausgaben.length ? (
          <table className="tabelle">
            <thead><tr><th>Lieferant</th><th className="weg-mobil">Kategorie</th><th className="weg-mobil">Datum</th><th className="zahl">Netto</th><th>Beleg</th></tr></thead>
            <tbody>
              {[...a.ausgaben].reverse().map((x) => (
                <tr key={x.id}>
                  <td><Link href={`/finanzen/ausgabe/${x.id}`}>{x.lieferant}</Link>{x.beschreibung ? <div className="leise klein">{x.beschreibung}</div> : null}</td>
                  <td className="weg-mobil">{kategorieName(x.kategorie)}</td>
                  <td className="weg-mobil mono klein">{datum(x.datum)}</td>
                  <td className="zahl">{euro(x.netto)}</td>
                  <td>{x.status === "pruefen" ? <Status wert="pruefen" /> : x.belegName ? <a className="klein" href={`/finanzen-datei/beleg/${x.id}`} target="_blank">ansehen</a> : <span className="status fehler">fehlt</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <div className="leer"><strong>Keine Ausgaben in diesem Zeitraum.</strong>Belege einfach mit dem Handy fotografieren und hochladen.</div>}
      </section>
    </>
  );
}
