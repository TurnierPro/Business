import crypto from "node:crypto";
import { eq, isNull, and } from "drizzle-orm";
import { getDb, schema } from "./db";
import { protokolliere } from "./protokoll";

// Schnittstelle für andere Systeme (n8n, Website-Formulare, später Kunden-Systeme).
// Schlüssel werden einmal angezeigt; gespeichert ist nur der SHA-256-Hash.

export const RECHTE: Record<string, string> = { lesen: "Daten lesen", leads: "Leads anlegen", tickets: "Tickets anlegen" };

const hash = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

export async function schluesselErzeugen(name: string, rechte: string[], wer: string): Promise<string> {
  if (!name.trim()) throw new Error("Name fehlt");
  const gueltig = rechte.filter((r) => RECHTE[r]);
  if (!gueltig.length) throw new Error("Mindestens ein Recht wählen");
  const schluessel = `nxv_${crypto.randomBytes(24).toString("base64url")}`;
  const db = await getDb();
  await db.insert(schema.apiSchluessel).values({ name: name.trim(), praefix: schluessel.slice(0, 8), hash: hash(schluessel), rechte: gueltig, erstelltVon: wer });
  await protokolliere(wer, `API-Schlüssel erzeugt: ${name}`);
  return schluessel;
}

export async function schluesselWiderrufen(id: number, wer: string): Promise<void> {
  const db = await getDb();
  await db.update(schema.apiSchluessel).set({ widerrufenAm: new Date() }).where(eq(schema.apiSchluessel.id, id));
  await protokolliere(wer, `API-Schlüssel ${id} widerrufen`);
}

/** Prüft „Authorization: Bearer nxv_…“ und das nötige Recht. Gibt den Namen des Schlüssels zurück oder eine Fehler-Antwort. */
export async function pruefeZugriff(req: Request, recht: string): Promise<{ name: string } | Response> {
  const roh = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!roh.startsWith("nxv_")) return json({ fehler: "API-Schlüssel fehlt (Authorization: Bearer nxv_…)" }, 401);
  const db = await getDb();
  const [s] = await db.select().from(schema.apiSchluessel).where(and(eq(schema.apiSchluessel.hash, hash(roh)), isNull(schema.apiSchluessel.widerrufenAm)));
  if (!s) return json({ fehler: "Ungültiger Schlüssel" }, 401);
  if (!s.rechte.includes(recht)) return json({ fehler: `Recht „${recht}“ fehlt` }, 403);
  await db.update(schema.apiSchluessel).set({ zuletztAm: new Date() }).where(eq(schema.apiSchluessel.id, s.id));
  return { name: `API: ${s.name}` };
}

export function json(daten: unknown, status = 200): Response {
  return new Response(JSON.stringify(daten), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
}
