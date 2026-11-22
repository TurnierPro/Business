import Link from "next/link";
import { planIst } from "@/lib/plan-ist";
import { ANNAHMEN, PLAN_BAUSTEINE, PLAN_JAHRE, QUOTEN, SZENARIEN, jahreswerte, type SzenarioKey } from "@/lib/plan";
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
  const jahre = jahreswerte(p.monate);
  const vorPlan = p.monate[0].monat > p.jetzt;

  return (
    <>
      <div className="kopfzeile">
        <div>
          <h1>Plan und Soll</h1>
          <p>Szenario wählen: Monat für Monat mit Webauftritten und Modulen, gegen das Ist (Dezember 2026 bis Dezember 2029, nach dem Business Case).</p>
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
          <h2>Websites 2027</h2>
          <p className="leise klein">Dezember 2026 bis Dezember 2027</p>
          <Fortschritt ist={p.jahr1.auftraegeIst} ziel={p.jahr1.auftraegePlan} format={zahl} />
        </section>
        <section className="karte">
          <h2>Einnahmen 2027</h2>
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
                <th className="zahl weg-mobil">Gehälter</th>
                <th className="zahl">Ergebnis Plan</th>
                <th className="zahl weg-mobil">Konto Plan</th>
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
                  <td className="zahl leise weg-mobil">{ganz(m.gehalt)}</td>
                  <td className="zahl" style={m.ergebnis < 0 ? { color: "var(--fehler)" } : undefined}>{ganz(m.ergebnis)}</td>
                  <td className="zahl weg-mobil">{ganz(m.konto)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              {[2026, ...PLAN_JAHRE].map((j) => {
                const l = p.monate.filter((m) => m.monat.startsWith(String(j)));
                const sum = (f: (m: (typeof l)[number]) => number) => l.reduce((x, m) => x + f(m), 0);
                return (
                  <tr key={j}>
                    <th>{j === 2026 ? "Dez 2026" : j}</th>
                    {PLAN_BAUSTEINE.map((b) => <th key={b.key} className="zahl weg-mobil mono">{sum((m) => m.stueck[b.key] ?? 0)}</th>)}
                    <th className="zahl mono">{sum((m) => m.ist?.auftraege ?? 0)}</th>
                    <th className="zahl weg-mobil mono">{ganz(sum((m) => m.einmalig))}</th>
                    <th className="zahl weg-mobil mono">{ganz(sum((m) => m.beitraege))}</th>
                    <th className="zahl mono">{ganz(sum((m) => m.umsatz))}</th>
                    <th className="zahl mono">{ganz(sum((m) => m.ist?.umsatz ?? 0))}</th>
                    <th className="zahl weg-mobil mono">{ganz(sum((m) => m.kosten))}</th>
                    <th className="zahl weg-mobil mono">{ganz(sum((m) => m.gehalt))}</th>
                    <th className="zahl mono">{ganz(sum((m) => m.ergebnis))}</th>
                    <th className="zahl weg-mobil mono">{ganz(l.at(-1)?.konto ?? 0)}</th>
                  </tr>
                );
              })}
            </tfoot>
          </table>
        </div>
      </section>

      <section className="karte abstand">
        <h2>Mengen im Szenario {p.szenario.name}</h2>
        <p className="leise klein" style={{ marginTop: 0 }}>{p.szenario.beschreibung}</p>
        <div className="raster vier">
          <div className="kennzahl"><div className="wert">{QUOTEN[s].personal}</div><div className="name">Personal & Bewerbung bei Abschluss</div></div>
          <div className="kennzahl"><div className="wert">{QUOTEN[s].marketing}</div><div className="name">Marketing & Sichtbarkeit bei Abschluss</div></div>
          <div className="kennzahl"><div className="wert">{QUOTEN[s].nachkauf ? `≈ ${Math.round(QUOTEN[s].nachkauf * 100)} %` : "–"}</div><div className="name">Nachkauf im ersten Jahr</div></div>
          <div className="kennzahl"><div className="wert" style={{ fontSize: 18 }}>{QUOTEN[s].kundenmanagement}</div><div className="name">Kundenmanagement</div></div>
        </div>
      </section>

      <section className="karte abstand">
        <h2>Abgleich mit dem Business Case</h2>
        <p className="leise klein" style={{ marginTop: 0 }}>Modell hier gegen die Zahlen im Business Case (Liquiditätsmodell vom 17.11.2026). Kleine Abweichungen kommen von Annahmen, die der Business Case nicht nennt (siehe unten).</p>
        <table className="tabelle">
          <thead><tr><th>Jahr</th><th className="zahl">Einnahmen Modell</th><th className="zahl">Business Case</th><th className="zahl weg-mobil">Konto Ende Modell</th><th className="zahl weg-mobil">Business Case</th></tr></thead>
          <tbody>
            {jahre.map((j, i) => (
              <tr key={j.jahr}>
                <td>{j.jahr}</td>
                <td className="zahl">{ganz(j.umsatz)}</td>
                <td className="zahl leise">{ganz(p.szenario.bc.einnahmen[i])}</td>
                <td className="zahl weg-mobil">{ganz(j.kontoEnde)}</td>
                <td className="zahl weg-mobil leise">{ganz(p.szenario.bc.kontoEnde[i])}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="leise klein" style={{ marginTop: 8 }}>Volles Gehalt laut Business Case ab {monatName(p.szenario.vollesGehaltAb)} · tiefster Kontostand laut Business Case {ganz(p.szenario.bc.tiefsterKontostand)}.</p>
      </section>

      <section className="karte abstand">
        <h2>Annahmen</h2>
        <ul className="leise">{ANNAHMEN.map((a) => <li key={a} className="klein">{a}</li>)}</ul>
        <p className="leise klein">Die Planwerte stehen zentral in <span className="mono">src/lib/plan.ts</span>. Ändert sich der Business Case, nur dort anpassen.</p>
      </section>
    </>
  );
}
