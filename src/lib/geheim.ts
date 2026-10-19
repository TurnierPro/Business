import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { datenOrdner } from "./pfade";

// Geheimnis für Sitzungen und Link-Schlüssel. Auf dem Server als SESSION_SECRET setzen.

function geheimnis(): string {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const datei = path.join(datenOrdner(), "sitzungs-geheimnis.txt");
  if (!fs.existsSync(datei)) fs.writeFileSync(datei, crypto.randomBytes(32).toString("hex"), { mode: 0o600 });
  return fs.readFileSync(datei, "utf8").trim();
}

export function signiere(wert: string): string {
  return crypto.createHmac("sha256", geheimnis()).update(wert).digest("hex");
}

/** Kurzer, nicht erratbarer Link-Schlüssel, z. B. für das Angebot im Kundenportal. */
export function linkSchluessel(art: string, id: number): string {
  return `${id}-${signiere(`${art}:${id}`).slice(0, 16)}`;
}

export function pruefeLinkSchluessel(art: string, schluessel: string): number | null {
  const id = Number(schluessel.split("-")[0]);
  if (!id) return null;
  const erwartet = linkSchluessel(art, id);
  return erwartet.length === schluessel.length && crypto.timingSafeEqual(Buffer.from(erwartet), Buffer.from(schluessel)) ? id : null;
}

/** Kurzlebige Geheimnisse (z. B. AuthInfo für einen Providerwechsel) verschlüsselt speichern. */
export function verschluessele(klartext: string): string {
  const schluessel = crypto.createHash("sha256").update(`verschluesselung:${geheimnis()}`).digest();
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", schluessel, iv);
  const daten = Buffer.concat([c.update(klartext, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), daten].map((b) => b.toString("base64url")).join(".");
}

export function entschluessele(geheim: string): string {
  const [iv, tag, daten] = geheim.split(".").map((t) => Buffer.from(t, "base64url"));
  const schluessel = crypto.createHash("sha256").update(`verschluesselung:${geheimnis()}`).digest();
  const d = crypto.createDecipheriv("aes-256-gcm", schluessel, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(daten), d.final()]).toString("utf8");
}
