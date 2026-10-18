import Link from "next/link";
import { AusgabeFelder } from "@/components/AusgabeFelder";
import { ausgabeSpeichern } from "../../../aktionen";

export const metadata = { title: "Ausgabe erfassen" };

export default function NeueAusgabe() {
  return (
    <>
      <Link href="/finanzen" className="zurueck">← Finanzen</Link>
      <div className="kopfzeile"><div><h1>Ausgabe erfassen</h1><p>Am schnellsten: Beleg fotografieren, den Rest füllt der Beleg-Agent aus. Du prüfst danach.</p></div></div>
      <div className="raster zwei" style={{ alignItems: "start" }}>
        <form action={ausgabeSpeichern} className="karte">
          <h2>Nur Beleg hochladen</h2>
          <input type="hidden" name="nurBeleg" value="ja" />
          <label className="feld"><span>Beleg (Foto oder PDF)</span><input type="file" name="beleg" accept="image/*,application/pdf" capture="environment" required /></label>
          <button className="knopf haupt">Hochladen</button>
          <p className="leise klein" style={{ marginTop: 8 }}>Ohne eingerichtete KI trägst du die Werte danach selbst ein.</p>
        </form>
        <form action={ausgabeSpeichern} className="karte">
          <h2>Von Hand eintragen</h2>
          <AusgabeFelder />
          <button className="knopf">Speichern</button>
        </form>
      </div>
    </>
  );
}
