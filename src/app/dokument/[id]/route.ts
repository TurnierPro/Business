import { eq } from "drizzle-orm";
import { aktuellerBenutzer } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { dokumentPdf } from "@/lib/docs/render";
import { slugAus } from "@/lib/ablauf/gemeinsam";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await aktuellerBenutzer())) return new Response("Nicht angemeldet", { status: 401 });
  const db = await getDb();
  const [d] = await db.select().from(schema.dokumente).where(eq(schema.dokumente.id, Number((await params).id)));
  if (!d) return new Response("Nicht gefunden", { status: 404 });
  const pdf = await dokumentPdf(d);
  return new Response(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${slugAus(d.titel)}.pdf"`, "Cache-Control": "no-store" },
  });
}
