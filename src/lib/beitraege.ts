import fs from "node:fs";
import path from "node:path";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "./db";
import { protokolliere } from "./protokoll";
import { datenOrdner } from "./pfade";
import { pruefeDatei } from "./sicherheit";

// Marketing & Sichtbarkeit: Beiträge und Antworten auf Bewertungen.
// Ablauf: Entwurf (Levarex oder Agent) → „Dem Betrieb vorlegen“ legt eine Mail mit allen Texten in den Postausgang
// (Qualitätskontrolle + Freigabe durch Levarex) → nach Versand sieht der Betrieb die Entwürfe im Portal und gibt
// jeden einzeln frei oder wünscht eine Änderung → Levarex veröffentlicht und markiert ihn. Nichts geht ohne beide Freigaben raus.

export const BEITRAG_STATUS: Record<string, string> = {
  entwurf: "Entwurf",
  zur_vorlage: "Vorlage in den Freigaben",
  beim_kunden: "beim Betrieb zur Freigabe",
  freigegeben: "vom Betrieb freigegeben",
  abgelehnt: "Änderung gewünscht",
  veroeffentlicht: "veröffentlicht",
};
export const KANAELE: Record<string, string> = { instagram: "Instagram", facebook: "Facebook", google: "Google-Profil" };
export const BEITRAG_ARTEN: Record<string, string> = { beitrag: "Beitrag", bewertung_antwort: "Antwort auf Bewertung" };
const MAX_TEXT = 2200; // Instagram-Grenze

export type Beitrag = typeof schema.beitraege.$inferSelect;

export async function beitraegeVon(betriebId: number): Promise<Beitrag[]> {
  const db = await getDb();
  return db.select().from(schema.beitraege).where(eq(schema.beitraege.betriebId, betriebId)).orderBy(desc(schema.beitraege.erstelltAm));
}

/** Entwurf anlegen (Kundenakte oder Agent über die Schnittstelle). Bild nur über pruefeDatei. */
export async function beitragAnlegen(o: { betriebId: number; art: string; kanaele: string[]; text: string; bezug?: string; geplantAm?: Date | null; bild?: File | null }, wer: string): Promise<number> {
  const text = o.text.trim();
  if (!text) throw new Error("Text fehlt.");
  if (text.length > MAX_TEXT) throw new Error(`Text zu lang (höchstens ${MAX_TEXT} Zeichen).`);
  const art = o.art in BEITRAG_ARTEN ? o.art : "beitrag";
  const kanaele = [...new Set(o.kanaele)].filter((k) => k in KANAELE);
  if (!kanaele.length) throw new Error("Bitte mindestens einen Kanal wählen.");
  if (art === "bewertung_antwort" && !o.bezug?.trim()) throw new Error("Bitte den Text der Bewertung angeben, auf die wir antworten.");
  const db = await getDb();
  const [neu] = await db
    .insert(schema.beitraege)
    .values({ betriebId: o.betriebId, art, kanaele, text, bezug: o.bezug?.trim() || null, geplantAm: o.geplantAm ?? null, erstelltVon: wer })
    .returning({ id: schema.beitraege.id });
  if (o.bild && o.bild.size > 0) {
    const { daten, endung } = await pruefeDatei(o.bild, ["bild"], 15).catch(async (e) => {
      await db.delete(schema.beitraege).where(eq(schema.beitraege.id, neu.id));
      throw e;
    });
    const name = `beitrag-${neu.id}.${endung}`;
    fs.writeFileSync(path.join(datenOrdner("beitraege", String(o.betriebId)), name), daten);
    await db.update(schema.beitraege).set({ bild: name }).where(eq(schema.beitraege.id, neu.id));
  }
  await protokolliere(wer, `${BEITRAG_ARTEN[art]} als Entwurf angelegt`, o.betriebId);
  return neu.id;
}

/** Alle Entwürfe (und überarbeiteten) eines Betriebs vorlegen: eine Mail mit allen Texten in den Postausgang. */
export async function beitraegeVorlegen(betriebId: number, wer: string): Promise<number> {
  const db = await getDb();
  const offen = (await beitraegeVon(betriebId)).filter((x) => x.status === "entwurf").reverse();
  if (!offen.length) throw new Error("Keine Entwürfe zum Vorlegen.");
  const [b] = await db.select().from(schema.betriebe).where(eq(schema.betriebe.id, betriebId));
  const { inPostausgang } = await import("./ablauf/postausgang");
  const { portalLink } = await import("./kundenportal");
  const liste = offen.map((x, i) => `${i + 1}. ${BEITRAG_ARTEN[x.art]} für ${x.kanaele.map((k) => KANAELE[k]).join(", ")}${x.bild ? " (mit Foto)" : ""}:\n${x.text}`).join("\n\n");
  const eintragId = await inPostausgang({
    betriebId,
    kanal: "mail",
    zweck: "beitraege_vorlage",
    empfaenger: b.email ?? "(E-Mail-Adresse fehlt)",
    betreff: offen.length === 1 ? "Ein neuer Beitrag zur Freigabe" : `${offen.length} neue Beiträge zur Freigabe`,
    text: `Guten Tag,\n\nin Ihrem Kundenportal liegen neue Entwürfe. Bitte geben Sie jeden frei oder schreiben Sie uns, was wir ändern sollen. Veröffentlicht wird nur, was Sie freigegeben haben.\n${await portalLink(betriebId)}#beitraege\n\n${liste}\n\nMit freundlichen Grüßen\nMaximilian Steiner\nLevarex Consulting`,
    hinweise: b.email ? [] : ["E-Mail-Adresse fehlt. Beim Betrieb ergänzen und Empfänger anpassen."],
    meta: { beitragIds: offen.map((x) => x.id) },
  });
  await db.update(schema.beitraege).set({ status: "zur_vorlage", eintragId }).where(inArray(schema.beitraege.id, offen.map((x) => x.id)));
  await protokolliere(wer, `${offen.length} Entwürfe zur Vorlage beim Betrieb`, betriebId);
  return eintragId;
}

