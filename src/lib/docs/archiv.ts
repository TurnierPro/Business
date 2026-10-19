import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { getDb, schema } from "../db";
import { datenOrdner } from "../pfade";
import { dokumentPdf } from "./render";

type Dok = typeof schema.dokumente.$inferSelect;

/** Beim Versand: PDF einfrieren. Danach bekommt jeder (Kunde, Portal, Steuerberater) genau diese Datei. */
export async function archivieren(d: Dok): Promise<Buffer> {
  if (d.archivPfad && fs.existsSync(d.archivPfad)) return fs.readFileSync(d.archivPfad);
  const pdf = await dokumentPdf(d);
  const pfad = path.join(datenOrdner("archiv", String(new Date().getFullYear())), `dokument-${d.id}.pdf`);
  fs.writeFileSync(pfad, pdf);
  const db = await getDb();
  await db.update(schema.dokumente).set({ archivPfad: pfad, archiviertAm: new Date() }).where(eq(schema.dokumente.id, d.id));
  return pdf;
}

/** Archiviertes PDF, falls vorhanden, sonst frisch erzeugt (Entwurf). */
export async function pdfVon(d: Dok): Promise<Buffer> {
  if (d.archivPfad && fs.existsSync(d.archivPfad)) return fs.readFileSync(d.archivPfad);
  return dokumentPdf(d);
}
