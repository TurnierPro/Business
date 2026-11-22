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
  // Bausteine (Anlage 1) nur für Positionen, die es noch gibt: gestrichenes Modul verschwindet auch aus der Leistungsbeschreibung
  const noch = (name: string) => positionen.some((p) => p.text.toLowerCase().includes(name.toLowerCase()));
  const bausteine = alt.bausteine?.filter((b) => noch(b.name));
  return {
    ...alt,
    positionen,
    ...(alt.bausteine ? { bausteine, mitKi: (bausteine ?? []).some((b) => /Marketing|Kundenmanagement/.test(b.name)) } : {}),
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
  if (neu.einmalig === 0 && neu.monatlich === 0) throw new Error("Ein Angebot über 0 € ergibt keinen Sinn. Bitte Positionen prüfen.");
  const db = await getDb();
  await db.update(schema.dokumente).set({ daten: neu }).where(eq(schema.dokumente.id, d.id));
  const angebotId = Number(e.meta.angebotId);
  if (angebotId) {
    // Gebuchte Module und Zusätze folgen den Positionen (für Verträge, Checkliste, Portal)
    const [a] = await db.select().from(schema.angebote).where(eq(schema.angebote.id, angebotId));
    // Aktuelle Stammdaten (Namen können dort geändert sein), nicht die festen Vorgaben
    const { module: MODULE, zusaetze: ZUSAETZE } = await (await import("../katalog-db")).katalogLaden();
    // Ein Modul gilt als gebucht, wenn eine Position seinen Namen enthält (auch „Modul Personal & Bewerbung“)
    const drin = (name: string) => (neu.positionen ?? []).some((p) => p.text.toLowerCase().includes(name.toLowerCase()));
    const module = MODULE.filter((m) => drin(m.name)).map((m) => m.key);
    const zusaetze = (a?.zusaetze ?? []).filter((k) => { const z = ZUSAETZE.find((x) => x.key === k); return !z || drin(z.name); });
    // Anlage 1: wieder aufgenommene Module bekommen ihre Leistungsbeschreibung aus dem Katalog
    const bausteine = neu.bausteine ?? [];
    for (const m of MODULE.filter((x) => module.includes(x.key) && !bausteine.some((b) => b.name === x.name))) bausteine.push({ name: m.name, problem: m.problem, punkte: m.punkte?.length ? [...m.punkte] : [m.text] });
    if (neu.bausteine || bausteine.length) {
      neu.bausteine = bausteine;
      await db.update(schema.dokumente).set({ daten: neu }).where(eq(schema.dokumente.id, d.id));
    }
    await db.update(schema.angebote).set({ positionen: neu.positionen ?? [], einmalig: neu.einmalig, monatlich: neu.monatlich, module, zusaetze }).where(eq(schema.angebote.id, angebotId));
  }
  const erlaubteZahlen = [euro(neu.einmalig), euro(neu.monatlich), ...(neu.positionen ?? []).flatMap((p) => [euro(p.einmalig), euro(p.monatlich)])];
  await db.update(schema.postausgang).set({ meta: { ...e.meta, erlaubteZahlen } }).where(eq(schema.postausgang.id, eintragId));
  await protokolliere(wer, `Angebot angepasst: ${euro(neu.einmalig)} + ${euro(neu.monatlich)}/Monat`, e.betriebId);
  // Neuer Einstieg auch in der Begleit-Mail; Freigaben zurücksetzen und Qualitätskontrolle neu starten
  const altEinleitung = (d.daten as AngebotDaten).einleitung;
  const text = altEinleitung && e.text.includes(altEinleitung) ? e.text.replace(altEinleitung, () => neu.einleitung) : e.text;
  // Betreff an die verbliebenen Bausteine anpassen („… und 2 weitere Bausteine“)
  const anzahl = neu.bausteine?.length ?? 0;
  const betreff = /^Ihr Angebot von Levarex: /.test(e.betreff) && neu.paketName ? `Ihr Angebot von Levarex: ${neu.paketName}${anzahl ? ` und ${anzahl === 1 ? "ein weiterer Baustein" : `${anzahl} weitere Bausteine`}` : ""}` : e.betreff;
  await bearbeiten(eintragId, betreff, text, wer);
  if (altEinleitung && !e.text.includes(altEinleitung) && altEinleitung !== neu.einleitung) {
    const db2 = await getDb();
    const x = await eintrag(eintragId);
    // In meta.vorab, damit die Qualitätskontrolle den Hinweis bei jedem Lauf wieder anzeigt
    const vorab = [...((x.meta.vorab as string[] | undefined) ?? []), "Der Einstieg im PDF wurde geändert, der Mailtext aber vorher schon von Hand: bitte Mailtext prüfen."];
    await db2.update(schema.postausgang).set({ meta: { ...x.meta, vorab } }).where(eq(schema.postausgang.id, eintragId));
  }
}
