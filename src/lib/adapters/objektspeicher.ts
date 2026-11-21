import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { datenOrdner } from "../pfade";

// Objektspeicher für die Sicherung außerhalb des Servers: IONOS Object Storage (S3-Schnittstelle, Rechenzentrum Deutschland).
// Echt nur mit S3_ENDPOINT, S3_BUCKET, S3_ZUGRIFF und S3_GEHEIM, sonst Simulator (Ordner im Datenverzeichnis).
// Hierher gehen nur verschlüsselte Dateien (AES-256-GCM, Schlüssel in Bitwarden). Feste Dienst-Adresse: normales fetch.
// Signatur nach AWS Signature Version 4 (ohne Fremdbibliothek, gegen das offizielle Beispiel getestet).

export const OBJEKTSPEICHER_BRAUCHT = ["S3_ENDPOINT", "S3_BUCKET", "S3_ZUGRIFF", "S3_GEHEIM"];
export const objektspeicherEcht = () => OBJEKTSPEICHER_BRAUCHT.every((k) => !!process.env[k]);

const sha256 = (d: string | Buffer) => crypto.createHash("sha256").update(d).digest("hex");
const hmac = (k: crypto.BinaryLike, d: string) => crypto.createHmac("sha256", k).update(d).digest();
const kodiere = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/** Signatur Version 4. Gibt den Authorization-Kopf zurück. Alle übergebenen Kopfzeilen werden mitsigniert. */
export function signiereV4(o: {
  methode: string;
  pfad: string; // schon kodiert, z. B. /bucket/datei.enc
  query?: Record<string, string>;
  kopf: Record<string, string>; // muss host, x-amz-date und x-amz-content-sha256 enthalten
  payloadHash: string;
  region: string;
  zugriff: string;
  geheim: string;
}): string {
  const datum = o.kopf["x-amz-date"];
  const tag = datum.slice(0, 8);
  const namen = Object.keys(o.kopf).map((k) => k.toLowerCase()).sort();
  const kanonKopf = namen.map((k) => `${k}:${String(Object.entries(o.kopf).find(([n]) => n.toLowerCase() === k)![1]).trim()}\n`).join("");
  const query = Object.entries(o.query ?? {})
    .map(([k, v]) => [kodiere(k), kodiere(v)])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const anfrage = [o.methode, o.pfad, query, kanonKopf, namen.join(";"), o.payloadHash].join("\n");
  const bereich = `${tag}/${o.region}/s3/aws4_request`;
  const zuSignieren = ["AWS4-HMAC-SHA256", datum, bereich, sha256(anfrage)].join("\n");
  const schluessel = hmac(hmac(hmac(hmac(`AWS4${o.geheim}`, tag), o.region), "s3"), "aws4_request");
  const signatur = crypto.createHmac("sha256", schluessel).update(zuSignieren).digest("hex");
  return `AWS4-HMAC-SHA256 Credential=${o.zugriff}/${bereich}, SignedHeaders=${namen.join(";")}, Signature=${signatur}`;
}

async function s3(methode: "PUT" | "GET" | "DELETE", name: string, o: { daten?: Buffer; query?: Record<string, string> } = {}): Promise<Response> {
  const e = process.env;
  const basis = new URL(e.S3_ENDPOINT!);
  if (basis.protocol !== "https:") throw new Error("S3_ENDPOINT muss mit https:// beginnen");
  const pfad = `/${kodiere(e.S3_BUCKET!)}${name ? `/${name.split("/").map(kodiere).join("/")}` : ""}`;
  const payloadHash = sha256(o.daten ?? "");
  const kopf: Record<string, string> = { host: basis.host, "x-amz-date": new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""), "x-amz-content-sha256": payloadHash };
  const authorization = signiereV4({ methode, pfad, query: o.query, kopf, payloadHash, region: e.S3_REGION ?? "eu-central-3", zugriff: e.S3_ZUGRIFF!, geheim: e.S3_GEHEIM! });
  const qs = o.query ? `?${new URLSearchParams(o.query).toString()}` : "";
  const res = await fetch(`${basis.origin}${pfad}${qs}`, { method: methode, headers: { ...kopf, Authorization: authorization }, body: o.daten ? new Uint8Array(o.daten) : undefined, signal: AbortSignal.timeout(120_000) });
  if (!res.ok && !(methode === "DELETE" && res.status === 404)) throw new Error(`Objektspeicher ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  return res;
}

const simOrdner = () => datenOrdner("objektspeicher-simulator");
const sicher = (name: string) => {
  if (!/^[\w.-]+$/.test(name)) throw new Error("Ungültiger Dateiname für den Objektspeicher");
  return name;
};

export async function hochladen(name: string, daten: Buffer): Promise<void> {
  sicher(name);
  if (!objektspeicherEcht()) return void fs.writeFileSync(path.join(simOrdner(), name), daten);
  await s3("PUT", name, { daten });
}

export async function herunterladen(name: string): Promise<Buffer> {
  sicher(name);
  if (!objektspeicherEcht()) return fs.readFileSync(path.join(simOrdner(), name));
  return Buffer.from(await (await s3("GET", name)).arrayBuffer());
}

export async function auflisten(): Promise<{ name: string; am: Date; groesse: number }[]> {
  if (!objektspeicherEcht()) {
    return fs.readdirSync(simOrdner()).map((f) => {
      const st = fs.statSync(path.join(simOrdner(), f));
      return { name: f, am: st.mtime, groesse: st.size };
    });
  }
  const xml = await (await s3("GET", "", { query: { "list-type": "2", "max-keys": "1000" } })).text();
  return [...xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)].map((m) => ({
    name: /<Key>([^<]+)<\/Key>/.exec(m[1])?.[1] ?? "",
    am: new Date(/<LastModified>([^<]+)<\/LastModified>/.exec(m[1])?.[1] ?? 0),
    groesse: Number(/<Size>(\d+)<\/Size>/.exec(m[1])?.[1] ?? 0),
  }));
}

export async function loeschen(name: string): Promise<void> {
  sicher(name);
  if (!objektspeicherEcht()) return void fs.rmSync(path.join(simOrdner(), name), { force: true });
  await s3("DELETE", name);
}
