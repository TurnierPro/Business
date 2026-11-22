import Link from "next/link";
import { brauchtBenutzer, darf } from "@/lib/auth";
import { katalogLaden } from "@/lib/katalog-db";
import { ANGEBOT_VORLAGE, PLATZHALTER, WERK_ANGEBOT_VORLAGE } from "@/lib/angebot-vorlage";
import { AGB_VERSION, LAUFZEIT_MONATE, ERSTE_RATE_FAELLIG_TAGE, AENDERUNG_STUNDENSATZ } from "@/lib/recht";
import { euro } from "@/lib/pakete";
import { getDb, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { SeitenKopf } from "@/components/Seite";
import { angebotVorlageSpeichern } from "../../aktionen";

export const metadata = { title: "Angebotsvorlage" };

// Was in jedes Angebot gehört, woher es kommt und was ihr hier selbst ändern könnt.
const AUFBAU: { teil: string; inhalt: string; quelle: string; wo: string }[] = [
  { teil: "Seite 1 · Anschreiben", inhalt: "Briefkopf, Anschrift, Angebotsnummer, Datum, „Gültig bis“", quelle: "Stammdaten des Betriebs", wo: "Gültigkeit unten" },
  { teil: "", inhalt: "Überschrift: Webauftritt und Zahl der weiteren Bausteine", quelle: "Auswahl im Angebot", wo: "–" },
  { teil: "", inhalt: "Einstieg (erster Absatz)", quelle: "persönlich beim Erstellen, sonst Standard", wo: "Einstieg unten" },
  { teil: "", inhalt: "„Ihre zwei Zahlen“: einmalig und Monatsbeitrag, Summe über 24 Monate", quelle: "Katalog (Preise)", wo: "Stammdaten → Katalog" },
  { teil: "Seite 2 · Preise und Ablauf", inhalt: "Preistabelle je Baustein, netto, USt, brutto", quelle: "Katalog (Preise)", wo: "Stammdaten → Katalog" },
  { teil: "", inhalt: `Monatsbeitrag, Laufzeit ${LAUFZEIT_MONATE} Monate, Verlängerung, Kündigung`, quelle: "Rechtliche Festwerte (recht.ts)", wo: "nur mit Anwalt ändern" },
  { teil: "", inhalt: "„So läuft es ab“: Zahlung, Lastschrift, Lieferzeit, Qualität, Änderungen, Eigentum, Daten", quelle: "Baukasten, Konditionen", wo: "So läuft es ab unten" },
  { teil: "", inhalt: `AGB-Hinweis (Version ${AGB_VERSION}), nur für Unternehmer`, quelle: "Rechtliche Festwerte (recht.ts)", wo: "nur mit Anwalt ändern" },
  { teil: "", inhalt: "Kasten „Unterschreiben“", quelle: "Vorlage", wo: "Unterschreiben unten" },
  { teil: "Anlage 1 · Leistungsbeschreibung", inhalt: "Je Baustein: Das Problem, Wir lösen das mit …, fünf Punkte; Nicht enthalten", quelle: "Katalog (Texte)", wo: "Stammdaten → Katalog" },
  { teil: "", inhalt: "Abnahme, Mitwirkung, KI-Hinweis, Datenschutz", quelle: "Vertragswerk (feste Texte)", wo: "nur mit Anwalt ändern" },
  { teil: "Begleit-Mail", inhalt: "Anrede, Einstieg, Anhänge, Link zum Kundenportal, Gruß", quelle: "Vorlage", wo: "Begleit-Mail unten" },
];

export default async function Angebotsvorlage() {
  const ich = await brauchtBenutzer();
  const admin = darf(ich, "verwalten");
  await katalogLaden();
  const v = ANGEBOT_VORLAGE;
  const [eintrag] = await (await getDb()).select().from(schema.katalogEintraege).where(eq(schema.katalogEintraege.key, "vorlage:angebot"));
  return (
    <>
      <SeitenKopf titel="Angebotsvorlage" text="Was in jedes Angebot gehört, woher es kommt und welche Texte ihr hier selbst festlegt. Änderungen gelten für neue Angebote; verschickte bleiben, wie sie sind." />
      <section className="karte abstand-klein">
        <h2>Aufbau eines Angebots</h2>
        <table className="tabelle">
          <thead><tr><th>Teil</th><th>Inhalt</th><th className="weg-mobil">Kommt aus</th><th className="weg-mobil">Ändern</th></tr></thead>
          <tbody>
            {AUFBAU.map((a, i) => (
              <tr key={i}>
                <td className="klein"><b>{a.teil}</b></td>
                <td className="klein">{a.inhalt}</td>
                <td className="weg-mobil klein leise">{a.quelle}</td>
                <td className="weg-mobil klein">{a.wo === "Stammdaten → Katalog" ? <Link href="/stammdaten">{a.wo}</Link> : a.wo}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="leise klein" style={{ marginTop: 8 }}>Die festen Werte (Laufzeit {LAUFZEIT_MONATE} Monate, erste Rate fällig nach {ERSTE_RATE_FAELLIG_TAGE} Tagen, Stundensatz {euro(AENDERUNG_STUNDENSATZ)}) stammen aus dem Baukasten und dem Vertragswerk. Sie stehen zentral im Code und werden in die Texte eingesetzt.</p>
      </section>

      <form action={angebotVorlageSpeichern} className="karte">
        <div className="kopfzeile" style={{ marginBottom: 8 }}>
          <h2 style={{ margin: 0 }}>Texte der Vorlage</h2>
          <span className={`status ${eintrag ? "warten" : "ok"}`}>{eintrag ? `geändert von ${eintrag.geaendertVon}` : "Werkseinstellung"}</span>
        </div>
        <fieldset disabled={!admin} style={{ border: 0, padding: 0, margin: 0 }}>
          <div className="raster" style={{ gridTemplateColumns: "minmax(0, 1fr) 200px", gap: 12 }}>
            <label className="feld"><span>Einstieg (Standard, wenn kein persönlicher eingetragen ist)</span><textarea name="einstieg" rows={3} defaultValue={v.einstieg} /></label>
            <label className="feld"><span>Gültig (Tage)</span><input name="gueltigTage" type="number" min={1} max={120} defaultValue={v.gueltigTage} /></label>
          </div>
          <label className="feld"><span>So läuft es ab (ein Punkt je Zeile)</span><textarea name="ablauf" rows={9} defaultValue={v.ablauf.join("\n")} /></label>
          <label className="feld"><span>Kasten „Unterschreiben“</span><textarea name="unterschreiben" rows={3} defaultValue={v.unterschreiben} /></label>
          <label className="feld"><span>Begleit-Mail</span><textarea name="mail" rows={12} defaultValue={v.mail} className="mono" style={{ fontSize: 14 }} /></label>
          <details style={{ margin: "4px 0 12px" }}>
            <summary className="klein" style={{ cursor: "pointer" }}>Platzhalter</summary>
            <ul className="zeilen">{Object.entries(PLATZHALTER).map(([k, n]) => <li key={k}><span className="mono">{k}</span><span className="leise klein">{n}</span></li>)}</ul>
          </details>
          <div className="knopfreihe">
            <button className="knopf">Vorlage speichern</button>
            <span className="leise klein">{admin ? "Ein Feld leeren oder auf den Werkstext setzen: Es gilt wieder die Werkseinstellung." : "Nur Admins können die Vorlage ändern."}</span>
          </div>
        </fieldset>
        {eintrag ? <details style={{ marginTop: 12 }}><summary className="klein" style={{ cursor: "pointer" }}>Werkseinstellung ansehen</summary><pre className="klein leise" style={{ whiteSpace: "pre-wrap" }}>{[WERK_ANGEBOT_VORLAGE.einstieg, "", ...WERK_ANGEBOT_VORLAGE.ablauf.map((x) => `· ${x}`), "", WERK_ANGEBOT_VORLAGE.unterschreiben, "", WERK_ANGEBOT_VORLAGE.mail].join("\n")}</pre></details> : null}
      </form>
    </>
  );
}
