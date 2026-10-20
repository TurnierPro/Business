import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "./db";
import { signiere } from "./geheim";

export const COOKIE = "stelax_sitzung";
const LAUFZEIT_TAGE = 14;
export const START_PASSWORT = process.env.STELAX_START_PASSWORT ?? "stelax-start-2026";

export function hashPasswort(passwort: string): string {
  const salz = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(passwort, salz, 64).toString("hex");
  return `${salz}:${hash}`;
}

export function pruefePasswort(passwort: string, gespeichert: string): boolean {
  const [salz, hash] = gespeichert.split(":");
  const neu = crypto.scryptSync(passwort, salz, 64);
  return crypto.timingSafeEqual(neu, Buffer.from(hash, "hex"));
}

export function sitzungsWert(benutzerId: number): string {
  const wert = `${benutzerId}.${Date.now() + LAUFZEIT_TAGE * 864e5}`;
  return `${wert}.${signiere(wert)}`;
}

function liesSitzung(roh: string | undefined): number | null {
  if (!roh) return null;
  const [id, ablauf, sig] = roh.split(".");
  if (!id || !ablauf || !sig) return null;
  const erwartet = signiere(`${id}.${ablauf}`);
  if (sig.length !== erwartet.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(erwartet))) return null;
  if (Number(ablauf) < Date.now()) return null;
  return Number(id);
}

/** Legt beim allerersten Start die beiden Gründer an. */
export async function startBenutzer(): Promise<boolean> {
  const db = await getDb();
  const vorhanden = await db.select({ id: schema.benutzer.id }).from(schema.benutzer).limit(1);
  if (vorhanden.length) return false;
  await db.insert(schema.benutzer).values([
    { email: "max@stelax.de", name: "Max Steiner", passwortHash: hashPasswort(START_PASSWORT) },
    { email: "daniel@stelax.de", name: "Daniel Lück", passwortHash: hashPasswort(START_PASSWORT) },
  ]);
  return true;
}

export type Rolle = "admin" | "vertrieb" | "technik" | "lesen";
export const ROLLEN: Record<Rolle, string> = { admin: "Admin (alles)", vertrieb: "Vertrieb", technik: "Technik", lesen: "Nur lesen" };
export type Benutzer = { id: number; name: string; email: string; rolle: Rolle };

export async function aktuellerBenutzer(): Promise<Benutzer | null> {
  const id = liesSitzung((await cookies()).get(COOKIE)?.value);
  if (!id) return null;
  const db = await getDb();
  const [b] = await db.select().from(schema.benutzer).where(eq(schema.benutzer.id, id));
  return b && b.aktiv ? { id: b.id, name: b.name, email: b.email, rolle: b.rolle as Rolle } : null;
}

export async function brauchtBenutzer(): Promise<Benutzer> {
  const b = await aktuellerBenutzer();
  if (!b) redirect("/login");
  return b;
}

/** Nur-lesen-Konten dürfen nichts ändern; Benutzer und Schlüssel verwaltet nur Admin. */
export function darf(b: Benutzer, was: "aendern" | "verwalten"): boolean {
  return was === "verwalten" ? b.rolle === "admin" : b.rolle !== "lesen";
}

// Zwischenschritt bei der Anmeldung mit Zwei-Faktor: Passwort ist richtig, Code fehlt noch (5 Minuten gültig).
export const COOKIE_2FA = "stelax_2fa";
export function zwischenWert(benutzerId: number): string {
  const wert = `${benutzerId}.${Date.now() + 5 * 60_000}`;
  return `${wert}.${signiere(`2fa:${wert}`)}`;
}
export function liesZwischen(roh: string | undefined): number | null {
  if (!roh) return null;
  const [id, ablauf, sig] = roh.split(".");
  if (!id || !ablauf || !sig) return null;
  const erwartet = signiere(`2fa:${id}.${ablauf}`);
  if (sig.length !== erwartet.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(erwartet))) return null;
  return Number(ablauf) < Date.now() ? null : Number(id);
}
