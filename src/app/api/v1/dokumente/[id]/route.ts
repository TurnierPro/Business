import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { json, pruefeZugriff } from "@/lib/api";
import { pdfVon } from "@/lib/docs/archiv";

// PDF einer Unterlage (Recht „dokumente“). Verschickte Unterlagen kommen eingefroren, wie der Kunde sie bekommen hat.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const z = await pruefeZugriff(req, "dokumente");
  if (z instanceof Response) return z;
  const db = await getDb();
  const [d] = await db.select().from(schema.dokumente).where(eq(schema.dokumente.id, Number((await params).id)));
  if (!d) return json({ fehler: "Nicht gefunden" }, 404);
  return new Response(new Uint8Array(await pdfVon(d)), { headers: { "Content-Type": "application/pdf", "Cache-Control": "no-store" } });
}
