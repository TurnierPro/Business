import Link from "next/link";
import { BetriebFelder } from "@/components/BetriebFelder";
import { leadAnlegen } from "../../aktionen";

export const metadata = { title: "Lead anlegen" };

export default function NeuerLead() {
  return (
    <>
      <Link href="/leads" className="zurueck">← Betriebe</Link>
      <div className="kopfzeile"><div><h1>Lead anlegen</h1><p>Zum Beispiel eine Empfehlung oder ein Betrieb, der selbst angefragt hat.</p></div></div>
      <form action={leadAnlegen} className="karte">
        <BetriebFelder />
        <button className="knopf haupt">Anlegen</button>
      </form>
    </>
  );
}
