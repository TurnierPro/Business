import Link from "next/link";
import { aufgabeErledigen, aufgabeVerschieben } from "@/app/(app)/aktionen";

type Eintrag = { a: { id: number; art: string; titel: string; text: string | null; faelligAm: Date | null; zustaendig: string | null; betriebId: number | null; erledigtAm: Date | null }; betrieb: string | null };

const wann = (d: Date | null) => {
  if (!d) return "";
  const heute = new Date();
  heute.setHours(0, 0, 0, 0);
  const tage = Math.floor((d.getTime() - heute.getTime()) / 864e5);
  const uhr = d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });
  if (tage < 0) return `überfällig seit ${d.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })}`;
  if (tage === 0) return `heute ${uhr}`;
  if (tage === 1) return `morgen ${uhr}`;
  return d.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "Europe/Berlin" });
};

/** Liste offener Aufgaben und Termine mit Erledigen und Verschieben. */
export function AufgabenListe({ eintraege, zurueck, mitBetrieb = true, leer }: { eintraege: Eintrag[]; zurueck: string; mitBetrieb?: boolean; leer?: string }) {
  if (!eintraege.length) return <div className="leer"><strong>{leer ?? "Nichts offen."}</strong></div>;
  return (
    <ul className="liste">
      {eintraege.map(({ a, betrieb }) => {
        const ueber = a.faelligAm && a.faelligAm < new Date() && !a.erledigtAm;
        return (
          <li key={a.id}>
            <form action={aufgabeErledigen} style={{ display: "contents" }}>
              <input type="hidden" name="id" value={a.id} />
              <input type="hidden" name="zurueck" value={zurueck} />
              <button className="haken-knopf" aria-label={`${a.titel} erledigen`} title="Erledigt">✓</button>
            </form>
            <div style={{ flex: 1 }}>
              <div className="titel">{a.art === "termin" ? "Termin: " : ""}{a.titel}{mitBetrieb && betrieb && a.betriebId ? <> · <Link href={`/leads/${a.betriebId}`}>{betrieb}</Link></> : null}</div>
              <div className="unter"><span className={ueber ? "status fehler" : ""} style={ueber ? { padding: "0 6px" } : undefined}>{wann(a.faelligAm)}</span>{a.zustaendig ? ` · ${a.zustaendig}` : ""}{a.text ? ` · ${a.text}` : ""}</div>
            </div>
            <form action={aufgabeVerschieben}>
              <input type="hidden" name="id" value={a.id} />
              <input type="hidden" name="zurueck" value={zurueck} />
              <input type="hidden" name="tage" value={1} />
              <button className="knopf klein" title="Auf morgen 9 Uhr verschieben">Morgen</button>
            </form>
          </li>
        );
      })}
    </ul>
  );
}
