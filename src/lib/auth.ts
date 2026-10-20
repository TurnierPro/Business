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
  if (!salz || !hash || hash.length !== 128) return false;
  const neu = crypto.scryptSync(passwort, salz, 64);
  return crypto.timingSafeEqual(neu, Buffer.from(hash, "hex"));
}

// Gleiche Rechenzeit, auch wenn es das Konto nicht gibt (sonst verrät die Antwortzeit, welche E-Mails existieren)
const ATTRAPPE = hashPasswort(crypto.randomBytes(16).toString("hex"));
export function pruefeAnmeldung(passwort: string, gespeichert: string | undefined): boolean {
  return gespeichert ? pruefePasswort(passwort, gespeichert) : (pruefePasswort(passwort, ATTRAPPE), false);
}

/** Sitzung: Benutzer, Sitzungs-Version (erhöht = alle alten Sitzungen ungültig), Ablauf, Signatur. */
export function sitzungsWert(benutzerId: number, version = 0): string {
  const wert = `${benutzerId}.${version}.${Date.now() + LAUFZEIT_TAGE * 864e5}`;
  return `${wert}.${signiere(wert)}`;
}

function liesSitzung(roh: string | undefined): { id: number; version: number } | null {
  if (!roh) return null;
  const [id, version, ablauf, sig] = roh.split(".");
  if (!id || !version || !ablauf || !sig) return null;
  const erwartet = signiere(`${id}.${version}.${ablauf}`);
  if (sig.length !== erwartet.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(erwartet))) return null;
  if (Number(ablauf) < Date.now()) return null;
  return { id: Number(id), version: Number(version) };
}

/** Auf dem Server muss das Start-Passwort gesetzt sein (nie das Übungs-Passwort aus dem Code). */
export const startPasswortUnsicher = () => process.env.NODE_ENV === "production" && (!process.env.STELAX_START_PASSWORT || process.env.STELAX_START_PASSWORT.length < 12);

/** Legt beim allerersten Start die beiden Gründer an. Das Start-Passwort muss beim ersten Anmelden geändert werden. */
export async function startBenutzer(): Promise<boolean> {
  const db = await getDb();
  const vorhanden = await db.select({ id: schema.benutzer.id }).from(schema.benutzer).limit(1);
  if (vorhanden.length) return false;
  if (startPasswortUnsicher()) return false;
  await db.insert(schema.benutzer).values([
    { email: "max@stelax.de", name: "Max Steiner", passwortHash: hashPasswort(START_PASSWORT), mussPasswortAendern: true },
    { email: "daniel@stelax.de", name: "Daniel Lück", passwortHash: hashPasswort(START_PASSWORT), mussPasswortAendern: true },
  ]);
  return true;
}

export type Rolle = "admin" | "vertrieb" | "technik" | "lesen";
export const ROLLEN: Record<Rolle, string> = { admin: "Admin (alles)", vertrieb: "Vertrieb", technik: "Technik", lesen: "Nur lesen" };
export type Benutzer = { id: number; name: string; email: string; rolle: Rolle; mussPasswortAendern: boolean };

export async function aktuellerBenutzer(): Promise<Benutzer | null> {
  const s = liesSitzung((await cookies()).get(COOKIE)?.value);
  if (!s) return null;
  const db = await getDb();
  const [b] = await db.select().from(schema.benutzer).where(eq(schema.benutzer.id, s.id));
  if (!b || !b.aktiv || b.sitzungVersion !== s.version) return null;
  return { id: b.id, name: b.name, email: b.email, rolle: b.rolle as Rolle, mussPasswortAendern: b.mussPasswortAendern };
}

export async function brauchtBenutzer(): Promise<Benutzer> {
  const b = await aktuellerBenutzer();
  if (!b) redirect("/login");
  if (b.mussPasswortAendern) redirect("/passwort");
  return b;
}

/** Sitzungs-Cookie setzen: nur über HTTPS (auf dem Server), nicht für JavaScript lesbar, nicht von fremden Seiten mitgesendet. */
export const COOKIE_OPTIONEN = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: LAUFZEIT_TAGE * 86400 };

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

/** Passwort-Regeln: mindestens 12 Zeichen, nicht das Start-Passwort, nicht nur Ziffern. */
export function passwortProblem(neu: string): string | null {
  if (neu.length < 12) return "Das Passwort braucht mindestens 12 Zeichen.";
  if (neu === START_PASSWORT || /^stelax/i.test(neu)) return "Bitte nicht das Start-Passwort oder „stelax…“ verwenden.";
  if (/^\d+$/.test(neu) || new Set(neu).size < 5) return "Das Passwort ist zu einfach.";
  return null;
}
