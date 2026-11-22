import crypto from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "../db";
import { protokolliere } from "../protokoll";
import { GLAEUBIGER_ID } from "../recht";
import { datumDe } from "../docs/basis";
import { anschrift, betrieb, neuesDokument } from "./gemeinsam";
import { pruefsumme, unterschriftsbildOk } from "./vertraege";
import type { SepaMandatDaten } from "../docs/vorlagen";

// SEPA-Lastschriftmandat für die Monatsbeiträge. Der Kontoinhaber unterschreibt beim Termin auf dem Tablet
// (zusammen mit den Verträgen) oder später selbst im Kundenportal. Das Mandat liegt danach als Dokument beim Betrieb,
// im Portal zum Lesen, und die Einrichtung des Einzugs bei Qonto nimmt darauf Bezug.
// Basislastschrift: auch Unternehmer können binnen 8 Wochen die Erstattung verlangen. Die Firmenlastschrift
// bräuchte zusätzlich eine Bestätigung bei der Bank des Kunden; das ist im Handwerk eine Hürde.

/** IBAN prüfen (Länge je Land grob, Prüfziffer nach ISO 13616). Gibt die IBAN ohne Leerzeichen in Großbuchstaben zurück oder null. */
export function ibanPruefen(eingabe: unknown): string | null {
  if (typeof eingabe !== "string") return null;
  const iban = eingabe.replace(/[\s-]/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return null;
  if (iban.startsWith("DE") && iban.length !== 22) return null;
  const umgestellt = iban.slice(4) + iban.slice(0, 4);
  const ziffern = umgestellt.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let rest = 0;
  for (const z of ziffern) rest = (rest * 10 + Number(z)) % 97;
  return rest === 1 ? iban : null;
}

/** BIC ist freiwillig (innerhalb des SEPA-Raums reicht die IBAN). Wenn angegeben, muss sie passen. */
export function bicPruefen(eingabe: unknown): string | null | false {
  const bic = typeof eingabe === "string" ? eingabe.replace(/\s/g, "").toUpperCase() : "";
  if (!bic) return null;
  return /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(bic) ? bic : false;
}

/** Für Anzeigen: nur Land, Prüfziffer und die letzten vier Stellen. */
export const ibanMaskiert = (iban: string) => `${iban.slice(0, 4)} •••• •••• ${iban.slice(-4)}`;
/** Für das Dokument: in Vierergruppen. */
export const ibanLesbar = (iban: string) => iban.replace(/(.{4})/g, "$1 ").trim();

export type MandatEingabe = {
  betriebId: number;
  angebotId: number;
  kontoinhaber: string;
  iban: string;
  bic?: string;
  /** Wer unterschreibt (Kontoinhaber oder Vertretung des Betriebs) */
  name: string;
  bild: string;
  /** Kanal und Person, z. B. „Tablet beim Termin, bedient von Daniel Lück“ oder „Kundenportal“ */
  wer: string;
  ort?: string;
};

/** Eingaben prüfen, ohne etwas zu speichern. Wirft eine verständliche Fehlermeldung. */
export function mandatPruefen(e: Omit<MandatEingabe, "betriebId" | "angebotId" | "wer">): { iban: string; bic: string | null } {
  const iban = ibanPruefen(e.iban);
  if (!iban) throw new Error("Die IBAN stimmt nicht. Bitte noch einmal vom Kontoauszug abschreiben.");
  const bic = bicPruefen(e.bic);
  if (bic === false) throw new Error("Die BIC stimmt nicht. Sie kann auch leer bleiben.");
  if (e.kontoinhaber.trim().length < 3) throw new Error("Bitte den Kontoinhaber eintragen (so wie bei der Bank).");
  if (e.name.trim().length < 3) throw new Error("Bitte den vollständigen Namen der Person eintragen, die das Mandat unterschreibt.");
  if (!unterschriftsbildOk(e.bild)) throw new Error("Unterschrift unter dem SEPA-Mandat fehlt.");
  return { iban, bic };
}

/** Gültiges (nicht ersetztes) Mandat eines Betriebs. */
export async function aktivesMandat(betriebId: number) {
  const db = await getDb();
  const doks = await db.select().from(schema.dokumente).where(and(eq(schema.dokumente.betriebId, betriebId), eq(schema.dokumente.art, "sepa_mandat"))).orderBy(desc(schema.dokumente.id));
  const d = doks.find((x) => !(x.daten as SepaMandatDaten).ersetztAm);
  return d ? { ...d, daten: d.daten as SepaMandatDaten } : null;
}

/** Braucht der Betrieb ein Mandat? Ja, sobald ein Auftrag mit Monatsbeitrag unterschrieben ist und noch keines vorliegt. */
export async function mandatOffen(betriebId: number): Promise<{ angebotId: number } | null> {
  const db = await getDb();
  const angebote = await db.select().from(schema.angebote).where(eq(schema.angebote.betriebId, betriebId)).orderBy(desc(schema.angebote.unterschriebenAm));
  const a = angebote.find((x) => x.unterschriebenAm && ["unterschrieben", "angezahlt", "abgeschlossen"].includes(x.status));
  if (!a || a.monatlich <= 0) return null;
  return (await aktivesMandat(betriebId)) ? null : { angebotId: a.id };
}

/** Mandat erteilen: Dokument mit Unterschrift anlegen, ein älteres Mandat gilt als ersetzt. Gibt die Dokument-ID zurück. */
export async function mandatErteilen(e: MandatEingabe): Promise<number> {
  const { iban, bic } = mandatPruefen(e);
  const db = await getDb();
  const b = await betrieb(e.betriebId);
  const [angebot] = await db.select({ id: schema.angebote.id }).from(schema.angebote).where(and(eq(schema.angebote.id, e.angebotId), eq(schema.angebote.betriebId, b.id)));
  if (!angebot) throw new Error("Das Angebot gehört nicht zu diesem Betrieb.");
  const alt = await aktivesMandat(b.id);
  const am = new Date();
  // Mandatsreferenz: eindeutig, höchstens 35 Zeichen, nur erlaubte Zeichen
  const referenz = `LVX-${String(b.id).padStart(5, "0")}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
  const daten: SepaMandatDaten = {
    an: anschrift(b),
    nummer: referenz,
    datum: datumDe(),
    glaeubigerId: GLAEUBIGER_ID,
    angebotId: e.angebotId,
    konto: { inhaber: e.kontoinhaber.trim(), iban, bic },
    ort: e.ort?.trim() || b.ort || null,
    // Im Portal erteilt: sofort beim Kunden sichtbar. Auf dem Tablet: geht mit der Auftragsbestätigung raus.
    kanal: e.wer.startsWith("Kundenportal") ? "portal" : "tablet",
  };
  const summe = pruefsumme(daten as unknown as Record<string, unknown>);
  daten.unterschriften = [{ rolle: "kunde", name: e.name.trim(), funktion: null, bild: e.bild, am: am.toISOString() }];
  const id = await neuesDokument({ betriebId: b.id, art: "sepa_mandat", titel: `SEPA-Lastschriftmandat ${referenz}`, daten });
  await db.insert(schema.unterschriften).values({ betriebId: b.id, angebotId: e.angebotId, dokumentId: id, rolle: "kunde", name: e.name.trim(), funktion: null, bild: e.bild, pruefsumme: summe, erfasstVon: e.wer, am });
  if (alt) await db.update(schema.dokumente).set({ daten: { ...alt.daten, ersetztAm: am.toISOString(), ersetztDurch: referenz } }).where(eq(schema.dokumente.id, alt.id));
  const { hakeAb } = await import("./checkliste");
  for (const pr of await db.select({ id: schema.projekte.id }).from(schema.projekte).where(eq(schema.projekte.betriebId, b.id))) await hakeAb(pr.id, "mandat");
  // Liegt die Einrichtung des Einzugs schon zur Freigabe, dort das Mandat nachtragen
  for (const l of await db.select().from(schema.postausgang).where(and(eq(schema.postausgang.betriebId, b.id), eq(schema.postausgang.zweck, "lastschrift_start"), eq(schema.postausgang.status, "zur_freigabe")))) {
    const ohne = (h: string) => !h.startsWith("Kein SEPA-Mandat");
    await db
      .update(schema.postausgang)
      .set({
        text: l.text.replace(/Noch kein SEPA-Mandat im Kundenportal: Qonto schickt dem Kunden den Link zum Mandat\.|SEPA-Mandat liegt unterschrieben vor \(Mandatsreferenz [^)]*\)\./, `SEPA-Mandat liegt unterschrieben vor (Mandatsreferenz ${referenz}).`),
        hinweise: l.hinweise.filter(ohne),
        meta: { ...l.meta, mandatsreferenz: referenz, mandatDokumentId: id, vorab: ((l.meta.vorab as string[] | undefined) ?? []).filter(ohne) },
      })
      .where(eq(schema.postausgang.id, l.id));
  }
  await protokolliere(e.wer, `SEPA-Mandat erteilt: ${referenz}, Konto ${ibanMaskiert(iban)}${alt ? ` (ersetzt ${alt.daten.nummer})` : ""}`, b.id);
  return id;
}
