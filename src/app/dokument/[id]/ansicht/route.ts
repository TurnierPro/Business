import { eq } from "drizzle-orm";
import { aktuellerBenutzer } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { dokumentHtml } from "@/lib/docs/render";

// HTML-Ansicht eines Dokuments für die Vorschau in der Freigabe (schneller als PDF).
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await aktuellerBenutzer())) return new Response("Nicht angemeldet", { status: 401 });
  const db = await getDb();
  const [d] = await db.select().from(schema.dokumente).where(eq(schema.dokumente.id, Number((await params).id)));
  if (!d) return new Response("Nicht gefunden", { status: 404 });
  // In der Freigabe ist die Vorschau schmaler als A4: Seite passend verkleinern.
  const html = dokumentHtml(d)
    .replace("</style>", "body{background:#d6d2c8}.seite{margin:16px auto;box-shadow:0 0 0 1px #c9c4b8}</style>")
    .replace("</body>", "<script src=\"/vorschau-zoom.js\"></script></body>");
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
