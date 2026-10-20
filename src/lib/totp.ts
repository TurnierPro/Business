import crypto from "node:crypto";

// Zwei-Faktor-Anmeldung nach RFC 6238 (TOTP): 6-stelliger Code, alle 30 Sekunden neu,
// erzeugt von einer Authenticator-App (z. B. 2FAS, Google Authenticator, 1Password).

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function neuesGeheimnis(): string {
  return Array.from(crypto.randomBytes(20), (b) => ALPHABET[b % 32]).join("");
}

function base32(text: string): Buffer {
  let bits = "";
  for (const c of text.replace(/=+$/, "").toUpperCase()) {
    const v = ALPHABET.indexOf(c);
    if (v < 0) continue;
    bits += v.toString(2).padStart(5, "0");
  }
  return Buffer.from(bits.match(/.{8}/g)?.map((b) => parseInt(b, 2)) ?? []);
}

export function code(geheimnis: string, zeit = Date.now()): string {
  const zaehler = Buffer.alloc(8);
  zaehler.writeBigUInt64BE(BigInt(Math.floor(zeit / 30000)));
  const h = crypto.createHmac("sha1", base32(geheimnis)).update(zaehler).digest();
  const o = h[h.length - 1] & 0xf;
  const zahl = (h.readUInt32BE(o) & 0x7fffffff) % 1_000_000;
  return String(zahl).padStart(6, "0");
}

/** Prüft den Code; erlaubt 30 Sekunden Uhrabweichung in beide Richtungen. */
export function pruefe(geheimnis: string, eingabe: string, zeit = Date.now()): boolean {
  const c = eingabe.replace(/\s/g, "");
  if (!/^\d{6}$/.test(c)) return false;
  return [-1, 0, 1].some((d) => crypto.timingSafeEqual(Buffer.from(code(geheimnis, zeit + d * 30000)), Buffer.from(c)));
}

export function otpauthUrl(geheimnis: string, email: string, firma = "Stelax OS"): string {
  return `otpauth://totp/${encodeURIComponent(`${firma}:${email}`)}?secret=${geheimnis}&issuer=${encodeURIComponent(firma)}&digits=6&period=30`;
}