/** Nach Versand der Vorlage-Mail (aus nachVersand): Entwürfe im Portal sichtbar. */
export async function beitraegeBeimKunden(ids: number[]): Promise<void> {
  if (!ids.length) return;
  const db = await getDb();
  await db.update(schema.beitraege).set({ status: "beim_kunden", vorgelegtAm: new Date() }).where(and(inArray(schema.beitraege.id, ids), eq(schema.beitraege.status, "zur_vorlage")));
}

/** Entscheidung des Betriebs im Portal. */
export async function beitragEntscheiden(id: number, betriebId: number, o: { freigeben: boolean; kommentar?: string }, wer: string): Promise<void> {
  const db = await getDb();
  const [x] = await db.select().from(schema.beitraege).where(and(eq(schema.beitraege.id, id), eq(schema.beitraege.betriebId, betriebId)));
  if (!x || x.status !== "beim_kunden") throw new Error("Dieser Entwurf wartet nicht auf Ihre Freigabe.");
  const kommentar = o.kommentar?.trim().slice(0, 1000) || null;
  if (!o.freigeben && !kommentar) throw new Error("Bitte kurz schreiben, was wir ändern sollen.");
  await db.update(schema.beitraege).set({ status: o.freigeben ? "freigegeben" : "abgelehnt", kommentar, entschiedenAm: new Date(), entschiedenVon: wer }).where(eq(schema.beitraege.id, id));
  await protokolliere(wer, `${BEITRAG_ARTEN[x.art]} ${o.freigeben ? "vom Betrieb freigegeben" : "zurück mit Änderungswunsch"}`, betriebId, kommentar ?? undefined);
  const { systemAufgabe } = await import("./ablauf/crm");
  await systemAufgabe({ betriebId, titel: o.freigeben ? "Freigegebene Beiträge veröffentlichen" : "Beitrag nach Wunsch des Betriebs überarbeiten", text: kommentar ?? undefined, inTagen: 1, zustaendig: "Maximilian Steiner" });
}

/** Überarbeiten nach Änderungswunsch: neuer Text, zurück auf Entwurf. */
export async function beitragUeberarbeiten(id: number, text: string, wer: string): Promise<void> {
  const db = await getDb();
  const [x] = await db.select().from(schema.beitraege).where(eq(schema.beitraege.id, id));
  if (!x || !["entwurf", "abgelehnt"].includes(x.status)) throw new Error("Nur Entwürfe und zurückgegebene Beiträge lassen sich ändern.");
  if (!text.trim() || text.length > MAX_TEXT) throw new Error("Text fehlt oder ist zu lang.");
  await db.update(schema.beitraege).set({ text: text.trim(), status: "entwurf", eintragId: null }).where(eq(schema.beitraege.id, id));
  await protokolliere(wer, `${BEITRAG_ARTEN[x.art]} überarbeitet`, x.betriebId);
}

/** Levarex hat den freigegebenen Beitrag veröffentlicht (über die offizielle Schnittstelle bzw. von Hand). */
export async function beitragVeroeffentlicht(id: number, wer: string): Promise<void> {
  const db = await getDb();
  const [x] = await db.select().from(schema.beitraege).where(eq(schema.beitraege.id, id));
  if (!x || x.status !== "freigegeben") throw new Error("Veröffentlichen geht nur nach Freigabe durch den Betrieb.");
  await db.update(schema.beitraege).set({ status: "veroeffentlicht", veroeffentlichtAm: new Date() }).where(eq(schema.beitraege.id, id));
  await protokolliere(wer, `${BEITRAG_ARTEN[x.art]} veröffentlicht`, x.betriebId);
}

export async function beitragLoeschen(id: number, wer: string): Promise<void> {
  const db = await getDb();
  const [x] = await db.select().from(schema.beitraege).where(eq(schema.beitraege.id, id));
  if (!x) return;
  if (x.bild) fs.rmSync(path.join(datenOrdner("beitraege", String(x.betriebId)), x.bild), { force: true });
  await db.delete(schema.beitraege).where(eq(schema.beitraege.id, id));
  await protokolliere(wer, `${BEITRAG_ARTEN[x.art]} gelöscht`, x.betriebId);
}

/** Bild eines Beitrags. Für das Portal nur, wenn der Betrieb den Entwurf sehen darf. */
export async function beitragBild(id: number, o: { betriebId?: number; nurSichtbar?: boolean } = {}): Promise<{ daten: Buffer; typ: string } | null> {
  const db = await getDb();
  const [x] = await db.select().from(schema.beitraege).where(eq(schema.beitraege.id, id));
  if (!x?.bild || (o.betriebId && x.betriebId !== o.betriebId)) return null;
  if (o.nurSichtbar && ["entwurf", "zur_vorlage"].includes(x.status)) return null;
  const datei = path.join(datenOrdner("beitraege", String(x.betriebId)), path.basename(x.bild));
  if (!fs.existsSync(datei)) return null;
  const endung = path.extname(datei).slice(1);
  return { daten: fs.readFileSync(datei), typ: endung === "jpg" ? "image/jpeg" : `image/${endung}` };
}

/** Alle Bilder eines Betriebs löschen (Löschung nach Art. 17). */
export function beitragsbilderLoeschen(betriebId: number): void {
  fs.rmSync(datenOrdner("beitraege", String(betriebId)), { recursive: true, force: true });
}
