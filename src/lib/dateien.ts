import fs from "node:fs";
import path from "node:path";
import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "./db";
import { protokolliere } from "./protokoll";
import { datenOrdner } from "./pfade";
import { pruefeDatei } from "./sicherheit";

// Dateiaustausch im Kundenportal.
// Vom Kunden: Fotos oder PDFs (z. B. neue Bilder, Logo, Preisliste). Sie landen sofort bei uns, mit Aufgabe und Push-Meldung.
// An den Kunden: Wir laden hoch, eine kurze Hinweis-Mail geht über Qualitätskontrolle und Freigabe; erst nach ihrem
// Versand sieht der Kunde die Datei im Portal (Grundregel: nichts verlässt Levarex ohne Freigabe).

export const MAX_MB = 20;
export const MAX_JE_TAG = 30; // Schutz vor Missbrauch über einen weitergegebenen Portal-Link
export type Datei = typeof schema.dateien.$inferSelect;

const ordner = (betriebId: number) => datenOrdner("dateien", String(betriebId));
const sauber = (name: string) => (name.normalize("NFC").replace(/[^\p{L}\p{N} ._()-]/gu, "_").replace(/\s+/g, " ").trim() || "Datei").slice(0, 120);

export async function dateienVon(betriebId: number): Promise<Datei[]> {
  const db = await getDb();
  return db.select().from(schema.dateien).where(eq(schema.dateien.betriebId, betriebId)).orderBy(desc(schema.dateien.erstelltAm));
}

async function speichern(betriebId: number, f: File, richtung: "vom_kunden" | "an_kunden", notiz: string, wer: string): Promise<number> {
  const { daten, endung } = await pruefeDatei(f, ["bild", "pdf"], MAX_MB);
  const db = await getDb();
  const [neu] = await db
    .insert(schema.dateien)
    .values({ betriebId, richtung, name: sauber(f.name), pfad: "", typ: endung, groesse: daten.length, notiz: notiz.trim().slice(0, 500) || null, status: richtung === "vom_kunden" ? "neu" : "entwurf", erstelltVon: wer })
    .returning({ id: schema.dateien.id });
  const pfad = `datei-${neu.id}.${endung}`;
  fs.writeFileSync(path.join(ordner(betriebId), pfad), daten);
  await db.update(schema.dateien).set({ pfad }).where(eq(schema.dateien.id, neu.id));
  return neu.id;
}

/** Kunde lädt im Portal hoch: speichern, Aufgabe für Levarex, Push-Meldung. */
export async function dateiVomKunden(betriebId: number, dateien: File[], notiz: string, wer: string): Promise<number[]> {
  const echt = dateien.filter((f) => f instanceof File && f.size > 0);
  if (!echt.length) throw new Error("Bitte eine Datei auswählen.");
  const db = await getDb();
  const heute = new Date(Date.now() - 864e5);
  const schon = (await dateienVon(betriebId)).filter((d) => d.richtung === "vom_kunden" && d.erstelltAm > heute).length;
  if (schon + echt.length > MAX_JE_TAG) throw new Error(`Heute sind schon ${schon} Dateien angekommen. Bitte morgen weiter oder per E-Mail.`);
  // Erst alles prüfen, dann speichern: ein falsches Format stoppt den ganzen Upload mit Namen der Datei
  const pruefung = await Promise.all(echt.map((f) => pruefeDatei(f, ["bild", "pdf"], MAX_MB).then(() => null).catch(() => f.name)));
  const kaputt = pruefung.filter(Boolean);
  if (kaputt.length) throw new Error(`Diese Dateien gehen nicht (nur Fotos oder PDF, höchstens ${MAX_MB} MB): ${kaputt.join(", ")}`);
  const ids: number[] = [];
  for (const f of echt) ids.push(await speichern(betriebId, f, "vom_kunden", notiz, wer));
  const [b] = await db.select({ name: schema.betriebe.name }).from(schema.betriebe).where(eq(schema.betriebe.id, betriebId));
  const { systemAufgabe, TECHNIK } = await import("./ablauf/crm");
  await systemAufgabe({ betriebId, titel: "Neue Dateien vom Kunden ansehen", text: `${ids.length} Datei${ids.length > 1 ? "en" : ""} im Kundenportal hochgeladen${notiz.trim() ? `: „${notiz.trim().slice(0, 200)}“` : ""}. Kundenakte → Unterlagen → Dateien.`, inTagen: 0, zustaendig: TECHNIK });
  await (await import("./adapters/push")).melde("eingang", true, `Neue Dateien von ${b?.name ?? "einem Kunden"}`, `${ids.length} Datei${ids.length > 1 ? "en" : ""} im Kundenportal`);
  await protokolliere(wer, `${ids.length} Datei${ids.length > 1 ? "en" : ""} im Kundenportal hochgeladen`, betriebId, echt.map((f) => f.name).join(", "));
  return ids;
}

