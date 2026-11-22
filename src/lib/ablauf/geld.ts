import fs from "node:fs";
import path from "node:path";
import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "../db";
import { protokolliere } from "../protokoll";
import { datenOrdner } from "../pfade";
import { lexwareEcht, rechnungAnlegen, rechnungStatus } from "../adapters/lexware";
import { lastschriftBeenden, lastschriftEinrichten } from "../adapters/qonto";
import type { RechnungDaten } from "../docs/vorlagen";
import { betrieb, SYSTEM } from "./gemeinsam";

// Geld nach Festlegung: Rechnungen und E-Rechnung über Lexware Office, Monatsbeitrag per SEPA-Lastschrift über Qonto.
// Beides wird nur aus dem Postausgang heraus angestoßen, also erst nach Qualitätskontrolle und Freigabe.

type Dok = typeof schema.dokumente.$inferSelect;
type Eintrag = typeof schema.postausgang.$inferSelect;

/**
 * Beim Versand einer Rechnung: Ist Lexware angebunden, wird die Rechnung dort endgültig angelegt.
 * Lexware vergibt die Nummer, sein PDF wird eingefroren und geht an den Kunden. Gibt alte und neue Nummer zurück.
 */
export async function rechnungNachLexware(d: Dok): Promise<{ alt: string; neu: string } | null> {
  if (!lexwareEcht() || d.art !== "rechnung") return null;
  const daten = d.daten as RechnungDaten & { lexwareId?: string };
  if (daten.lexwareId) return null; // schon angelegt (z. B. Versand wiederholt)
  const db = await getDb();
  const [r] = await db.select().from(schema.rechnungen).where(eq(schema.rechnungen.nummer, daten.nummer));
  const titel = daten.art === "anzahlung" ? "Erste Rate (50 %) laut Vertrag" : daten.art === "schluss" ? "Schlussrechnung" : "Monatsbeitrag";
  const lx = await rechnungAnlegen({ an: daten.an, positionen: daten.positionen, datum: new Date(), leistung: daten.leistung, zahlungszielTage: daten.zahlungszielTage, titel, hinweis: `Levarex-Beleg ${daten.nummer}` });
  const pfad = path.join(datenOrdner("archiv", String(new Date().getFullYear())), `dokument-${d.id}-lexware.pdf`);
  fs.writeFileSync(pfad, lx.pdf);
  await db.update(schema.dokumente).set({ titel: `Rechnung ${lx.nummer}`, daten: { ...daten, nummer: lx.nummer, lexwareId: lx.id, levarexBeleg: daten.nummer }, archivPfad: pfad, archiviertAm: new Date() }).where(eq(schema.dokumente.id, d.id));
  if (r) await db.update(schema.rechnungen).set({ nummer: lx.nummer, lexwareId: lx.id, quelle: "lexware" }).where(eq(schema.rechnungen.id, r.id));
  await protokolliere(SYSTEM, `Rechnung in Lexware angelegt: ${lx.nummer} (vorher ${daten.nummer})`, d.betriebId);
  return { alt: daten.nummer, neu: lx.nummer };
}

/** Freigegebener Lastschrift-Eintrag: Einzug bei Qonto einrichten oder beenden. */
export async function lastschriftAusfuehren(e: Eintrag): Promise<string> {
  const db = await getDb();
  const projektId = Number(e.meta.projektId);
  const [p] = await db.select().from(schema.projekte).where(eq(schema.projekte.id, projektId));
  if (!p) throw new Error("Projekt nicht gefunden");
  const b = await betrieb(p.betriebId);
  if (e.zweck === "lastschrift_start") {
    if (p.qontoAboId) return `Einzug besteht schon (${p.qontoAboId})`;
    const r = await lastschriftEinrichten({ name: b.name, email: e.empfaenger, strasse: b.strasse, plz: b.plz, ort: b.ort, betragBrutto: Number(e.meta.monatlichBrutto), ersterEinzug: new Date(String(e.meta.ersterEinzug)), referenz: `Levarex Monatsbeitrag ${b.name}`, qontoKundeId: b.qontoKundeId });
    await db.update(schema.betriebe).set({ qontoKundeId: r.kundeId }).where(eq(schema.betriebe.id, b.id));
    await db.update(schema.projekte).set({ qontoAboId: r.aboId }).where(eq(schema.projekte.id, projektId));
    return r.simuliert ? "Simulator: Lastschrift eingerichtet" : `Lastschrift bei Qonto eingerichtet${r.mandatLink ? ", Mandats-Link an den Kunden verschickt" : ""}`;
  }
  if (e.zweck === "lastschrift_ende") {
    const endeAm = e.meta.endeAm ? new Date(String(e.meta.endeAm)) : null;
    if (endeAm && endeAm.getTime() - Date.now() > 31 * 864e5) throw new Error(`Zu früh: Der Vertrag endet erst am ${endeAm.toLocaleDateString("de-DE")}. Bis dahin wird weiter eingezogen.`);
    const ergebnis = await lastschriftBeenden(String(e.meta.aboId));
    await db.update(schema.projekte).set({ qontoAboId: null }).where(eq(schema.projekte.id, projektId));
    return ergebnis;
  }
  throw new Error(`Unbekannte Lastschrift: ${e.zweck}`);
}

/** Täglicher Abgleich: Zahlstatus offener Lexware-Rechnungen holen; erste Rate bezahlt → Projekt startet. */
export async function lexwareAbgleich(): Promise<string> {
  if (!lexwareEcht()) return "Lexware nicht angebunden";
  const db = await getDb();
  const offen = await db.select().from(schema.rechnungen).where(and(eq(schema.rechnungen.quelle, "lexware"), inArray(schema.rechnungen.status, ["offen"])));
  let bezahlt = 0;
  for (const r of offen) {
    if (!r.lexwareId) continue;
    const status = await rechnungStatus(r.lexwareId);
    if (status === "offen") continue;
    await db.update(schema.rechnungen).set({ status: status === "bezahlt" ? "bezahlt" : "storniert", bezahltAm: status === "bezahlt" ? new Date() : null }).where(eq(schema.rechnungen.id, r.id));
    if (status === "bezahlt") {
      bezahlt++;
      if (r.art === "anzahlung" && r.angebotId) {
        const { zahlungEingegangen } = await import("./verkauf");
        await zahlungEingegangen(r.angebotId, "Lexware-Abgleich").catch(() => undefined);
      }
    }
  }
  return `${offen.length} offene Lexware-Rechnungen geprüft, ${bezahlt} bezahlt`;
}
