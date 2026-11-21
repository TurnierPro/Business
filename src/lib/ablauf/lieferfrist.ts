import { and, eq, isNotNull } from "drizzle-orm";
import { getDb, schema } from "../db";
import { melde } from "../adapters/push";
import { protokolliere } from "../protokoll";
import { datumDe } from "../docs/basis";
import { PAKETE, PaketKey } from "../pakete";
import { INHALTE_BESTAETIGUNG_WERKTAGE, LIEFERFRIST_WARNUNG_TAGE } from "../recht";
import { portalLink } from "../kundenportal";
import { inPostausgang } from "./postausgang";
import { systemAufgabe, TECHNIK } from "./crm";
import { betrieb, SYSTEM } from "./gemeinsam";

// Lieferfrist nach Leistungskatalog: 3 Wochen (Kompakt) bzw. 6 Wochen (Professional) nach Eingang der vollständigen Inhalte.
// Erfüllt ist sie mit der Bereitstellung als Vorschau zur Abnahme; die Abnahmefrist des Kunden zählt nicht mit.

type Projekt = typeof schema.projekte.$inferSelect;

/** Datum plus n Werktage (Montag bis Freitag; Feiertage zählen hier als Werktag, Frist also eher kürzer). */
export function plusWerktage(start: Date, n: number): Date {
  const d = new Date(start);
  let rest = n;
  while (rest > 0) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) rest--;
  }
  return d;
}

export function lieferfristBis(p: Pick<Projekt, "paket" | "inhalteAm">): Date | null {
  if (!p.inhalteAm) return null;
  const wochen = PAKETE[p.paket as PaketKey]?.wochen ?? 6;
  return new Date(p.inhalteAm.getTime() + wochen * 7 * 864e5);
}

/** Bereitgestellt heißt: gebaut, geprüft und als Vorschau beim Kunden (oder schon weiter). */
export function bereitgestellt(p: Pick<Projekt, "status">): boolean {
  return ["bereit", "live", "beendet"].includes(p.status);
}

export type Mitwirkung = { titel: string; erledigt: boolean; hinweis?: string };

/** Mitwirkungsliste (M): was wir vom Betrieb brauchen. Sichtbar im Portal und im Projekt. */
export function mitwirkungsliste(p: Pick<Projekt, "inhalte" | "onboarding" | "domain">): Mitwirkung[] {
  const i = (p.inhalte ?? {}) as { claim?: string; leistungen?: string; telefon?: string; email?: string; bilder?: unknown[]; ueberUns?: string };
  const o = (p.onboarding ?? {}) as { rechteInhalte?: string };
  const fotos = Array.isArray(i.bilder) ? i.bilder.length : 0;
  return [
    { titel: "Leistungen, die Sie anbieten", erledigt: !!i.leistungen?.trim() },
    { titel: "Telefon oder E-Mail für Anfragen", erledigt: !!(i.telefon?.trim() || i.email?.trim()) },
    { titel: "Echte Fotos aus dem Betrieb", erledigt: fotos > 0, hinweis: fotos ? `${fotos} Fotos da` : "mindestens eines, besser 6 bis 10" },
    { titel: "Ein Satz über Ihren Betrieb", erledigt: !!(i.claim?.trim() || i.ueberUns?.trim()) },
    { titel: "Bestätigung: Sie dürfen Texte und Fotos verwenden", erledigt: o.rechteInhalte === "bestaetigt" },
    ...(p.domain ? [{ titel: "Zugang oder Auftrag für Ihre Domain", erledigt: true, hinweis: p.domain }] : []),
  ];
}

/** Eingangsbestätigung an den Kunden (über Freigabe). Nennt das Fertig-Datum laut Leistungsversprechen. */
export async function inhalteBestaetigen(projektId: number): Promise<number | null> {
  const db = await getDb();
  const [p] = await db.select().from(schema.projekte).where(eq(schema.projekte.id, projektId));
  const bis = p && lieferfristBis(p);
  if (!p || !bis) return null;
  const b = await betrieb(p.betriebId);
  const paket = PAKETE[p.paket as PaketKey];
  const offen = mitwirkungsliste(p).filter((m) => !m.erledigt);
  const datum = datumDe(bis);
  return inPostausgang({
    betriebId: b.id,
    projektId,
    kanal: "mail",
    zweck: "inhalte_eingang",
    empfaenger: b.email ?? "(E-Mail-Adresse fehlt)",
    betreff: "Ihre Inhalte sind bei uns angekommen",
    text: `Guten Tag,\n\ndanke, Ihre Texte und Fotos sind bei uns angekommen. Wir bauen jetzt Ihre Website.${offen.length ? `\n\nEs fehlt noch: ${offen.map((m) => m.titel).join(", ")}. Bitte reichen Sie das nach, sobald es geht; wir melden uns dazu auch telefonisch.` : ""}\n\nSpätestens am ${datum} bekommen Sie die fertige Seite als Vorschau zur Abnahme (${paket?.wochen ?? 6} Wochen nach Eingang Ihrer Inhalte). Online geht sie nach Ihrer Abnahme.\n\nDen Stand sehen Sie jederzeit in Ihrem Kundenportal:\n${await portalLink(b.id)}\n\nMit freundlichen Grüßen\nMaximilian Steiner\nLevarex Consulting`,
    erlaubteZahlen: [datum, String(paket?.wochen ?? 6)],
    meta: { projektId, lieferfrist: bis.toISOString() },
  });
}

/** Agent (täglich): Eingangsbestätigung überfällig, Lieferfrist knapp oder verfehlt. */
export async function lieferfristenPruefen(jetzt = new Date()): Promise<string> {
  const db = await getDb();
  const projekte = await db.select().from(schema.projekte).where(and(isNotNull(schema.projekte.inhalteAm)));
  let meldungen = 0;
  for (const p of projekte) {
    const bis = lieferfristBis(p);
    if (!bis || bereitgestellt(p)) continue;
    const b = await betrieb(p.betriebId);
    const eingang = (await db.select().from(schema.postausgang).where(eq(schema.postausgang.projektId, p.id))).find((e) => e.zweck === "inhalte_eingang");
    if (eingang && eingang.status === "zur_freigabe" && plusWerktage(p.inhalteAm!, INHALTE_BESTAETIGUNG_WERKTAGE) <= jetzt) {
      await systemAufgabe({ betriebId: b.id, projektId: p.id, titel: "Eingang der Inhalte bestätigen", text: `Die Bestätigung an ${b.name} wartet im Postausgang (Zusage: binnen ${INHALTE_BESTAETIGUNG_WERKTAGE} Werktagen).`, inTagen: 0, zustaendig: TECHNIK });
      meldungen++;
    }
    const resttage = Math.ceil((bis.getTime() - jetzt.getTime()) / 864e5);
    if (resttage < 0) {
      await systemAufgabe({ betriebId: b.id, projektId: p.id, titel: "Lieferfrist verfehlt", text: `Frist war der ${datumDe(bis)}. Leistungsversprechen: ein Monat Betreuung ohne Berechnung. Kunden anrufen, Gutschrift vormerken.`, inTagen: 0, zustaendig: TECHNIK });
      meldungen++;
    } else if (resttage <= LIEFERFRIST_WARNUNG_TAGE) {
      await melde("job", false, `Lieferfrist knapp: ${b.name}`, `Noch ${resttage} Tage bis ${datumDe(bis)}. Stand: ${p.status}.`);
      meldungen++;
    }
  }
  if (meldungen) await protokolliere(SYSTEM, `Lieferfristen geprüft: ${meldungen} Hinweise`);
  return `${meldungen} Hinweise zu Lieferfristen`;
}
