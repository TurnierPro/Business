import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { aktuellerBenutzer } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";

const TYPEN: Record<string, string> = { ".pdf": "application/pdf", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".heic": "image/heic" };

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await aktuellerBenutzer())) return new Response("Nicht angemeldet", { status: 401 });
  const db = await getDb();
  const [a] = await db.select().from(schema.ausgaben).where(eq(schema.ausgaben.id, Number((await params).id)));
  if (!a?.belegPfad || !fs.existsSync(a.belegPfad)) return new Response("Kein Beleg", { status: 404 });
  return new Response(new Uint8Array(fs.readFileSync(a.belegPfad)), { headers: { "Content-Type": TYPEN[path.extname(a.belegPfad).toLowerCase()] ?? "application/octet-stream", "Cache-Control": "no-store" } });
}
