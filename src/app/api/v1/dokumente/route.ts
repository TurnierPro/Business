import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { json, pruefeZugriff } from "@/lib/api";

// Unterlagen eines Betriebs auflisten (Recht „dokumente“): nur Angaben, das PDF über /api/v1/dokumente/{id}.
export async function GET(req: Request) {
  const z = await pruefeZugriff(req, "dokumente");
  if (z instanceof Response) return z;
  const betriebId = Number(new URL(req.url).searchParams.get("betriebId"));
  if (!betriebId) return json({ fehler: "Parameter „betriebId“ fehlt" }, 400);
  const db = await getDb();
  const liste = await db.select({ id: schema.dokumente.id, art: schema.dokumente.art, titel: schema.dokumente.titel, erstelltAm: schema.dokumente.erstelltAm, archiviertAm: schema.dokumente.archiviertAm }).from(schema.dokumente).where(eq(schema.dokumente.betriebId, betriebId)).orderBy(desc(schema.dokumente.erstelltAm));
  return json(liste.map((d) => ({ ...d, versendet: !!d.archiviertAm })));
}
