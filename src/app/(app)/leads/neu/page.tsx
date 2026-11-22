import Link from "next/link";
import { BetriebFelder } from "@/components/BetriebFelder";
import { leadAnlegen } from "../../aktionen";

export const metadata = { title: "Lead anlegen" };

export default function NeuerLead() {
  return (
    <>
      <Link href="/leads" className="zurueck">← Leads</Link>
      <div className="kopfzeile"><div><h1>Lead anlegen</h1><p>Zum Beispiel eine Empfehlung oder ein Betrieb, der selbst angefragt hat. Pflicht sind Name und Website (oder „Keine Website vorhanden“); den Rest kannst du später ergänzen.</p></div></div>
      <form action={leadAnlegen} className="karte">
        <BetriebFelder />
        <div className="knopfreihe">
          <button className="knopf haupt">Lead anlegen</button>
          <Link className="knopf" href="/leads">Abbrechen</Link>
          <span className="leise klein">Danach landet er unter „Einstufen“.</span>
        </div>
      </form>
    </>
  );
}
