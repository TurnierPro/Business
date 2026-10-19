import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { datenOrdner } from "@/lib/pfade";

// Liefert Demo- und Kundenseiten aus. Demos nur mit Zugangscode, ohne Cookies, nicht für Suchmaschinen.

const TYPEN: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif" };

function codeSeite(slug: string, falsch: boolean): Response {
  const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Vorschau</title>
<style>body{font-family:system-ui,sans-serif;background:#111413;color:#ece8e0;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px}form{max-width:360px;width:100%}input,button{font:inherit;font-size:18px;width:100%;padding:12px;margin-top:8px;border-radius:6px;border:1px solid #646b68;background:#1a1e1d;color:#ece8e0;box-sizing:border-box}button{background:#c9a35c;color:#111413;border:0;font-weight:600;cursor:pointer}p{color:#a29d93}</style></head>
<body><form method="get" action="/vorschau/${slug}"><h1>Ihre Vorschau</h1><p>Bitte geben Sie den Zugangscode aus unserem Brief ein.</p>${falsch ? '<p role="alert" style="color:#e08a7c">Der Code stimmt nicht.</p>' : ""}<label>Zugangscode<input name="code" autocomplete="off" autocapitalize="characters" required></label><button>Vorschau öffnen</button></form></body></html>`;
  return new Response(html, { status: falsch ? 403 : 200, headers: { "Content-Type": "text/html; charset=utf-8", "X-Robots-Tag": "noindex, nofollow" } });
}

export async function GET(req: Request, { params }: { params: Promise<{ slug: string; pfad?: string[] }> }) {
  const { slug, pfad = [] } = await params;
  const db = await getDb();
  const [seite] = await db.select().from(schema.seiten).where(eq(schema.seiten.slug, slug));
  if (!seite) return new Response("Diese Vorschau gibt es nicht (mehr).", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  const code = new URL(req.url).searchParams.get("code");
  if (seite.zugangscode && code?.toUpperCase() !== seite.zugangscode) return codeSeite(slug, !!code);

  const ordner = path.join(datenOrdner("sites"), slug);
  const kopf: Record<string, string> = { "Cache-Control": "no-store", "X-Robots-Tag": seite.art === "demo" ? "noindex, nofollow" : "all" };
  if (pfad[0] === "bild" && pfad[1]) {
    const datei = path.join(ordner, "bild", path.basename(pfad[1]));
    if (!fs.existsSync(datei)) return new Response("Nicht gefunden", { status: 404 });
    return new Response(new Uint8Array(fs.readFileSync(datei)), { headers: { ...kopf, "Content-Type": TYPEN[path.extname(datei).toLowerCase()] ?? "application/octet-stream" } });
  }
  const name = (pfad[0] ?? "index").replace(/[^a-z0-9-]/g, "");
  const datei = path.join(ordner, `${name}.html`);
  if (!fs.existsSync(datei)) return new Response("Seite nicht gefunden", { status: 404 });
  const q = seite.zugangscode ? `?code=${seite.zugangscode}` : "";
  const html = fs.readFileSync(datei, "utf8").replaceAll("{{BASIS}}", `/vorschau/${slug}`).replaceAll("{{Q}}", q);
  return new Response(html, { headers: { ...kopf, "Content-Type": "text/html; charset=utf-8" } });
}

/** Anfrageformular der Kunden-Website: speichern, im Kundenportal zeigen. Demos speichern nichts. */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string; pfad?: string[] }> }) {
  const { slug, pfad = [] } = await params;
  if (pfad[0] !== "kontakt") return new Response("Nicht erlaubt", { status: 405 });
  const db = await getDb();
  const [seite] = await db.select().from(schema.seiten).where(eq(schema.seiten.slug, slug));
  if (!seite) return new Response("Nicht gefunden", { status: 404 });
  const q = seite.zugangscode ? `?code=${seite.zugangscode}` : "";
  const weiter = new Response(null, { status: 303, headers: { Location: `/vorschau/${slug}/danke${q}` } });
  if (seite.art !== "kunde" || !seite.betriebId) return weiter;
  const f = await req.formData().catch(() => null);
  if (!f) return new Response("Ungültige Anfrage", { status: 400 });
  if (String(f.get("webseite") ?? "")) return weiter; // Spam-Falle
  const feld = (k: string, max: number) => String(f.get(k) ?? "").trim().slice(0, max);
  const name = feld("name", 120);
  const kontakt = [feld("telefon", 40), feld("email", 160)].filter(Boolean).join(" · ");
  const nachricht = feld("nachricht", 5000);
  if (!name || !kontakt || !nachricht) return new Response("Bitte Name, Telefon und Nachricht angeben.", { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  const dateien: string[] = [];
  const ordner = datenOrdner("anfragen", slug);
  for (const d of f.getAll("fotos").filter((x): x is File => x instanceof File && x.size > 0).slice(0, 5)) {
    if (!d.type.startsWith("image/") || d.size > 10 * 1024 * 1024) continue;
    const ziel = `${Date.now()}-${dateien.length + 1}${path.extname(d.name).toLowerCase().replace(/[^a-z.]/g, "").slice(0, 6)}`;
    fs.writeFileSync(path.join(ordner, ziel), Buffer.from(await d.arrayBuffer()));
    dateien.push(ziel);
  }
  await db.insert(schema.anfragen).values({ betriebId: seite.betriebId, seitenSlug: slug, name, kontakt, nachricht, dateien });
  return weiter;
}
