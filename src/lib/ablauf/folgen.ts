import fs from "node:fs";
import { eq } from "drizzle-orm";
import { getDb, schema } from "../db";
import { protokolliere } from "../protokoll";
import { setzeStatus, SYSTEM } from "./gemeinsam";

type Eintrag = typeof schema.postausgang.$inferSelect;

// Was nach einem erfolgreichen Versand automatisch passiert.
export async function nachVersand(e: Eintrag): Promise<void> {
  const db = await getDb();
  if (e.zweck === "akquise_brief" && e.betriebId) {
    await setzeStatus(e.betriebId, "angeschrieben");
    await db.update(schema.betriebe).set({ besuchAb: new Date(Date.now() + 8 * 864e5) }).where(eq(schema.betriebe.id, e.betriebId));
  }
  if (e.zweck === "angebot") {
    const angebotId = Number(e.meta.angebotId);
    if (angebotId) await db.update(schema.angebote).set({ status: "versendet" }).where(eq(schema.angebote.id, angebotId));
    // Die Aufnahme wird gelöscht, sobald das Protokoll freigegeben und verschickt ist.
    const terminId = Number(e.meta.terminId);
    if (terminId) {
      const [t] = await db.select().from(schema.termine).where(eq(schema.termine.id, terminId));
      if (t?.audioPfad) {
        fs.rmSync(t.audioPfad, { force: true });
        await db.update(schema.termine).set({ audioPfad: null, audioGeloeschtAm: new Date() }).where(eq(schema.termine.id, terminId));
        await protokolliere(SYSTEM, "Gesprächsaufnahme gelöscht", e.betriebId);
      }
    }
  }
  if (e.zweck === "abnahme_aufforderung" && e.projektId) {
    const { abnahmeFristStarten } = await import("./vertrag");
    await abnahmeFristStarten(e.projektId);
  }
  // Mahnstufe erst hochzählen, wenn die Mahnung wirklich raus ist
  if (["zahlungserinnerung", "mahnung1", "mahnung2"].includes(e.zweck) && e.meta.rechnungId) {
    const stufe = { zahlungserinnerung: 1, mahnung1: 2, mahnung2: 3 }[e.zweck as "zahlungserinnerung"];
    await db.update(schema.rechnungen).set({ mahnstufe: stufe, gemahntAm: new Date() }).where(eq(schema.rechnungen.id, Number(e.meta.rechnungId)));
  }
  if (e.zweck === "livegang") {
    const { livegangDurchfuehren } = await import("./lieferung");
    await livegangDurchfuehren(Number(e.meta.projektId));
  }
}
