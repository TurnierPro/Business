import crypto from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "../db";
import { protokolliere } from "../protokoll";
import { datumDe } from "../docs/basis";
import { FOTO_ZWECKE, type FotoEinwilligungDaten } from "../docs/vorlagen";
import { anschrift, betrieb, neuesDokument } from "./gemeinsam";
import { pruefsumme, unterschriftsbildOk } from "./vertraege";

// Einwilligungen von Mitarbeitenden in Fotos und Videos (Brand: nur mit schriftlicher, widerruflicher Einwilligung).
// Die Person unterschreibt selbst im Kundenportal ihres Betriebs (z. B. auf dem Handy des Chefs oder beim Fototermin).
// Verantwortlich ist der Betrieb; Levarex nutzt die Fotos nur, solange eine Einwilligung gilt.
// Widerruf geht im Portal oder per Mail; danach entsteht eine Aufgabe, die Fotos binnen 14 Tagen zu entfernen.

export const ENTFERNEN_TAGE = 14;

export async function fotoEinwilligungen(betriebId: number) {
  const db = await getDb();
  const doks = await db.select().from(schema.dokumente).where(and(eq(schema.dokumente.betriebId, betriebId), eq(schema.dokumente.art, "foto_einwilligung"))).orderBy(desc(schema.dokumente.id));
  return doks.map((d) => ({ ...d, daten: d.daten as FotoEinwilligungDaten }));
}

export async function fotoEinwilligungErteilen(e: { betriebId: number; person: string; zwecke: string[]; video: boolean; bild: string; wer: string }): Promise<number> {
  const person = e.person.trim();
  if (person.length < 3) throw new Error("Bitte den vollständigen Namen der Person auf den Fotos eintragen.");
  const zwecke = [...new Set(e.zwecke)].filter((z) => z in FOTO_ZWECKE);
  if (!zwecke.length) throw new Error("Bitte mindestens einen Zweck ankreuzen.");
  if (!unterschriftsbildOk(e.bild)) throw new Error("Die Unterschrift der Person fehlt.");
  const db = await getDb();
  const b = await betrieb(e.betriebId);
  const am = new Date();
  const daten: FotoEinwilligungDaten = { an: anschrift(b), nummer: `FE-${String(b.id).padStart(5, "0")}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`, datum: datumDe(), person, zwecke, video: e.video };
  const summe = pruefsumme(daten as unknown as Record<string, unknown>);
  daten.unterschriften = [{ rolle: "kunde", name: person, funktion: null, bild: e.bild, am: am.toISOString() }];
  const id = await neuesDokument({ betriebId: b.id, art: "foto_einwilligung", titel: `Einwilligung Fotos: ${person}`, daten });
  await db.insert(schema.unterschriften).values({ betriebId: b.id, angebotId: 0, dokumentId: id, rolle: "kunde", name: person, funktion: "Mitarbeitende", bild: e.bild, pruefsumme: summe, erfasstVon: e.wer, am });
  await protokolliere(e.wer, `Foto-Einwilligung erteilt: ${person} (${zwecke.map((z) => FOTO_ZWECKE[z]).join(", ")}${e.video ? ", mit Video" : ""})`, b.id);
  return id;
}

/** Widerruf für die Zukunft: Dokument markieren, Aufgabe zum Entfernen der Fotos anlegen. */
export async function fotoEinwilligungWiderrufen(dokumentId: number, betriebId: number, wer: string): Promise<void> {
  const db = await getDb();
  const [d] = await db.select().from(schema.dokumente).where(and(eq(schema.dokumente.id, dokumentId), eq(schema.dokumente.betriebId, betriebId), eq(schema.dokumente.art, "foto_einwilligung")));
  if (!d) throw new Error("Einwilligung nicht gefunden");
  const x = d.daten as FotoEinwilligungDaten;
  if (x.widerrufenAm) return;
  await db.update(schema.dokumente).set({ daten: { ...x, widerrufenAm: new Date().toISOString(), widerrufenVon: wer } }).where(eq(schema.dokumente.id, d.id));
  const { systemAufgabe } = await import("./crm");
  await systemAufgabe({ betriebId, titel: `Fotos von ${x.person} entfernen (Einwilligung widerrufen)`, text: `Website, Karriereseite und Profile prüfen; Fotos und Videos binnen ${ENTFERNEN_TAGE} Tagen entfernen. Geplante Beiträge mit der Person stoppen.`, inTagen: 3, zustaendig: "Maximilian Steiner" });
  await protokolliere(wer, `Foto-Einwilligung widerrufen: ${x.person}`, betriebId);
}
