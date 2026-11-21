import { and, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { json, pruefeZugriff } from "@/lib/api";

// Ein Betrieb mit Ansprechpartnern, Projekten und offenen Aufgaben (Recht „lesen“).
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const z = await pruefeZugriff(req, "lesen");
  if (z instanceof Response) return z;
  const id = Number((await params).id);
  const db = await getDb();
  const [b] = await db.select().from(schema.betriebe).where(eq(schema.betriebe.id, id));
  if (!b) return json({ fehler: "Nicht gefunden" }, 404);
  const { portalToken: _t, qontoKundeId: _q, ...betrieb } = b;
  const [kontakte, projekte, aufgaben] = await Promise.all([
    db.select().from(schema.kontakte).where(eq(schema.kontakte.betriebId, id)),
    db.select({ id: schema.projekte.id, paket: schema.projekte.paket, status: schema.projekte.status, domain: schema.projekte.domain, liveAm: schema.projekte.liveAm, abnahmeStatus: schema.projekte.abnahmeStatus }).from(schema.projekte).where(eq(schema.projekte.betriebId, id)),
    db.select({ id: schema.aktivitaeten.id, art: schema.aktivitaeten.art, titel: schema.aktivitaeten.titel, faelligAm: schema.aktivitaeten.faelligAm, zustaendig: schema.aktivitaeten.zustaendig }).from(schema.aktivitaeten).where(and(eq(schema.aktivitaeten.betriebId, id), isNull(schema.aktivitaeten.erledigtAm))),
  ]);
  return json({ ...betrieb, kontakte, projekte, offeneAufgaben: aufgaben });
}
