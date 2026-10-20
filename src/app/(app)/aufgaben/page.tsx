import { asc } from "drizzle-orm";
import { brauchtBenutzer } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { offeneAufgaben } from "@/lib/ablauf/crm";
import { AufgabenListe } from "@/components/AufgabenListe";
import { aktivitaetAnlegen } from "../aktionen";

export const metadata = { title: "Aufgaben" };

export default async function Aufgaben({ searchParams }: { searchParams: Promise<{ alle?: string }> }) {
  const ich = await brauchtBenutzer();
  const { alle } = await searchParams;
  const liste = await offeneAufgaben(alle ? {} : { wer: ich.name });
  const db = await getDb();
  const [benutzer, betriebe] = await Promise.all([
    db.select({ name: schema.benutzer.name }).from(schema.benutzer),
    db.select({ id: schema.betriebe.id, name: schema.betriebe.name }).from(schema.betriebe).orderBy(asc(schema.betriebe.name)),
  ]);
  const heuteEnde = new Date();
  heuteEnde.setHours(23, 59, 59, 999);
  const wocheEnde = new Date(heuteEnde.getTime() + 6 * 864e5);
  const gruppen = [
    { name: "Überfällig und heute", e: liste.filter((x) => x.a.faelligAm && x.a.faelligAm <= heuteEnde) },
    { name: "Nächste 7 Tage", e: liste.filter((x) => x.a.faelligAm && x.a.faelligAm > heuteEnde && x.a.faelligAm <= wocheEnde) },
    { name: "Später", e: liste.filter((x) => x.a.faelligAm && x.a.faelligAm > wocheEnde) },
  ];
  const morgen = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
  return (
    <>
      <div className="kopfzeile">
        <div><h1>Aufgaben</h1><p>{alle ? "Alle offenen Aufgaben und Termine im Team." : "Deine offenen Aufgaben und Termine."} Viele legt Stelax OS selbst an, z. B. „Angebot nachfassen“.</p></div>
        <a className="knopf klein" href={alle ? "/aufgaben" : "/aufgaben?alle=1"}>{alle ? "Nur meine" : "Alle im Team"}</a>
      </div>
      <div className="raster zwei" style={{ alignItems: "start" }}>
        <div>
          {gruppen.map((g) => (
            <section key={g.name} className="karte" style={{ marginBottom: 16 }}>
              <h2>{g.name} <span className="leise mono klein">{g.e.length}</span></h2>
              <AufgabenListe eintraege={g.e} zurueck={alle ? "/aufgaben?alle=1" : "/aufgaben"} leer="Nichts offen." />
            </section>
          ))}
        </div>
        <form action={aktivitaetAnlegen} className="karte">
          <h2>Neue Aufgabe oder Termin</h2>
          <input type="hidden" name="zurueck" value="/aufgaben" />
          <div className="raster zwei">
            <label className="feld"><span>Art</span><select name="art" defaultValue="aufgabe"><option value="aufgabe">Aufgabe</option><option value="termin">Termin</option></select></label>
            <label className="feld"><span>Für</span><select name="zustaendig" defaultValue={ich.name}>{benutzer.map((b) => <option key={b.name}>{b.name}</option>)}</select></label>
          </div>
          <label className="feld"><span>Was</span><input name="titel" required placeholder="z. B. Fotos bei Kunde machen" /></label>
          <label className="feld"><span>Betrieb (optional)</span><select name="betriebId" defaultValue=""><option value="">–</option>{betriebe.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
          <div className="raster zwei">
            <label className="feld"><span>Datum</span><input type="date" name="faellig" required defaultValue={morgen} /></label>
            <label className="feld"><span>Uhrzeit</span><input type="time" name="faelligUhr" defaultValue="09:00" /></label>
          </div>
          <label className="feld"><span>Notiz</span><textarea name="text" rows={2} /></label>
          <button className="knopf haupt">Anlegen</button>
        </form>
      </div>
    </>
  );
}
