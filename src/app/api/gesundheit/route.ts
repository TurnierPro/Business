import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";

// Für Uptime Kuma: antwortet 200, wenn App und Datenbank laufen.
export async function GET() {
  try {
    const db = await getDb();
    await db.execute(sql`select 1`);
    return Response.json({ ok: true, zeit: new Date().toISOString() });
  } catch (e) {
    return Response.json({ ok: false, fehler: e instanceof Error ? e.message : String(e) }, { status: 503 });
  }
}
