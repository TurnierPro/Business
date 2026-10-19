type B = { name?: string; gewerk?: string; anrede?: string | null; inhaber?: string | null; strasse?: string | null; plz?: string | null; ort?: string | null; telefon?: string | null; email?: string | null; website?: string | null; notizen?: string | null; datenquelle?: string | null };

export const GEWERKE = ["SHK", "Elektro", "Schreiner", "Maler", "Ausbau", "Kfz"];

export function BetriebFelder({ b = {} }: { b?: B }) {
  return (
    <>
      <div className="raster zwei">
        <label className="feld"><span>Betrieb</span><input name="name" required defaultValue={b.name} /></label>
        <label className="feld"><span>Gewerk</span>
          <select name="gewerk" defaultValue={b.gewerk ?? "SHK"}>{GEWERKE.map((g) => <option key={g}>{g}</option>)}</select>
        </label>
        <label className="feld"><span>Anrede</span>
          <select name="anrede" defaultValue={b.anrede ?? "Herr"}><option>Herr</option><option>Frau</option></select>
        </label>
        <label className="feld"><span>Inhaber</span><input name="inhaber" defaultValue={b.inhaber ?? ""} placeholder="Vorname Nachname" /></label>
        <label className="feld"><span>Straße</span><input name="strasse" defaultValue={b.strasse ?? ""} autoComplete="street-address" /></label>
        <div className="raster zwei" style={{ gap: 12 }}>
          <label className="feld"><span>PLZ</span><input name="plz" defaultValue={b.plz ?? ""} inputMode="numeric" /></label>
          <label className="feld"><span>Ort</span><input name="ort" defaultValue={b.ort ?? ""} /></label>
        </div>
        <label className="feld"><span>Telefon</span><input name="telefon" type="tel" defaultValue={b.telefon ?? ""} /></label>
        <label className="feld"><span>E-Mail</span><input name="email" type="email" defaultValue={b.email ?? ""} /><small>Nur für Kunden, die uns ihre Adresse gegeben haben. Kein Erstkontakt per E-Mail.</small></label>
        <label className="feld"><span>Website</span><input name="website" defaultValue={b.website ?? ""} placeholder="beispiel.de" /></label>
      </div>
      <label className="feld"><span>Woher stammen die Daten?</span><input name="datenquelle" defaultValue={b.datenquelle ?? ""} placeholder="z. B. Impressum beispiel.de, abgerufen am 19.10.2026" /><small>Pflicht nach Art. 14 DSGVO. Steht im Akquise-Brief. Leer lassen: Stelax OS trägt die Website bzw. „manuell erfasst“ ein.</small></label>
      <label className="feld"><span>Notizen</span><textarea name="notizen" defaultValue={b.notizen ?? ""} style={{ minHeight: 80 }} /></label>
    </>
  );
}
