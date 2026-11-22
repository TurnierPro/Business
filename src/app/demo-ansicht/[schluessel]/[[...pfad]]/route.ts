import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { pruefeLinkSchluessel } from "@/lib/geheim";
import { demoAntwort } from "@/lib/demo-auslieferung";

// Interne Ansicht einer Demo (vor der Freigabe ins Portal). Der Link enthält einen signierten Schlüssel und steht nur
// in der Kundenakte. Ohne Anmeldung, weil die abgeschottete Demo beim Nachladen (Schriften, Bilder) keine Cookies mitschickt.
export async function GET(_: Request, { params }: { params: Promise<{ schluessel: string; pfad?: string[] }> }) {
  const { schluessel, pfad = [] } = await params;
  const id = pruefeLinkSchluessel("demo-intern", schluessel);
  if (!id) return new Response("Nicht gefunden", { status: 404 });
  const [d] = await (await getDb()).select({ id: schema.demos.id }).from(schema.demos).where(eq(schema.demos.id, id));
  if (!d) return new Response("Nicht gefunden", { status: 404 });
  return demoAntwort(d.id, pfad);
}
