import { eq } from "drizzle-orm";
import { getDb, schema } from "./db";

// Welche Module hat ein Projekt gebucht? Steht im Angebot (Spalte module), aus dem das Projekt entstanden ist.
export async function gebuchteModule(p: { angebotId: number | null }): Promise<string[]> {
  if (!p.angebotId) return [];
  const db = await getDb();
  const [a] = await db.select({ module: schema.angebote.module }).from(schema.angebote).where(eq(schema.angebote.id, p.angebotId));
  return a?.module ?? [];
}

/** Monatsbericht: Professional hat ihn, jedes Modul bringt seinen eigenen mit. Kompakt allein nicht. */
export const mitMonatsbericht = (paket: string, module: string[]) => paket === "PROFESSIONAL" || module.length > 0;