/** Levarex lädt für den Kunden hoch (noch nicht sichtbar). */
export async function dateiAnKunden(betriebId: number, f: File, notiz: string, wer: string): Promise<number> {
  if (!(f instanceof File) || !f.size) throw new Error("Bitte eine Datei auswählen.");
  const id = await speichern(betriebId, f, "an_kunden", notiz, wer);
  await protokolliere(wer, `Datei für den Kunden vorbereitet: ${sauber(f.name)}`, betriebId);
  return id;
}

/** Hinweis-Mail an den Kunden in den Postausgang; nach Versand ist die Datei im Portal. */
export async function dateiFreigeben(id: number, wer: string): Promise<number> {
  const db = await getDb();
  const [d] = await db.select().from(schema.dateien).where(eq(schema.dateien.id, id));
  if (!d || d.richtung !== "an_kunden") throw new Error("Datei nicht gefunden");
  if (d.status === "im_portal") throw new Error("Die Datei ist schon im Kundenportal.");
  if (d.status === "zur_freigabe" && d.eintragId) return d.eintragId;
  const [b] = await db.select().from(schema.betriebe).where(eq(schema.betriebe.id, d.betriebId));
  const { inPostausgang } = await import("./ablauf/postausgang");
  const { portalLink } = await import("./kundenportal");
  const eintragId = await inPostausgang({
    betriebId: b.id,
    kanal: "mail",
    zweck: "datei_portal",
    empfaenger: b.email ?? "(E-Mail-Adresse fehlt)",
    betreff: `Neue Unterlage im Kundenportal: ${d.name}`,
    text: `${(await import("./ablauf/gemeinsam")).mailAnrede(b)}\n\nin Ihrem Kundenportal liegt eine neue Unterlage für Sie: ${d.name}.${d.notiz ? `\n\n${d.notiz}` : ""}\n\nSie finden sie unter „Dateien“:\n${await portalLink(b.id)}#dateien\n\nMit freundlichen Grüßen\nMaximilian Steiner\nLevarex Consulting`,
    hinweise: b.email ? [] : ["E-Mail-Adresse fehlt. Beim Betrieb ergänzen und Empfänger anpassen."],
    meta: { dateiId: d.id },
  });
  await db.update(schema.dateien).set({ status: "zur_freigabe", eintragId }).where(eq(schema.dateien.id, id));
  await protokolliere(wer, `Datei zur Freigabe ins Kundenportal: ${d.name}`, b.id);
  return eintragId;
}

/** Nach Versand der Hinweis-Mail (aus nachVersand). */
export async function dateiImPortal(id: number): Promise<void> {
  const db = await getDb();
  await db.update(schema.dateien).set({ status: "im_portal" }).where(and(eq(schema.dateien.id, id), eq(schema.dateien.richtung, "an_kunden")));
}

export async function dateiGesehen(id: number): Promise<void> {
  const db = await getDb();
  await db.update(schema.dateien).set({ status: "gesehen" }).where(and(eq(schema.dateien.id, id), eq(schema.dateien.status, "neu")));
}

export async function dateiLoeschen(id: number, wer: string): Promise<void> {
  const db = await getDb();
  const [d] = await db.select().from(schema.dateien).where(eq(schema.dateien.id, id));
  if (!d) return;
  if (d.status === "zur_freigabe") throw new Error("Die Hinweis-Mail liegt in den Freigaben. Erst dort ablehnen, dann löschen.");
  if (d.pfad) fs.rmSync(path.join(ordner(d.betriebId), path.basename(d.pfad)), { force: true });
  await db.delete(schema.dateien).where(eq(schema.dateien.id, id));
  await protokolliere(wer, `Datei gelöscht: ${d.name}`, d.betriebId);
}

/** Datei lesen. Im Portal nur für den eigenen Betrieb; Dateien von uns erst, wenn sie im Portal stehen. */
export async function dateiLesen(id: number, o: { betriebId?: number; portal?: boolean } = {}): Promise<{ daten: Buffer; typ: string; name: string } | null> {
  const db = await getDb();
  const [d] = await db.select().from(schema.dateien).where(eq(schema.dateien.id, id));
  if (!d || !d.pfad || (o.betriebId && d.betriebId !== o.betriebId)) return null;
  if (o.portal && d.richtung === "an_kunden" && d.status !== "im_portal") return null;
  const datei = path.join(ordner(d.betriebId), path.basename(d.pfad));
  if (!fs.existsSync(datei)) return null;
  const typ = d.typ === "pdf" ? "application/pdf" : d.typ === "jpg" ? "image/jpeg" : `image/${d.typ}`;
  return { daten: fs.readFileSync(datei), typ, name: d.name };
}

/** Alle Dateien eines Betriebs von der Platte (Löschung nach Art. 17). */
export function dateienLoeschenAlle(betriebId: number): void {
  fs.rmSync(ordner(betriebId), { recursive: true, force: true });
}
