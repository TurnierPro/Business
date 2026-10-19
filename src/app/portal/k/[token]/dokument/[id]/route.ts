import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { betriebPerPortal, darfDokumentSehen } from "@/lib/kundenportal";
import { pdfVon } from "@/lib/docs/archiv";
import { slugAus } from "@/lib/ablauf/gemeinsam";

// Kunden laden nur Dokumente, die an sie verschickt wurden.
export async function GET(_: Request, { params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  const b = await betriebPerPortal(token);
  if (!b || !(await darfDokumentSehen(b.id, Number(id)))) return new Response("Nicht gefunden", { status: 404 });
  const db = await getDb();
  const [d] = await db.select().from(schema.dokumente).where(eq(schema.dokumente.id, Number(id)));
  const pdf = await pdfVon(d);
  return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${slugAus(d.titel)}.pdf"`, "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
}
