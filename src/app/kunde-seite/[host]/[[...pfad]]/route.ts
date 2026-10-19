import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { datenOrdner } from "@/lib/pfade";
import { anfrageAnnehmen } from "@/lib/anfragen";
import { projektFuerHost, umzugVon } from "@/lib/ablauf/umzug";

// Kunden-Websites unter ihrer eigenen Domain. Die Middleware leitet fremde Hosts hierher.
// www.domain → domain (301), alte Adressen der früheren Website → passende neue Seite (301).

const TYPEN: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif" };
const nichtDa = () => new Response("Diese Seite gibt es nicht.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });

async function seiteFuer(host: string) {
  const p = await projektFuerHost(host);
  if (!p?.seitenSlug) return null;
  const db = await getDb();
  const [seite] = await db.select().from(schema.seiten).where(eq(schema.seiten.slug, p.seitenSlug));
  return seite ? { p, seite } : null;
}

export async function GET(req: Request, { params }: { params: Promise<{ host: string; pfad?: string[] }> }) {
  const { host, pfad = [] } = await params;
  const h = decodeURIComponent(host).toLowerCase();
  const t = await seiteFuer(h);
  if (!t) return nichtDa();
  const url = new URL(req.url);
  if (h.startsWith("www.")) return Response.redirect(`https://${h.slice(4)}/${pfad.join("/")}${url.search}`, 301);
  const ordner = path.join(datenOrdner("sites"), t.seite.slug);
  const kopf = { "Cache-Control": "public, max-age=300", "X-Robots-Tag": "all" };
  if (pfad[0] === "bild" && pfad[1]) {
    const datei = path.join(ordner, "bild", path.basename(pfad[1]));
    if (!fs.existsSync(datei)) return nichtDa();
    return new Response(new Uint8Array(fs.readFileSync(datei)), { headers: { ...kopf, "Content-Type": TYPEN[path.extname(datei).toLowerCase()] ?? "application/octet-stream" } });
  }
  const name = (pfad[0] ?? "index").replace(/[^a-z0-9-]/g, "");
  const datei = path.join(ordner, `${name}.html`);
  if (pfad.length <= 1 && fs.existsSync(datei)) {
    const html = fs.readFileSync(datei, "utf8").replaceAll("{{BASIS}}", "").replaceAll("{{Q}}", "");
    return new Response(html, { headers: { ...kopf, "Content-Type": "text/html; charset=utf-8" } });
  }
  // Alte Adresse der früheren Website?
  const alt = `/${pfad.join("/")}`.replace(/\/+$/, "");
  const treffer = umzugVon(t.p)?.alteSeiten?.find((s) => s.pfad.toLowerCase() === alt.toLowerCase());
  if (treffer) return Response.redirect(`https://${h}/${treffer.ziel && fs.existsSync(path.join(ordner, `${treffer.ziel}.html`)) ? treffer.ziel : ""}`, 301);
  return nichtDa();
}

export async function POST(req: Request, { params }: { params: Promise<{ host: string; pfad?: string[] }> }) {
  const { host, pfad = [] } = await params;
  if (pfad[0] !== "kontakt") return new Response("Nicht erlaubt", { status: 405 });
  const t = await seiteFuer(decodeURIComponent(host));
  if (!t) return nichtDa();
  return anfrageAnnehmen(req, t.seite, "/danke");
}
