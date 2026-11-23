import fs from "node:fs";
import { eq, and } from "drizzle-orm";
import { getDb, schema } from "../db";
import { protokolliere } from "../protokoll";
import { setzeStatus, SYSTEM } from "./gemeinsam";
import * as crm from "./crm";
import { hakeAb } from "./checkliste";

type Eintrag = typeof schema.postausgang.$inferSelect;

// Was nach einem erfolgreichen Versand automatisch passiert.
export async function nachVersand(e: Eintrag): Promise<void> {
  const db = await getDb();
  if (e.zweck === "akquise_brief" && e.betriebId) {
    await setzeStatus(e.betriebId, "angeschrieben");
    await db.update(schema.betriebe).set({ besuchAb: new Date(Date.now() + 8 * 864e5) }).where(eq(schema.betriebe.id, e.betriebId));
    await crm.systemAufgabe({ betriebId: e.betriebId, titel: "Besuch vor Ort", text: "Brief ist raus. Demo dabeihaben, Einwilligung zur Aufnahme einholen.", inTagen: 8, zustaendig: crm.VERTRIEB });
  }
  if (e.zweck === "angebot" && e.betriebId) {
    // Nachfassen nach 7 und 14 Tagen (Dok. 39); beide Aufgaben erledigen sich mit der Unterschrift
    await crm.systemAufgabe({ betriebId: e.betriebId, titel: "Angebot nachfassen", text: "Anrufen: Fragen zum Angebot? Unterschrieben wird beim Termin auf dem Tablet.", inTagen: 7, zustaendig: crm.VERTRIEB });
    await crm.systemAufgabe({ betriebId: e.betriebId, titel: "Angebot nachfassen (zweiter Anruf)", text: "Letztes Nachfassen, kein Druck: „Ich überleg's mir“ ist eine gute Antwort.", inTagen: 14, zustaendig: crm.VERTRIEB });
  }
  if (e.zweck === "beitraege_vorlage" && Array.isArray(e.meta.beitragIds)) await (await import("../beitraege")).beitraegeBeimKunden((e.meta.beitragIds as unknown[]).map(Number).filter(Boolean));
  if (e.zweck === "datei_portal" && Number(e.meta.dateiId)) await (await import("../dateien")).dateiImPortal(Number(e.meta.dateiId));
  if (e.zweck === "demo_portal" && Number(e.meta.demoId)) await (await import("../demos")).demoImPortal(Number(e.meta.demoId));
  if (e.zweck === "kickoff" && e.projektId) await hakeAb(e.projektId, "kickoff");
  if (e.zweck === "kickoff" && e.betriebId) {
    await crm.systemAufgabe({ betriebId: e.betriebId, projektId: e.projektId ?? undefined, titel: "Inhalte nachfassen", text: "Sind Texte und Fotos unterwegs? Hilfe beim Fotografieren anbieten.", inTagen: 7, zustaendig: crm.TECHNIK });
  }
  if (e.zweck === "angebot") {
    const angebotId = Number(e.meta.angebotId);
    // Nur ein Entwurf wird „versendet“: wurde inzwischen auf dem Tablet unterschrieben, bleibt es „unterschrieben“
    if (angebotId) await db.update(schema.angebote).set({ status: "versendet" }).where(and(eq(schema.angebote.id, angebotId), eq(schema.angebote.status, "entwurf")));
    // Die Aufnahme wird gelöscht, sobald das Protokoll freigegeben und verschickt ist.
    const terminId = Number(e.meta.terminId);
    if (terminId) {
      const [t] = await db.select().from(schema.termine).where(eq(schema.termine.id, terminId));
      // Mitschrift (Text) löschen, sobald das Protokoll raus ist; die Zusammenfassung bleibt
      if (t?.transkript) await db.update(schema.termine).set({ transkript: null }).where(eq(schema.termine.id, terminId));
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
