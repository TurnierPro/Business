import Link from "next/link";
import { auswertung, kategorieName, monatName, nachbar, zeitraum } from "@/lib/finanzen";
import { umsatzDiagramm, FARBEN_DUNKEL } from "@/lib/diagramm";
import { euro, UST } from "@/lib/pakete";
import { datum } from "@/lib/format";
import { Status } from "@/components/Status";
import { berichtVorbereiten, rechnungBezahlt } from "../aktionen";
import { Fortschritt } from "@/components/FinanzReiter";
import { monatsplan } from "@/lib/plan";
import { sollIst, sollwerte } from "@/lib/soll";

export const metadata = { title: "Finanzen" };

export default async function Finanzen({ searchParams }: { searchParams: Promise<{ z?: string }> }) {
  const z = zeitraum((await searchParams).z);
  const a = await auswertung(z);
  const jahr = z.von.getFullYear();
  const quartal = Math.floor(z.von.getMonth() / 3) + 1;
  const monat = `${jahr}-${String(z.von.getMonth() + 1).padStart(2, "0")}`;
  const wahl = [
    { key: monat, text: "Monat", aktiv: z.art === "monat" },
    { key: `${jahr}-Q${quartal}`, text: "Quartal", aktiv: z.art === "quartal" },
    { key: String(jahr), text: "Jahr", aktiv: z.art === "jahr" },
  ];
  const planMonate = monatsplan("basis").filter((m) => z.monate.includes(m.monat));
  const [soll, si] = await Promise.all([sollwerte(), sollIst()]);
  const planUmsatz = soll.filter((s) => z.monate.includes(s.monat)).reduce((x, s) => x + s.umsatz, 0);
  const planKosten = planMonate.reduce((x, m) => x + m.kosten, 0);
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
          <Link className="knopf haupt" href="/finanzen/ausgabe/neu">Ausgabe erfassen</Link>
        </div>
      </div>

      <div className="knopfreihe" style={{ marginBottom: 16, justifyContent: "space-between" }}>
        <div className="knopfreihe">
          <Link className="knopf klein" href={`/finanzen?z=${nachbar(z, -1)}`} aria-label="Zeitraum davor">←</Link>
          <b style={{ minWidth: 150, textAlign: "center" }}>{z.name}</b>
          <Link className="knopf klein" href={`/finanzen?z=${nachbar(z, 1)}`} aria-label="Zeitraum danach">→</Link>
        </div>
        <nav className="knopfreihe" aria-label="Zeitraum">
          {wahl.map((w) => (
            <Link key={w.text} href={`/finanzen?z=${w.key}`} className="knopf klein" aria-current={w.aktiv ? "page" : undefined} style={w.aktiv ? { borderColor: "var(--akzent)" } : { color: "var(--leise)" }}>{w.text}</Link>
          ))}
        </nav>
      </div>

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

      <div className="raster drei">
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
            <div><p className="klein">Ausgaben (Budget)</p><Fortschritt ist={a.kosten} ziel={planKosten} format={euro} /></div>
          </div>
        </section>
      ) : null}

      <section className="karte abstand">
        <h2>Umsatz und Ausgaben je Monat</h2>
        <div dangerouslySetInnerHTML={{ __html: umsatzDiagramm(a.proMonat.map((m) => ({ name: monatName(m.monat), umsatz: m.umsatz, ausgaben: m.ausgaben })), FARBEN_DUNKEL) }} />
        <details style={{ marginTop: 8 }}>
          <summary className="leise klein" style={{ cursor: "pointer" }}>Als Tabelle</summary>
          <table className="tabelle"><thead><tr><th>Monat</th><th className="zahl">Umsatz</th><th className="zahl">Ausgaben</th><th className="zahl">Ergebnis</th></tr></thead>
            <tbody>{a.proMonat.map((m) => <tr key={m.monat}><td>{monatName(m.monat)}</td><td className="zahl">{euro(m.umsatz)}</td><td className="zahl">{euro(m.ausgaben)}</td><td className="zahl">{euro(m.umsatz - m.ausgaben)}</td></tr>)}</tbody>
          </table>
        </details>
      </section>

      <div className="raster zwei abstand" style={{ alignItems: "start" }}>
        <section className="karte">
          <h2>Ausgaben nach Kategorie</h2>
          <p className="leise klein">Plan = Fixkosten aus dem Business Case (3.900 € im Monat).</p>
          <table className="tabelle">
            <thead><tr><th>Kategorie</th><th className="zahl">Plan</th><th className="zahl">Ist</th></tr></thead>
            <tbody>
              {a.proKategorie.map((k) => (
                <tr key={k.key}>
                  <td>{k.name}</td>
                  <td className="zahl leise">{k.plan ? euro(k.plan) : "–"}</td>
                  <td className="zahl" style={k.plan && k.ist > k.plan ? { color: "var(--fehler)" } : undefined}>{euro(k.ist)}{k.plan && k.ist > k.plan ? " ▲" : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="karte">
          <h2>Umsatzsteuer und Steuerberater</h2>
          <dl className="daten">
            <dt>USt eingenommen</dt><dd className="mono">{euro(a.ustEinnahmen)}</dd>
            <dt>Vorsteuer</dt><dd className="mono">{euro(a.vorsteuer)}</dd>
            <dt>Zahllast</dt><dd className="mono"><b>{euro(a.ustZahllast)}</b></dd>
          </dl>
          <p className="leise klein" style={{ marginTop: 12 }}>Ist-Versteuerung: Umsatzsteuer zählt, wenn das Geld da ist.</p>
          <div className="knopfreihe" style={{ marginTop: 16 }}>
            <a className="knopf klein" href={`/finanzen-datei/export?z=${z.key}&art=einnahmen`}>Einnahmen als CSV</a>
            <a className="knopf klein" href={`/finanzen-datei/export?z=${z.key}&art=ausgaben`}>Ausgaben als CSV</a>
            <form action={berichtVorbereiten}><button className="knopf klein">Bericht an Steuerberater vorbereiten</button></form>
          </div>
          <p className="leise klein" style={{ marginTop: 8 }}>Der Bericht geht durch Qualitätskontrolle und Freigabe. Automatisch passiert das zu jedem Quartalsanfang.</p>
        </section>
      </div>

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
        <div className="kopfzeile" style={{ marginBottom: 8 }}><h2>Ausgaben im Zeitraum</h2><Link className="knopf klein" href="/finanzen/ausgabe/neu">Ausgabe erfassen</Link></div>
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
