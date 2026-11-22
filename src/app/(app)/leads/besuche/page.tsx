import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { auswertung, besuchErlaubt, besuchsplan, ERGEBNISSE, KONTAKT } from "@/lib/ablauf/vertrieb";
import { datum } from "@/lib/format";
import { besuchErfassen } from "../../aktionen";

// Besuche vor Ort: Plan nach Ort. Erfasst wird der Besuch in der Kundenakte (Aktivitäten).
// Für Daniel am Tablet oder Handy gebaut: große Felder, eine Spalte, wenig Tippen.

export const dynamic = "force-dynamic";


export default async function Besuche() {
  const db = await getDb();
  const [plan, a, letzte] = await Promise.all([
    besuchsplan(),
    auswertung(),
    db.select({ b: schema.besuche, name: schema.betriebe.name }).from(schema.besuche).innerJoin(schema.betriebe, eq(schema.betriebe.id, schema.besuche.betriebId)).orderBy(desc(schema.besuche.am)).limit(15),
  ]);
  const jetztErlaubt = besuchErlaubt(new Date());

  return (
    <>
      <div className="kopfzeile">
        <div>
          <h1>Besuche vor Ort</h1>
          <p>Wer besucht werden kann, nach Ort gebündelt. Den Besuch danach in der Kundenakte unter „Aktivitäten“ erfassen.</p>
        </div>
      </div>
      {!jetztErlaubt ? <div className="hinweis" role="status">Heute keine Besuche mehr: Freitag ab 12 Uhr und am Wochenende besuchen wir nicht.</div> : null}

      {a.art14Fehlt ? <div className="hinweis fehler">Bei {a.art14Fehlt} Gesprächen fehlt das Art.-14-Infoblatt. Bitte nachreichen.</div> : null}

      <section className="karte" aria-labelledby="plan">
        <h2 id="plan">Besuchsplan nach Ort</h2>
        <p className="leise klein">Besuchsbereite Betriebe, nach Ort gebündelt. Nach dem Gespräch gleich den Messbogen ausfüllen.</p>
        {plan.length === 0 ? <p>Gerade ist niemand zum Besuch fällig.</p> : null}
        {plan.map((g) => (
          <div key={g.ort} className="besuch-ort">
            <h3>{g.ort} <span className="leise klein">· {g.betriebe.length}</span></h3>
            {g.betriebe.map(({ betrieb: b, letzterBesuch }) => (
              <details key={b.id} className="besuch">
                <summary>
                  <span className="besuch-name">{b.name}</span>
                  <span className="leise klein">{b.gewerk}{b.telefon ? ` · ${b.telefon}` : ""}{letzterBesuch ? ` · zuletzt ${datum(letzterBesuch)}` : ""}</span>
                </summary>
                <p className="klein"><Link href={`/leads/${b.id}`}>Betrieb öffnen</Link>{b.strasse ? ` · ${b.strasse}` : ""}</p>
                <form action={besuchErfassen} className="messbogen">
                  <input type="hidden" name="betriebId" value={b.id} />
                  <fieldset>
                    <legend>Ergebnis</legend>
                    {Object.entries(ERGEBNISSE).map(([k, n]) => <label key={k} className="haken"><input type="radio" name="ergebnis" value={k} required /><span>{n}</span></label>)}
                  </fieldset>
                  <label className="haken"><input type="checkbox" name="angetroffen" value="ja" /><span>Inhaber angetroffen</span></label>
                  <label className="feld"><span>Dauer in Minuten</span><input name="dauer" type="number" inputMode="numeric" min={0} max={240} /></label>
                  <label className="feld"><span>Einwand wörtlich</span><input name="einwand" placeholder="z. B. Muss ich mit dem Büro besprechen" /></label>
                  <div className="raster zwei">
                    <label className="feld"><span>Paket</span><select name="paket" defaultValue=""><option value="">keins</option><option value="KOMPAKT">Kompakt</option><option value="PROFESSIONAL">Professional</option></select></label>
                    <label className="feld"><span>Variante</span><select name="variante" defaultValue=""><option value="">keine</option><option value="A">A · vor Ort</option><option value="B">B · Rücktrittsrecht</option></select></label>
                  </div>
                  <label className="feld"><span>Weiterer Kontakt</span><select name="kontakt" defaultValue="keine">{Object.entries(KONTAKT).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
                  <label className="haken"><input type="checkbox" name="art14" value="ja" /><span>Art.-14-Infoblatt dagelassen</span></label>
                  <label className="feld"><span>Preistest (erste 15 Gespräche)</span><input name="preistest" placeholder="Reaktion auf den Preis" /></label>
                  <button className="knopf">Messbogen speichern</button>
                </form>
              </details>
            ))}
          </div>
        ))}
      </section>

      <section className="karte" aria-labelledby="letzte">
        <h2 id="letzte">Letzte Besuche</h2>
        {letzte.length === 0 ? <p className="leise">Noch keine Besuche erfasst.</p> : (
          <ul className="liste-schlicht">
            {letzte.map(({ b, name }) => (
              <li key={b.id}><span className={`status ${b.ergebnis === "unterschrift" && !b.ruecktritt ? "ok" : b.ergebnis === "kein_interesse" ? "fehler" : "warten"}`}>{ERGEBNISSE[b.ergebnis]}</span> <Link href={`/leads/${b.betriebId}`}>{name}</Link> <span className="leise klein">{datum(b.am)}{b.variante ? ` · Variante ${b.variante}` : ""}{b.einwand ? ` · „${b.einwand}“` : ""}</span></li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
