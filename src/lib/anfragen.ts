import fs from "node:fs";
import path from "node:path";
import { getDb, schema } from "./db";
import { datenOrdner } from "./pfade";

// Anfragen über das Formular einer Kunden-Website. Gespeichert und im Kundenportal sichtbar; Demos speichern nichts.

type Seite = typeof schema.seiten.$inferSelect;

export async function anfrageAnnehmen(req: Request, seite: Seite, weiter: string): Promise<Response> {
  const danke = new Response(null, { status: 303, headers: { Location: weiter } });
  if (seite.art !== "kunde" || !seite.betriebId) return danke;
  const f = await req.formData().catch(() => null);
  if (!f) return new Response("Ungültige Anfrage", { status: 400 });
  if (String(f.get("webseite") ?? "")) return danke; // Spam-Falle
  const feld = (k: string, max: number) => String(f.get(k) ?? "").trim().slice(0, max);
  const name = feld("name", 120);
  const kontakt = [feld("telefon", 40), feld("email", 160)].filter(Boolean).join(" · ");
  const nachricht = feld("nachricht", 5000);
  if (!name || !kontakt || !nachricht) return new Response("Bitte Name, Telefon und Nachricht angeben.", { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  const dateien: string[] = [];
  const ordner = datenOrdner("anfragen", seite.slug);
  for (const d of f.getAll("fotos").filter((x): x is File => x instanceof File && x.size > 0).slice(0, 5)) {
    if (!d.type.startsWith("image/") || d.size > 10 * 1024 * 1024) continue;
    const ziel = `${Date.now()}-${dateien.length + 1}${path.extname(d.name).toLowerCase().replace(/[^a-z.]/g, "").slice(0, 6)}`;
    fs.writeFileSync(path.join(ordner, ziel), Buffer.from(await d.arrayBuffer()));
    dateien.push(ziel);
  }
  const db = await getDb();
  await db.insert(schema.anfragen).values({ betriebId: seite.betriebId, seitenSlug: seite.slug, name, kontakt, nachricht, dateien });
  return danke;
}
