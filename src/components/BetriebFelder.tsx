type B = { inhaberGeburtsdatum?: string | null; name?: string; gewerk?: string; anrede?: string | null; inhaber?: string | null; strasse?: string | null; plz?: string | null; ort?: string | null; telefon?: string | null; email?: string | null; website?: string | null; notizen?: string | null; datenquelle?: string | null };

export const GEWERKE = ["SHK", "Elektro", "Schreiner", "Maler", "Ausbau", "Kfz"];

// Eingabe eines Betriebs in vier klaren Gruppen. Pflicht ist nur der Name; alles andere hilft später (Brief, Besuch, Angebot).
export function BetriebFelder({ b = {} }: { b?: B }) {
  return (
    <div className="gruppen zweispaltig">
      <fieldset className="gruppe">
        <legend><span className="nr">1</span> Betrieb und Adresse</legend>
        <div className="raster" style={{ gridTemplateColumns: "minmax(0, 2fr) minmax(0, 0.8fr) minmax(0, 1.4fr)", gap: 12 }}>
          <label className="feld" style={{ gridColumn: "span 2" }}><span>Name des Betriebs <em className="pflicht">Pflicht</em></span><input name="name" required defaultValue={b.name} placeholder="z. B. Sanitär Muster GmbH" /></label>
          <label className="feld"><span>Gewerk</span>
            <select name="gewerk" defaultValue={b.gewerk ?? "SHK"}>{GEWERKE.map((g) => <option key={g}>{g}</option>)}</select>
          </label>
          <label className="feld"><span>Straße und Nr. <em>für Brief und Besuch</em></span><input name="strasse" defaultValue={b.strasse ?? ""} autoComplete="street-address" /></label>
          <label className="feld"><span>PLZ</span><input name="plz" defaultValue={b.plz ?? ""} inputMode="numeric" /></label>
          <label className="feld"><span>Ort</span><input name="ort" defaultValue={b.ort ?? ""} /></label>
          <label className="feld" style={{ gridColumn: "span 2" }}><span>Website <em className="pflicht">Pflicht</em></span><input name="website" defaultValue={b.website ?? ""} placeholder="beispiel.de" /></label>
          <label className="haken" style={{ alignSelf: "end", marginBottom: 12 }}><input type="checkbox" name="keineWebsite" value="ja" defaultChecked={b.name !== undefined && !b.website} /><span>Keine Website vorhanden</span></label>
        </div>
      </fieldset>

      <fieldset className="gruppe">
        <legend><span className="nr">2</span> Inhaber und Kontakt</legend>
        <div className="raster zwei">
          <div className="raster" style={{ gridTemplateColumns: "110px minmax(0, 1fr)", gap: 12, gridColumn: "1 / -1" }}>
            <label className="feld"><span>Anrede</span>
              <select name="anrede" defaultValue={b.anrede ?? "Herr"}><option>Herr</option><option>Frau</option></select>
            </label>
            <label className="feld"><span>Inhaber <em>optional</em></span><input name="inhaber" defaultValue={b.inhaber ?? ""} placeholder="Vorname Nachname" /></label>
          </div>
          <label className="feld"><span>Geburtsdatum Inhaber <em>optional</em></span><input name="geburtsdatum" type="date" defaultValue={b.inhaberGeburtsdatum ?? ""} max={new Date().toISOString().slice(0, 10)} /></label>
          <label className="feld"><span>Telefon <em>optional</em></span><input name="telefon" type="tel" defaultValue={b.telefon ?? ""} placeholder="0721 …" /></label>
          <label className="feld" style={{ gridColumn: "1 / -1" }}><span>E-Mail <em>optional</em></span><input name="email" type="email" defaultValue={b.email ?? ""} /><small>Kann später nachgetragen werden; für Angebot und Kundenportal wird sie gebraucht.</small></label>
        </div>
      </fieldset>

      <fieldset className="gruppe ganz">
        <legend><span className="nr">3</span> Notizen</legend>
        <label className="feld"><span>Notizen <em>optional</em></span><textarea name="notizen" defaultValue={b.notizen ?? ""} style={{ minHeight: 80 }} placeholder="Was wissen wir schon? z. B. drei offene Stellen, Website von 2015" /></label>
        {b.datenquelle ? <input type="hidden" name="datenquelle" value={b.datenquelle} /> : null}
      </fieldset>
    </div>
  );
}
