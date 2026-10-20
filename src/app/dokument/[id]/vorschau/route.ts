import { eq } from "drizzle-orm";
import { aktuellerBenutzer } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { dokumentHtml } from "@/lib/docs/render";
import { AngebotAenderung, mitSummen } from "@/lib/ablauf/angebot-bearbeiten";
import type { AngebotDaten } from "@/lib/docs/vorlagen";

// Live-Vorschau beim Bearbeiten eines Angebots: rendert mit den ungespeicherten Änderungen.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await aktuellerBenutzer())) return new Response("Nicht angemeldet", { status: 401 });
  const db = await getDb();
  const [d] = await db.select().from(schema.dokumente).where(eq(schema.dokumente.id, Number((await params).id)));
  if (!d || d.art !== "angebot") return new Response("Nicht gefunden", { status: 404 });
  const geprueft = AngebotAenderung.safeParse(await req.json());
  const daten = geprueft.success ? mitSummen(d.daten as AngebotDaten, geprueft.data) : d.daten;
  const html = dokumentHtml({ art: d.art, daten })
    .replace("</style>", "body{background:#d6d2c8}.seite{margin:16px auto;box-shadow:0 0 0 1px #c9c4b8}</style>")
    .replace("</body>", "<script src=\"/dokument-umbruch.js\"></script><script src=\"/vorschau-zoom.js\"></script></body>");
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
