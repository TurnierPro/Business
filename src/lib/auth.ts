import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "./db";
import { datenOrdner } from "./pfade";

export const COOKIE = "stelax_sitzung";
const LAUFZEIT_TAGE = 14;
export const START_PASSWORT = process.env.STELAX_START_PASSWORT ?? "stelax-start-2026";

function geheimnis(): string {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const datei = path.join(datenOrdner(), "sitzungs-geheimnis.txt");
  if (!fs.existsSync(datei)) fs.writeFileSync(datei, crypto.randomBytes(32).toString("hex"), { mode: 0o600 });
  return fs.readFileSync(datei, "utf8").trim();
}

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

function signiere(wert: string): string {
  return crypto.createHmac("sha256", geheimnis()).update(wert).digest("hex");
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

export type Benutzer = { id: number; name: string; email: string };

export async function aktuellerBenutzer(): Promise<Benutzer | null> {
  const id = liesSitzung((await cookies()).get(COOKIE)?.value);
  if (!id) return null;
  const db = await getDb();
  const [b] = await db.select().from(schema.benutzer).where(eq(schema.benutzer.id, id));
  return b ? { id: b.id, name: b.name, email: b.email } : null;
}

export async function brauchtBenutzer(): Promise<Benutzer> {
  const b = await aktuellerBenutzer();
  if (!b) redirect("/login");
  return b;
}
