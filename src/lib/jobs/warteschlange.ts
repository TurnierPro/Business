import { and, asc, eq, lte, sql } from "drizzle-orm";
import { getDb, schema } from "../db";

// Alles, was länger dauert (KI, PDFs, Versand, Backups), läuft als Job im Hintergrund.
// Fehlgeschlagene Jobs werden bis zu 3-mal wiederholt und erscheinen dann unter System.

export async function einreihen(art: string, daten: Record<string, unknown> = {}, faelligAm = new Date()): Promise<number> {
  const db = await getDb();
  const [j] = await db.insert(schema.jobs).values({ art, daten, faelligAm }).returning({ id: schema.jobs.id });
  return j.id;
}

export type Handler = (daten: Record<string, unknown>) => Promise<string | void>;

export async function naechsterJob(handler: Record<string, Handler>): Promise<boolean> {
  const db = await getDb();
  const [job] = await db
    .select()
    .from(schema.jobs)
    .where(and(eq(schema.jobs.status, "wartet"), lte(schema.jobs.faelligAm, new Date())))
    .orderBy(asc(schema.jobs.faelligAm), asc(schema.jobs.id))
    .limit(1);
  if (!job) return false;
  const gesperrt = await db
    .update(schema.jobs)
    .set({ status: "laeuft", versuche: sql`${schema.jobs.versuche} + 1` })
    .where(and(eq(schema.jobs.id, job.id), eq(schema.jobs.status, "wartet")))
    .returning({ id: schema.jobs.id });
  if (!gesperrt.length) return true;

  const h = handler[job.art];
  try {
    if (!h) throw new Error(`Kein Handler für Job „${job.art}“`);
    const ergebnis = await h(job.daten);
    await db.update(schema.jobs).set({ status: "fertig", fertigAm: new Date(), ergebnis: ergebnis ?? null, fehler: null }).where(eq(schema.jobs.id, job.id));
  } catch (e) {
    const meldung = e instanceof Error ? e.message : String(e);
    const nochmal = job.versuche + 1 < 3;
    await db
      .update(schema.jobs)
      .set({ status: nochmal ? "wartet" : "fehler", fehler: meldung, faelligAm: new Date(Date.now() + 60_000 * (job.versuche + 1)) })
      .where(eq(schema.jobs.id, job.id));
    console.error(`[job ${job.id} ${job.art}]`, meldung);
  }
  return true;
}

export async function wiederholen(jobId: number): Promise<void> {
  const db = await getDb();
  await db.update(schema.jobs).set({ status: "wartet", versuche: 0, faelligAm: new Date(), fehler: null }).where(eq(schema.jobs.id, jobId));
}

/** Für Tests und das Kommandozeilen-Skript: arbeitet alle fälligen Jobs ab. */
export async function alleAbarbeiten(handler: Record<string, Handler>, max = 200): Promise<void> {
  for (let i = 0; i < max; i++) if (!(await naechsterJob(handler))) return;
}
