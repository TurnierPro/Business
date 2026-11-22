import crypto from "node:crypto";
import { eq, isNull, and } from "drizzle-orm";
import { getDb, schema } from "./db";
import { protokolliere } from "./protokoll";

// Schnittstelle für andere Systeme (n8n, Website-Formulare, später Kunden-Systeme).
// Schlüssel werden einmal angezeigt; gespeichert ist nur der SHA-256-Hash.

export const RECHTE: Record<string, string> = {
  lesen: "Betriebe und Projekte lesen",
  leads: "Leads anlegen",
  tickets: "Tickets anlegen",
  nachrichten: "Nachrichten einliefern (Mail, WhatsApp, Telefon)",
  gespraeche: "Gespräche einliefern (Meeting-Zusammenfassungen aus Claude)",
  kontakte: "Ansprechpartner anlegen",
  aktivitaeten: "Notizen und Aufgaben anlegen",
  dokumente: "Unterlagen lesen (PDF)",
  entwuerfe: "Mail-Entwürfe in den Postausgang legen (Versand nur nach Freigabe)",
  beitraege: "Entwürfe für Beiträge und Bewertungsantworten anlegen (Freigabe durch Levarex und den Betrieb)",
};
// Bewusst kein Recht zum Versenden: alles, was rausgeht, gibt ein Mensch im Postausgang frei.

/** Höchstens so viele Anfragen je Schlüssel und Minute (im Speicher, reicht für einen Server). */
export const API_GRENZE_JE_MINUTE = 120;
const zaehler = new Map<number, { minute: number; n: number }>();
function grenzeErreicht(id: number): boolean {
  const minute = Math.floor(Date.now() / 60_000);
  const z = zaehler.get(id);
  if (!z || z.minute !== minute) {
    zaehler.set(id, { minute, n: 1 });
    return false;
  }
  z.n++;
  return z.n > API_GRENZE_JE_MINUTE;
}

const hash = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

export async function schluesselErzeugen(name: string, rechte: string[], wer: string): Promise<string> {
  if (!name.trim()) throw new Error("Name fehlt");
  const gueltig = rechte.filter((r) => RECHTE[r]);
  if (!gueltig.length) throw new Error("Mindestens ein Recht wählen");
  const schluessel = `lvx_${crypto.randomBytes(24).toString("base64url")}`;
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

/** Prüft „Authorization: Bearer lvx_…“ und das nötige Recht. Gibt den Namen des Schlüssels zurück oder eine Fehler-Antwort. */
export async function pruefeZugriff(req: Request, recht: string): Promise<{ name: string; id: number } | Response> {
  const roh = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const db = await getDb();
  const pfad = new URL(req.url).pathname.slice(0, 200);
  const merke = (ergebnis: string, s?: { id: number; name: string }) => db.insert(schema.apiProtokoll).values({ schluesselId: s?.id ?? null, name: s?.name ?? null, methode: req.method, pfad, ergebnis });
  if (!roh.startsWith("lvx_")) {
    await merke("401");
    return json({ fehler: "API-Schlüssel fehlt (Authorization: Bearer lvx_…)" }, 401);
  }
  const [s] = await db.select().from(schema.apiSchluessel).where(and(eq(schema.apiSchluessel.hash, hash(roh)), isNull(schema.apiSchluessel.widerrufenAm)));
  if (!s) {
    await merke("401");
    return json({ fehler: "Ungültiger Schlüssel" }, 401);
  }
  if (grenzeErreicht(s.id)) {
    await merke("429", s);
    return json({ fehler: `Zu viele Anfragen (höchstens ${API_GRENZE_JE_MINUTE} je Minute)` }, 429);
  }
  if (!s.rechte.includes(recht)) {
    await merke("403", s);
    return json({ fehler: `Recht „${recht}“ fehlt` }, 403);
  }
  await merke("erlaubt", s);
  await db.update(schema.apiSchluessel).set({ zuletztAm: new Date() }).where(eq(schema.apiSchluessel.id, s.id));
  return { name: `API: ${s.name}`, id: s.id };
}

export function json(daten: unknown, status = 200): Response {
  return new Response(JSON.stringify(daten), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
}
