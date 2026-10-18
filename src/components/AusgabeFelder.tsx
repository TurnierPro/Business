import { KATEGORIEN } from "@/lib/finanzen";

type A = { datum?: Date; lieferant?: string; beschreibung?: string | null; kategorie?: string; netto?: number; ust?: number; ustSatz?: number; bezahlt?: boolean };

export function AusgabeFelder({ a = {} }: { a?: A }) {
  const brutto = a.netto !== undefined ? ((a.netto + (a.ust ?? 0)) / 100).toFixed(2).replace(".", ",") : "";
  const tag = (a.datum ?? new Date()).toISOString().slice(0, 10);
  return (
    <>
      <div className="raster zwei">
        <label className="feld"><span>Lieferant</span><input name="lieferant" required defaultValue={a.lieferant === "Beleg prüfen" ? "" : a.lieferant} placeholder="z. B. Hetzner Online GmbH" /></label>
        <label className="feld"><span>Datum</span><input name="datum" type="date" required defaultValue={tag} /></label>
        <label className="feld"><span>Betrag brutto (€)</span><input name="brutto" inputMode="decimal" required defaultValue={brutto} placeholder="119,00" /></label>
        <label className="feld"><span>Umsatzsteuer</span>
          <select name="ustSatz" defaultValue={String(a.ustSatz ?? 19)}><option value="19">19 %</option><option value="7">7 %</option><option value="0">0 % (z. B. Versicherung, Ausland)</option></select>
        </label>
        <label className="feld"><span>Kategorie</span>
          <select name="kategorie" defaultValue={a.kategorie ?? "software"}>{KATEGORIEN.map((k) => <option key={k.key} value={k.key}>{k.name}</option>)}</select>
        </label>
        <label className="feld"><span>Beschreibung</span><input name="beschreibung" defaultValue={a.beschreibung ?? ""} placeholder="z. B. Server November" /></label>
      </div>
      <label className="haken" style={{ marginBottom: 16 }}>
        <input type="checkbox" name="bezahlt" value="ja" defaultChecked={a.bezahlt ?? true} />
        <span>Schon bezahlt (zählt dann für die Vorsteuer)</span>
      </label>
      <label className="feld"><span>Beleg (Foto oder PDF)</span><input type="file" name="beleg" accept="image/*,application/pdf" capture="environment" /></label>
    </>
  );
}
