import { brauchtBenutzer, darf } from "@/lib/auth";
import { sollwerte } from "@/lib/soll";
import { euro } from "@/lib/pakete";
import { sollSpeichern } from "../../aktionen";

export const metadata = { title: "Soll-Umsätze" };

const MONATE = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
const name = (m: string) => `${MONATE[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}`;

export default async function Ziele() {
  const ich = await brauchtBenutzer();
  const admin = darf(ich, "verwalten");
  const soll = await sollwerte();
  const jahr = (i: number) => soll.slice(i * 12, i * 12 + 12).reduce((x, s) => ({ umsatz: x.umsatz + s.umsatz, auftraege: x.auftraege + s.auftraege }), { umsatz: 0, auftraege: 0 });
  return (
    <>
      <div className="kopfzeile"><div><h1>Soll-Umsätze</h1><p>Wie wir uns entwickeln wollen: Umsatz (netto) und Aufträge je Monat. Vorgabe ist das Basis-Szenario des Business Case. Die Finanzen zeigen Soll gegen Ist.</p></div></div>
      <div className="raster zwei">
        {[0, 1].map((i) => <div key={i} className="kennzahl"><div className="wert">{euro(jahr(i).umsatz)}</div><div className="name">Jahr {i + 1} (Dez {2026 + i} – Nov {2027 + i}) · {jahr(i).auftraege} Aufträge</div></div>)}
      </div>
      <form action={sollSpeichern} className="karte abstand" style={{ padding: 0 }}>
        <fieldset disabled={!admin} style={{ border: 0, padding: 0, margin: 0 }}>
          <table className="tabelle">
            <thead><tr><th>Monat</th><th className="zahl">Soll-Umsatz (€)</th><th className="zahl">Aufträge</th><th className="zahl weg-mobil">Business Case</th></tr></thead>
            <tbody>
              {soll.map((s) => (
                <tr key={s.monat}>
                  <td>{name(s.monat)}{s.geaendert ? <span className="marke-klein" style={{ marginLeft: 6, borderColor: "var(--akzent)", color: "var(--akzent)" }}>geändert</span> : null}<input type="hidden" name="monat" value={s.monat} /></td>
                  <td className="zahl"><input name={`umsatz-${s.monat}`} inputMode="decimal" defaultValue={(s.umsatz / 100).toLocaleString("de-DE", { maximumFractionDigits: 0 })} aria-label={`Soll-Umsatz ${name(s.monat)}`} style={{ maxWidth: 140, textAlign: "right" }} className="mono" /></td>
                  <td className="zahl"><input name={`auftraege-${s.monat}`} type="number" min={0} max={999} defaultValue={s.auftraege} aria-label={`Aufträge ${name(s.monat)}`} style={{ maxWidth: 80, textAlign: "right" }} className="mono" /></td>
                  <td className="zahl weg-mobil leise klein">{euro(s.vorgabe.umsatz)} · {s.vorgabe.auftraege}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ padding: 16 }}><button className="knopf haupt">Speichern</button> <span className="leise klein">Werte gleich dem Business Case gelten wieder als Vorgabe.</span></div>
        </fieldset>
      </form>
    </>
  );
}
