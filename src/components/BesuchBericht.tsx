import { ERGEBNISSE, KONTAKT } from "@/lib/ablauf/vertrieb";

// Besuchsbericht nach dem Besuch vor Ort: was ist rausgekommen, was wurde gesagt, darf man sich melden.
// Nur das Nötige; der Rest steht im Gespräch oder im Angebot.
export function BesuchBerichtFelder() {
  return (
    <>
      <fieldset>
        <legend>Wie lief der Besuch?</legend>
        <div className="raster zwei" style={{ gap: 6 }}>{Object.entries(ERGEBNISSE).map(([k, n]) => <label key={k} className="haken"><input type="radio" name="ergebnis" value={k} required /><span>{n}</span></label>)}</div>
      </fieldset>
      <label className="feld"><span>Was wurde besprochen? <em>optional</em></span><textarea name="einwand" rows={3} placeholder="z. B. Interesse an Karriereseite, will mit dem Büro sprechen" style={{ minHeight: 80 }} /></label>
      <div className="raster zwei" style={{ gap: 12 }}>
        <label className="feld"><span>Darf er per Mail oder Telefon kontaktiert werden?</span><select name="kontakt" defaultValue="keine">{Object.entries(KONTAKT).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
        <label className="feld"><span>Wiedervorlage <em>erscheint dann in „Mein Tag“</em></span><input type="date" name="wiedervorlage" /></label>
      </div>
      <label className="haken"><input type="checkbox" name="art14" value="ja" /><span>Datenschutz-Infoblatt dagelassen <span className="leise">(beim ersten Besuch Pflicht)</span></span></label>
      <button className="knopf">Besuch speichern</button>
    </>
  );
}
