import { brauchtBenutzer, darf } from "@/lib/auth";
import { sollwerte } from "@/lib/soll";
import { PLAN_BAUSTEINE } from "@/lib/plan";
import { euro } from "@/lib/pakete";
import { sollSpeichern } from "../../aktionen";

export const metadata = { title: "Soll-Umsätze" };

const MONATE = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
const name = (m: string) => `${MONATE[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}`;

// Soll je Monat: wie viele Webauftritte und Module wir verkaufen wollen. Der Umsatz wird daraus gerechnet
// (einmalig 50 % bei Auftrag, 50 % beim Livegang, Monatsbeiträge ab Livegang).
export default async function Ziele() {
  const ich = await brauchtBenutzer();
  const admin = darf(ich, "verwalten");
  const soll = await sollwerte();
  const jahr = (i: number) => soll.slice(i * 12, i * 12 + 12).reduce((x, s) => ({ umsatz: x.umsatz + s.umsatz, auftraege: x.auftraege + s.auftraege }), { umsatz: 0, auftraege: 0 });
  return (
    <>
      <div className="kopfzeile"><div><h1>Soll-Umsätze</h1><p>Wie viele Webauftritte und Module wir je Monat verkaufen wollen. Der Umsatz (netto) rechnet sich aus den Bausteinen. Vorgabe ist das Basis-Szenario.</p></div></div>
      <div className="raster zwei">
        {[0, 1].map((i) => <div key={i} className="kennzahl"><div className="wert">{euro(jahr(i).umsatz)}</div><div className="name">Jahr {i + 1} (Dez {2026 + i} – Nov {2027 + i}) · {jahr(i).auftraege} Webauftritte</div></div>)}
      </div>
      <form action={sollSpeichern} className="karte abstand">
        <fieldset disabled={!admin} style={{ border: 0, padding: 0, margin: 0 }}>
          <div style={{ overflowX: "auto" }}>
            <table className="tabelle soll-tabelle">
              <thead>
                <tr>
                  <th>Monat</th>
                  {PLAN_BAUSTEINE.map((b) => <th key={b.key} className="zahl" title={`${euro(b.einmalig)} + ${euro(b.monatlich)}/Monat`}>{b.name}</th>)}
                  <th className="zahl">Umsatz Soll</th>
                  <th className="zahl weg-mobil">Basis-Szenario</th>
                </tr>
              </thead>
              <tbody>
                {soll.map((s, i) => (
                  <tr key={s.monat} className={i === 12 ? "jahrwechsel" : undefined}>
                    <td>{name(s.monat)}{s.geaendert ? <span className="marke-klein" style={{ marginLeft: 6 }}>geändert</span> : null}<input type="hidden" name="monat" value={s.monat} /></td>
                    {PLAN_BAUSTEINE.map((b) => (
                      <td key={b.key} className="zahl"><input className="planfeld stueck" name={`${b.key}-${s.monat}`} type="number" min={0} max={999} defaultValue={s.stueck[b.key] ?? 0} aria-label={`${b.name} ${name(s.monat)}`} /></td>
                    ))}
                    <td className="zahl mono">{euro(s.umsatz)}</td>
                    <td className="zahl weg-mobil leise klein">{euro(s.vorgabe.umsatz)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="knopfreihe" style={{ marginTop: 16 }}><button className="knopf haupt">Speichern und neu rechnen</button><span className="leise klein">Module verkaufen wir ab Mai 2027. Werte gleich dem Basis-Szenario gelten wieder als Vorgabe.</span></div>
        </fieldset>
      </form>
    </>
  );
}
