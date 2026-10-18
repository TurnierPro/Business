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
