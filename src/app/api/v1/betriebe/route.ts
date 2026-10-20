import { desc } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { json, pruefeZugriff } from "@/lib/api";
import { legeBetriebAn } from "@/lib/ablauf/akquise";

// GET: Betriebe lesen (Recht „lesen“). POST: Lead anlegen (Recht „leads“), z. B. aus einem Website-Formular oder n8n.
export async function GET(req: Request) {
  const z = await pruefeZugriff(req, "lesen");
  if (z instanceof Response) return z;
  const db = await getDb();
  const liste = await db.select().from(schema.betriebe).orderBy(desc(schema.betriebe.erstelltAm)).limit(500);
  return json(liste.map(({ portalToken: _t, stripeKundeId: _k, stripeZahlart: _z, ...b }) => b));
}

export async function POST(req: Request) {
  const z = await pruefeZugriff(req, "leads");
  if (z instanceof Response) return z;
  const d = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!d || typeof d.name !== "string" || !d.name.trim()) return json({ fehler: "Feld „name“ fehlt" }, 400);
  const s = (k: string) => (typeof d[k] === "string" ? (d[k] as string).trim() : undefined);
  const r = await legeBetriebAn(
    { name: d.name.trim(), gewerk: s("gewerk") || "SHK", anrede: s("anrede"), inhaber: s("inhaber"), strasse: s("strasse"), plz: s("plz"), ort: s("ort"), telefon: s("telefon"), email: s("email"), website: s("website"), datenquelle: s("datenquelle") || `Schnittstelle (${z.name})`, score: 50, scoreGrund: "Über die Schnittstelle angelegt" },
    "API",
    z.name,
  );
  return r.id ? json({ id: r.id }, 201) : json({ fehler: `Nicht angelegt: Betrieb ${r.grund}` }, 409);
}
