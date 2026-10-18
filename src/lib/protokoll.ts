import { getDb, schema } from "./db";

/** Schreibt eine Zeile ins Protokoll. Jede Freigabe, jeder Versand, jede Statusänderung landet hier. */
export async function protokolliere(wer: string, aktion: string, betriebId?: number | null, detail?: string): Promise<void> {
  const db = await getDb();
  await db.insert(schema.protokoll).values({ wer, aktion, betriebId: betriebId ?? null, detail });
}
