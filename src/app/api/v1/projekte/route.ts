import { desc } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { json, pruefeZugriff } from "@/lib/api";

export async function GET(req: Request) {
  const z = await pruefeZugriff(req, "lesen");
  if (z instanceof Response) return z;
  const db = await getDb();
  const liste = await db.select().from(schema.projekte).orderBy(desc(schema.projekte.erstelltAm)).limit(500);
  return json(liste.map((p) => ({ id: p.id, betriebId: p.betriebId, paket: p.paket, status: p.status, domain: p.domain, liveAm: p.liveAm, abnahmeStatus: p.abnahmeStatus })));
}
