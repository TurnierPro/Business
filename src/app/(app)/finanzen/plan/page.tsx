import Link from "next/link";
import { planIst } from "@/lib/plan-ist";
import { ANNAHMEN, BUSINESS_CASE, SZENARIEN, type SzenarioKey } from "@/lib/plan";
import { planIstDiagramm, FARBEN_DUNKEL } from "@/lib/diagramm";
import { monatName } from "@/lib/finanzen";
import { euro } from "@/lib/pakete";
import { FinanzReiter, Fortschritt } from "@/components/FinanzReiter";
import { kontostandSpeichern } from "../../aktionen";

export const metadata = { title: "Plan und Ziele" };

const zahl = (n: number) => String(n);
const datum = (iso: string) => new Date(iso).toLocaleDateString("de-DE");

export default async function Plan({ searchParams }: { searchParams: Promise<{ szenario?: string }> }) {
  const sz = ((await searchParams).szenario ?? "basis") as SzenarioKey;
  const s: SzenarioKey = SZENARIEN[sz] ? sz : "basis";
  const p = await planIst(s);
  const abstand = p.bisHeute.umsatzIst - p.bisHeute.umsatzPlan;
  const vorPlan = p.monate[0].monat > p.jetzt;
  const bc = BUSINESS_CASE;

  return (
    <>
      <div className="kopfzeile">
        <div>
          <h1>Finanzen</h1>
          <p>Wo stehen wir im Vergleich zum Business Case (Dezember 2026 bis November 2028)?</p>
        </div>
      </div>
      <FinanzReiter aktiv="plan" />

      <nav className="knopfreihe" aria-label="Szenario" style={{ marginBottom: 16 }}>
        {(Object.keys(SZENARIEN) as SzenarioKey[]).map((k) => (
          <Link key={k} href={`/finanzen/plan?szenario=${k}`} className="knopf klein" aria-current={k === s ? "page" : undefined} style={k === s ? { borderColor: "var(--akzent)" } : { color: "var(--leise)" }}>
            {SZENARIEN[k].name}
          </Link>
        ))}
        <span className="leise klein">{p.szenario.beschreibung} · volles Gehalt durchgehend ab {monatName(p.szenario.vollesGehaltAb)}</span>
      </nav>

      {vorPlan ? <div className="hinweis">Der Planzeitraum beginnt im Dezember 2026. Bis dahin zählt alles, was schon passiert, zum ersten Planmonat.</div> : null}

      <div className="raster drei">
        <section className="karte">
          <h2>Aufträge Jahr 1</h2>
          <p className="leise klein">Dez 2026 bis Nov 2027</p>
          <Fortschritt ist={p.jahr1.auftraegeIst} ziel={p.jahr1.auftraegePlan} format={zahl} />
        </section>
        <section className="karte">
          <h2>Umsatz Jahr 1</h2>
          <p className="leise klein">netto</p>
          <Fortschritt ist={p.jahr1.umsatzIst} ziel={p.jahr1.umsatzPlan} format={euro} />
        </section>
        <section className="karte">
          <h2>Bis heute</h2>
          <p className="leise klein">Plan bis {monatName(p.jetzt < p.monate[0].monat ? p.monate[0].monat : p.jetzt)}</p>
          <p style={{ fontSize: 22 }} className="mono">{abstand >= 0 ? "+" : "−"}{euro(Math.abs(abstand))}</p>
          <p className="klein leise">{abstand >= 0 ? "vor dem Plan" : "hinter dem Plan"} · Aufträge {p.bisHeute.auftraegeIst} statt {p.bisHeute.auftraegePlan}</p>
        </section>
      </div>

      <section className="karte abstand">
        <h2>Umsatz kumuliert: Plan und Ist</h2>
        <div dangerouslySetInnerHTML={{ __html: planIstDiagramm(p.monate.map((m) => ({ name: monatName(m.monat), plan: m.umsatz, ist: m.ist ? m.ist.umsatz : null })), FARBEN_DUNKEL) }} />
      </section>

      <div className="raster zwei abstand" style={{ alignItems: "start" }}>
        <section className="karte">
          <h2>Meilensteine</h2>
          <ul className="liste">
            <li style={{ display: "block" }}>
              <div className="titel">Entscheidung am {datum(p.stichtag.datum)}: volles Gehalt ab April 2027?</div>
              <div className="unter" style={{ marginBottom: 8 }}>Nur wenn bis dahin mindestens {p.stichtag.ziel} Aufträge unterschrieben sind.</div>
              <Fortschritt ist={p.stichtag.ist} ziel={p.stichtag.ziel} format={zahl} />
            </li>
            <li><div><div className="titel">Gründerkredit {euro(bc.kredit)}</div><div className="unter">Auszahlung Februar 2027, 2 Jahre tilgungsfrei, Tilgung ab Februar 2029</div></div></li>
            <li><div><div className="titel">Tiefster Kontostand laut Plan</div><div className="unter">{euro(p.szenario.tiefsterKontostand)} im Januar 2027, über die Kontokorrentlinie ({euro(bc.kontokorrent)})</div></div></li>
            <li><div><div className="titel">Kapitalbedarf</div><div className="unter">{euro(bc.kapitalbedarf)}; Finanzierung {euro(bc.stammkapital + bc.kredit)} + {euro(bc.kontokorrent)} Kontokorrent</div></div></li>
            <li><div><div className="titel">Ø Zeit bis Livegang</div><div className="unter">Ziel ≤ {bc.ziele.wochenBisLivegang} Wochen · Ist {p.wochenBisLive === null ? "noch keine Live-Projekte" : `${p.wochenBisLive.toFixed(1).replace(".", ",")} Wochen`}</div></div></li>
            <li><div><div className="titel">Weitere Messgrößen</div><div className="unter">≤ {bc.ziele.stundenS} h für „Anfragen“ ab Sommer 2027 · ≤ {bc.ziele.betreuungStundenJeKunde} h Betreuung je Kunde · ≥ {bc.ziele.prozessCheckQuote * 100} % der Prozess-Checks werden Aufträge. Stunden werden noch nicht erfasst.</div></div></li>
          </ul>
        </section>

        <section className="karte">
          <h2>Gehaltsregel</h2>
          <p className="leise klein">Eigenes Geld = Kontostand am Monatsende − KfW-Restschuld − fällige Umsatzsteuer − Steuerrücklage (31,5 %). Volles Gehalt ab 20.000 €, unter 0 € Basisgehalt, unter −15.000 € Notgehalt. Volle Gehälter nie aus dem Kredit.</p>
          {p.gehalt ? (
            <>
              <dl className="daten" style={{ marginTop: 12 }}>
                <dt>Kontostand {monatName(p.gehalt.monat)}</dt><dd className="mono">{euro(p.gehalt.kontostand)}</dd>
                <dt>− KfW-Restschuld</dt><dd className="mono">{euro(p.gehalt.kredit)}</dd>
                <dt>− fällige USt</dt><dd className="mono">{euro(p.gehalt.ust)}</dd>
                <dt>− Steuerrücklage</dt><dd className="mono">{euro(p.gehalt.ruecklage)}</dd>
                <dt><b>Eigenes Geld</b></dt><dd className="mono"><b style={{ color: p.gehalt.eigenesGeld < 0 ? "var(--fehler)" : undefined }}>{euro(p.gehalt.eigenesGeld)}</b></dd>
              </dl>
              <div className={`hinweis ${p.gehalt.stufe === "voll" ? "ok" : p.gehalt.stufe === "not" ? "fehler" : ""}`} style={{ marginTop: 12 }}>{p.gehalt.text}</div>
            </>
          ) : <p className="leise">Noch kein Kontostand erfasst.</p>}
          <form action={kontostandSpeichern} className="knopfreihe" style={{ marginTop: 12, alignItems: "end" }}>
            <label className="feld" style={{ marginBottom: 0 }}><span>Monat</span><input type="month" name="monat" required defaultValue={p.jetzt} /></label>
            <label className="feld" style={{ marginBottom: 0 }}><span>Kontostand (€)</span><input name="betrag" inputMode="decimal" required placeholder="z. B. 18.500,00" /></label>
            <button className="knopf">Speichern</button>
          </form>
        </section>
      </div>

      <section className="karte abstand">
        <h2>Monat für Monat</h2>
        <table className="tabelle">
          <thead><tr><th>Monat</th><th className="zahl">Aufträge Plan / Ist</th><th className="zahl">Umsatz Plan</th><th className="zahl">Umsatz Ist</th><th className="zahl weg-mobil">Kosten Plan</th><th className="zahl weg-mobil">Kosten Ist</th><th className="zahl">Ergebnis Plan</th><th className="zahl">Ergebnis Ist</th></tr></thead>
          <tbody>
            {p.monate.map((m) => (
              <tr key={m.monat} style={m.monat === p.jetzt ? { background: "rgba(201,163,92,0.06)" } : undefined}>
                <td>{monatName(m.monat)}</td>
                <td className="zahl">{m.auftraege} / {m.ist ? m.ist.auftraege : "–"}</td>
                <td className="zahl leise">{euro(m.umsatz)}</td>
                <td className="zahl">{m.ist ? euro(m.ist.umsatz) : "–"}</td>
                <td className="zahl leise weg-mobil">{euro(m.kosten)}</td>
                <td className="zahl weg-mobil">{m.ist ? euro(m.ist.kosten) : "–"}</td>
                <td className="zahl leise" style={m.ergebnis < 0 ? { color: "var(--fehler)" } : undefined}>{euro(m.ergebnis)}</td>
                <td className="zahl">{m.ist ? euro(m.ist.ergebnis) : "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="karte abstand">
        <h2>Annahmen</h2>
        <ul>{ANNAHMEN.map((a) => <li key={a} className="klein">{a}</li>)}</ul>
        <p className="leise klein">Die Planwerte stehen zentral in <span className="mono">src/lib/plan.ts</span>. Ändert sich der Business Case, nur dort anpassen.</p>
      </section>
    </>
  );
}
