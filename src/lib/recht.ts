import { marke } from "./marke";

// Rechtliche Festwerte an einer Stelle. Keine Rechtsberatung: Werte und Texte prüfen Anwalt bzw. Steuerberater.
// Quelle: docs/unterlagen-bericht.md

/** Version der AGB, auf die Angebot und Annahme verweisen. Nach jeder Änderung durch den Anwalt hochzählen. */
export const AGB_VERSION = process.env.AGB_VERSION ?? "Entwurf 10/2026";
export const AGB_URL = `https://${marke.absender.web}/agb`;

/** Zahlungsziel als Kalenderdatum: Verzug tritt dann ohne Mahnung ein (§ 286 Abs. 2 BGB). */
export const ZAHLUNGSZIEL_TAGE = 14;

/** Basiszins nach § 247 BGB. Ändert sich zum 1.1. und 1.7., dann hier anpassen. */
export const BASISZINS = { prozent: 1.52, ab: "2026-07-01", naechsteAnpassung: "2027-01-01" };
/** B2B-Verzugszins: 9 Prozentpunkte über dem Basiszins (§ 288 Abs. 2 BGB). */
export const VERZUGSZINS_PROZENT = BASISZINS.prozent + 9;
/** Pauschale je Forderung im B2B-Verzug (§ 288 Abs. 5 BGB), in Cent. */
export const VERZUGSPAUSCHALE = 4000;

/** Frist zur Abnahme nach Livegang. Danach gilt das Werk als abgenommen, wenn kein Mangel genannt wurde (§ 640 Abs. 2 BGB). */
export const ABNAHME_FRIST_TAGE = 14;

/** Angebote ohne Auftrag werden nach dieser Zeit gelöscht (Löschkonzept). */
export const ANGEBOT_LOESCHEN_TAGE = 365;

export function basiszinsVeraltet(heute = new Date()): boolean {
  return heute.toISOString().slice(0, 10) >= BASISZINS.naechsteAnpassung;
}

/** Verzugszinsen in Cent für einen Bruttobetrag über eine Anzahl Tage. */
export function verzugszinsen(brutto: number, tage: number): number {
  return Math.max(0, Math.round((brutto * VERZUGSZINS_PROZENT * tage) / 100 / 365));
}

/** Pflichtangaben nach § 35a GmbHG für Briefe, Rechnungen, Angebote und E-Mails. */
export function pflichtangaben(): { firma: string; register: string; gf: string } {
  const a = marke.absender;
  const register = a.hrb ? `Sitz ${a.sitz} · ${a.registergericht} ${a.hrb}` : `Sitz ${a.sitz} · ${a.registergericht}, HRB folgt`;
  return { firma: a.firma, register, gf: `Geschäftsführer: ${a.geschaeftsfuehrer}` };
}

/** Wird an jede ausgehende E-Mail gehängt (§ 35a GmbHG gilt auch für E-Mails). */
export function mailSignatur(): string {
  const a = marke.absender;
  const p = pflichtangaben();
  return `\n\n--\n${p.firma}\n${a.strasse}, ${a.ort}\nTel. ${a.telefon} · ${a.email} · ${a.web}\n${p.register}\n${p.gf}`;
}
