import net from "node:net";
import { lookup } from "node:dns/promises";
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { getDb, schema } from "./db";

// Sicherheits-Bausteine: Mengenbegrenzung, sichere Abrufe nach außen (gegen SSRF), Dateiprüfung, sichere Weiterleitungen.

// ---------- Mengenbegrenzung (Brute Force, Spam) ----------

export const GRENZEN = {
  loginJeKonto: { max: 5, minuten: 15 },
  loginJeIp: { max: 20, minuten: 15 },
  codeJeKonto: { max: 5, minuten: 15 },
  formularJeIp: { max: 10, minuten: 60 },
} as const;

/** Zählt Versuche im Zeitfenster. true = noch erlaubt. */
export async function erlaubt(art: string, schluessel: string, g: { max: number; minuten: number }): Promise<boolean> {
  const db = await getDb();
  const seit = new Date(Date.now() - g.minuten * 60_000);
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.versuche).where(and(eq(schema.versuche.art, art), eq(schema.versuche.schluessel, schluessel), gte(schema.versuche.am, seit)));
  return r.n < g.max;
}

export async function versuchMerken(art: string, schluessel: string): Promise<void> {
  const db = await getDb();
  await db.insert(schema.versuche).values({ art, schluessel });
}

export async function versucheLoeschen(art: string, schluessel: string): Promise<void> {
  const db = await getDb();
  await db.delete(schema.versuche).where(and(eq(schema.versuche.art, art), eq(schema.versuche.schluessel, schluessel)));
}

export async function alteVersucheLoeschen(tage = 30): Promise<number> {
  const db = await getDb();
  return (await db.delete(schema.versuche).where(lt(schema.versuche.am, new Date(Date.now() - tage * 864e5))).returning({ id: schema.versuche.id })).length;
}

/** Client-IP. Hinter dem Proxy (Caddy/Traefik) steht sie in X-Forwarded-For; sonst „lokal“. Gekürzt gespeichert (Datensparsamkeit). */
export function clientIp(h: Headers): string {
  const roh = (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "lokal").trim();
  // IPv4 auf /24, IPv6 auf /48 kürzen: reicht für Sperren, ist aber kein vollständiges Personenmerkmal
  if (net.isIPv4(roh)) return roh.split(".").slice(0, 3).join(".") + ".0";
  if (net.isIPv6(roh)) return roh.split(":").slice(0, 3).join(":") + "::";
  return "lokal";
}

// ---------- Sichere Abrufe nach außen (SSRF) ----------

/** Private, lokale und reservierte Adressen: dorthin rufen wir nie etwas ab (Schutz des Servers und des internen Netzes). */
export function istInterneAdresse(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  const x = ip.toLowerCase();
  if (x.startsWith("::ffff:")) return istInterneAdresse(x.slice(7));
  return x === "::" || x === "::1" || x.startsWith("fc") || x.startsWith("fd") || x.startsWith("fe80") || x.startsWith("ff");
}

/** fetch nur zu öffentlichen Adressen, Weiterleitungen werden einzeln geprüft (höchstens 5). */
export async function sicheresFetch(url: string, o: { timeoutMs?: number; headers?: Record<string, string>; method?: string; body?: string } = {}): Promise<Response> {
  let ziel = new URL(url);
  for (let i = 0; i < 6; i++) {
    if (!["http:", "https:"].includes(ziel.protocol)) throw new Error("Nur http und https erlaubt");
    if (ziel.port && !["80", "443"].includes(ziel.port)) throw new Error("Nur Standard-Ports erlaubt");
    const host = ziel.hostname.replace(/^\[|\]$/g, "");
    const adressen = net.isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
    if (!adressen.length || adressen.some((a) => istInterneAdresse(a.address))) throw new Error(`Interne Adresse blockiert: ${host}`);
    const r = await fetch(ziel, { redirect: "manual", signal: AbortSignal.timeout(o.timeoutMs ?? 10_000), headers: o.headers, method: o.method, body: o.body });
    const weiter = r.headers.get("location");
    if (r.status >= 300 && r.status < 400 && weiter) {
      ziel = new URL(weiter, ziel);
      continue;
    }
    return r;
  }
  throw new Error("Zu viele Weiterleitungen");
}

// ---------- Dateien ----------

/** Prüft den echten Dateityp anhand der ersten Bytes (der Name und der Browser-Typ können lügen). */
export function dateiTyp(b: Uint8Array): "jpg" | "png" | "webp" | "gif" | "heic" | "pdf" | null {
  const s = (i: number, t: string) => [...t].every((c, k) => b[i + k] === c.charCodeAt(0));
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b[0] === 0x89 && s(1, "PNG")) return "png";
  if (s(0, "RIFF") && s(8, "WEBP")) return "webp";
  if (s(0, "GIF8")) return "gif";
  if (s(4, "ftyp") && (s(8, "heic") || s(8, "heix") || s(8, "mif1") || s(8, "heif"))) return "heic";
  if (s(0, "%PDF-")) return "pdf";
  return null;
}

export async function pruefeDatei(f: File, erlaubt: ("bild" | "pdf")[], maxMb = 20): Promise<{ daten: Buffer; endung: string }> {
  if (f.size > maxMb * 1024 * 1024) throw new Error(`Datei zu groß (höchstens ${maxMb} MB)`);
  const daten = Buffer.from(await f.arrayBuffer());
  const typ = dateiTyp(daten);
  const ok = typ && ((typ === "pdf" && erlaubt.includes("pdf")) || (typ !== "pdf" && erlaubt.includes("bild")));
  if (!ok) throw new Error(`Dateityp nicht erlaubt (${erlaubt.includes("pdf") ? "PDF oder Foto" : "nur Fotos"})`);
  return { daten, endung: typ };
}

// ---------- Weiterleitungen ----------

/** Nur interne Pfade: verhindert, dass ein Formularfeld auf fremde Seiten umleitet (Open Redirect). */
export function internerPfad(ziel: string, ersatz = "/"): string {
  return /^\/(?![/\\])[^\s]*$/.test(ziel) ? ziel : ersatz;
}
