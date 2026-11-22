import Link from "next/link";
import { planIst } from "@/lib/plan-ist";
import { ANNAHMEN, MODULE_AB, PLAN_BAUSTEINE, QUOTEN, SZENARIEN, type SzenarioKey } from "@/lib/plan";
import { planIstDiagramm, FARBEN_DUNKEL } from "@/lib/diagramm";
import { monatName } from "@/lib/finanzen";
import { euro } from "@/lib/pakete";
import { Fortschritt } from "@/components/FinanzReiter";

export const metadata = { title: "Plan und Ziele" };

const zahl = (n: number) => String(n);
const ganz = (cent: number) => euro(cent).replace(",00", ""); // volle Euro, damit die Tabelle auf den Bildschirm passt

export default async function Plan({ searchParams }: { searchParams: Promise<{ szenario?: string }> }) {
  const sz = ((await searchParams).szenario ?? "basis") as SzenarioKey;
  const s: SzenarioKey = SZENARIEN[sz] ? sz : "basis";
  const p = await planIst(s);
  const abstand = p.bisHeute.umsatzIst - p.bisHeute.umsatzPlan;
  const vorPlan = p.monate[0].monat > p.jetzt;

  return (
    <>
      <div className="kopfzeile">
        <div>
          <h1>Plan und Soll</h1>
          <p>Szenario wählen: Monat für Monat mit Webauftritten und Modulen, gegen das Ist (Dezember 2026 bis November 2028).</p>
        </div>
      </div>

      <nav className="knopfreihe" aria-label="Szenario" style={{ marginBottom: 16 }}>
        {(Object.keys(SZENARIEN) as SzenarioKey[]).map((k) => (
          <Link key={k} href={`/finanzen/plan?szenario=${k}`} className="knopf klein" aria-current={k === s ? "page" : undefined} style={k === s ? { borderColor: "var(--akzent)" } : { color: "var(--leise)" }}>
            {SZENARIEN[k].name}
          </Link>
        ))}
        <span className="leise klein">{p.szenario.beschreibung}</span>
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

      <section className="karte abstand">
        <div className="kopfzeile" style={{ marginBottom: 8 }}><h2 style={{ margin: 0 }}>Monat für Monat · {p.szenario.name}</h2><Link className="klein" href="/stammdaten/ziele">Soll je Baustein anpassen</Link></div>
        <p className="leise klein">Verkaufte Bausteine je Monat [A]: Kompakt, Professional (Prof.), Personal & Bewerbung, Marketing & Sichtbarkeit, Kundenmanagement (Kundenm.). Umsatz = einmalig (50 % bei Auftrag, 50 % beim Livegang) + Monatsbeiträge ab Livegang.</p>
        <div style={{ overflowX: "auto" }}>
          <table className="tabelle plan-tabelle">
            <thead>
              <tr>
                <th>Monat</th>
                {PLAN_BAUSTEINE.map((b) => <th key={b.key} className="zahl weg-mobil">{b.name}</th>)}
                <th className="zahl">Aufträge Ist</th>
                <th className="zahl weg-mobil">Einmalig</th>
                <th className="zahl weg-mobil">Beiträge</th>
                <th className="zahl">Umsatz Plan</th>
                <th className="zahl">Umsatz Ist</th>
                <th className="zahl weg-mobil">Kosten Plan</th>
                <th className="zahl">Ergebnis Plan</th>
              </tr>
            </thead>
            <tbody>
              {p.monate.map((m) => (
                <tr key={m.monat} className={m.monat === p.jetzt ? "jetzt" : undefined}>
                  <td>{monatName(m.monat)}</td>
                  {PLAN_BAUSTEINE.map((b) => <td key={b.key} className="zahl weg-mobil">{m.stueck[b.key] || <span className="leise">–</span>}</td>)}
                  <td className="zahl">{m.ist ? m.ist.auftraege : "–"}</td>
                  <td className="zahl leise weg-mobil">{ganz(m.einmalig)}</td>
                  <td className="zahl leise weg-mobil">{ganz(m.beitraege)}</td>
                  <td className="zahl">{ganz(m.umsatz)}</td>
                  <td className="zahl">{m.ist ? ganz(m.ist.umsatz) : "–"}</td>
                  <td className="zahl leise weg-mobil">{ganz(m.kosten)}</td>
                  <td className="zahl" style={m.ergebnis < 0 ? { color: "var(--fehler)" } : undefined}>{ganz(m.ergebnis)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              {[0, 1].map((j) => {
                const l = p.monate.slice(j * 12, j * 12 + 12);
                const sum = (f: (m: (typeof l)[number]) => number) => l.reduce((x, m) => x + f(m), 0);
                return (
                  <tr key={j}>
                    <th>Jahr {j + 1}</th>
                    {PLAN_BAUSTEINE.map((b) => <th key={b.key} className="zahl weg-mobil mono">{sum((m) => m.stueck[b.key] ?? 0)}</th>)}
                    <th className="zahl mono">{sum((m) => m.ist?.auftraege ?? 0)}</th>
                    <th className="zahl weg-mobil mono">{ganz(sum((m) => m.einmalig))}</th>
                    <th className="zahl weg-mobil mono">{ganz(sum((m) => m.beitraege))}</th>
                    <th className="zahl mono">{ganz(sum((m) => m.umsatz))}</th>
                    <th className="zahl mono">{ganz(sum((m) => m.ist?.umsatz ?? 0))}</th>
                    <th className="zahl weg-mobil mono">{ganz(sum((m) => m.kosten))}</th>
                    <th className="zahl mono">{ganz(sum((m) => m.ergebnis))}</th>
                  </tr>
                );
              })}
            </tfoot>
          </table>
        </div>
      </section>

      <section className="karte abstand">
        <h2>Quoten im Szenario {p.szenario.name} [A]</h2>
        <div className="raster vier">
          <div className="kennzahl"><div className="wert">{Math.round(QUOTEN[s].PROFESSIONAL * 100)} %</div><div className="name">der Webauftritte Professional</div></div>
          <div className="kennzahl"><div className="wert">{Math.round(QUOTEN[s].personal * 100)} %</div><div className="name">mit Personal & Bewerbung</div></div>
          <div className="kennzahl"><div className="wert">{Math.round(QUOTEN[s].marketing * 100)} %</div><div className="name">mit Marketing & Sichtbarkeit</div></div>
          <div className="kennzahl"><div className="wert">{Math.round(QUOTEN[s].kundenmanagement * 100)} %</div><div className="name">mit Kundenmanagement</div></div>
        </div>
        <p className="leise klein" style={{ marginTop: 8 }}>Annahmen, bis der Finanzplan (Dok. 43) eigene Modulquoten liefert. Module ab {monatName(MODULE_AB)}.</p>
      </section>

      <section className="karte abstand">
        <h2>Annahmen</h2>
        <ul className="leise">{ANNAHMEN.map((a) => <li key={a} className="klein">{a}</li>)}</ul>
        <p className="leise klein">Die Planwerte stehen zentral in <span className="mono">src/lib/plan.ts</span>. Ändert sich der Business Case, nur dort anpassen.</p>
      </section>
    </>
  );
}
