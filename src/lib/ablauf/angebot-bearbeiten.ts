import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "../db";
import { euro } from "../pakete";
import { protokolliere } from "../protokoll";
import { bearbeiten, eintrag } from "./postausgang";
import type { AngebotDaten } from "../docs/vorlagen";

// Angebot vor dem Versand anpassen: Positionen verschieben, ändern, ergänzen, Texte schreiben.
// Nur solange es auf Freigabe wartet. Danach ist das PDF eingefroren.

export const AngebotAenderung = z.object({
  positionen: z
    .array(
      z.object({
        text: z.string().trim().min(1, "Jede Position braucht eine Bezeichnung."),
        einmalig: z.number().int(),
        monatlich: z.number().int().min(0),
        hinweis: z.string().trim().optional(),
      }),
    )
    .min(1, "Mindestens eine Position."),
  einleitung: z.string().trim().min(1, "Der Einstieg darf nicht leer sein."),
  anmerkungen: z.string().optional(),
});
export type AngebotAenderung = z.infer<typeof AngebotAenderung>;

export function mitSummen(alt: AngebotDaten, a: AngebotAenderung): AngebotDaten {
  const positionen = a.positionen.map((p) => ({ ...p, hinweis: p.hinweis || undefined }));
  return {
    ...alt,
    positionen,
    einleitung: a.einleitung,
    anmerkungen: a.anmerkungen ?? "",
    einmalig: positionen.reduce((s, p) => s + p.einmalig, 0),
    monatlich: positionen.reduce((s, p) => s + p.monatlich, 0),
  };
}

export async function angebotDokument(eintragId: number) {
  const e = await eintrag(eintragId);
  if (e.zweck !== "angebot") throw new Error("Das ist kein Angebot.");
  const db = await getDb();
  const doks = await db.select().from(schema.dokumente).where(inArray(schema.dokumente.id, e.anhaenge));
  const d = doks.find((x) => x.art === "angebot");
  if (!d) throw new Error("Angebots-PDF fehlt.");
  return { e, d };
}

export async function angebotAendern(eintragId: number, roh: unknown, wer: string): Promise<void> {
  const aenderung = AngebotAenderung.parse(roh);
  const { e, d } = await angebotDokument(eintragId);
  if (e.status !== "zur_freigabe" || d.archivPfad) throw new Error("Das Angebot ist schon verschickt und kann nicht mehr geändert werden.");
  const neu = mitSummen(d.daten as AngebotDaten, aenderung);
  if (neu.einmalig < 0) throw new Error("Die Summe darf nicht negativ sein.");
  const db = await getDb();
  await db.update(schema.dokumente).set({ daten: neu }).where(eq(schema.dokumente.id, d.id));
  const angebotId = Number(e.meta.angebotId);
  if (angebotId) await db.update(schema.angebote).set({ positionen: neu.positionen ?? [], einmalig: neu.einmalig, monatlich: neu.monatlich }).where(eq(schema.angebote.id, angebotId));
  const erlaubteZahlen = [euro(neu.einmalig), euro(neu.monatlich), ...(neu.positionen ?? []).flatMap((p) => [euro(p.einmalig), euro(p.monatlich)])];
  await db.update(schema.postausgang).set({ meta: { ...e.meta, erlaubteZahlen } }).where(eq(schema.postausgang.id, eintragId));
  await protokolliere(wer, `Angebot angepasst: ${euro(neu.einmalig)} + ${euro(neu.monatlich)}/Monat`, e.betriebId);
  // Freigaben zurücksetzen und Qualitätskontrolle neu starten
  await bearbeiten(eintragId, e.betreff, e.text, wer);
}
