import fs from "node:fs";
import path from "node:path";
import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "./db";
import { datenOrdner } from "./pfade";
import { pruefeDatei } from "./sicherheit";
import { zipLesen } from "./zip";
import { protokolliere } from "./protokoll";

// Demo-Pakete: eine anklickbare Demo-Website plus Instagram-Vorlagen für einen Betrieb, als ZIP hochgeladen.
// Ablauf: hochladen (intern ansehen) → „Im Kundenportal freigeben“ legt eine Mail in den Postausgang →
// erst nach Freigabe und Versand dieser Mail sieht der Kunde die Demo im Portal. Kein Weg an der Freigabe vorbei.

export const DEMO_STATUS: Record<string, string> = { entwurf: "nur intern", zur_freigabe: "wartet auf Freigabe", im_portal: "im Kundenportal", zurueckgezogen: "zurückgezogen" };

// Erlaubte Dateien: statische Website (keine Programme, keine Serverdateien)
export const DEMO_TYPEN: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".htm": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".json": "application/json", ".webmanifest": "application/manifest+json", ".txt": "text/plain; charset=utf-8",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".avif": "image/avif",
  ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf", ".otf": "font/otf",
  ".mp4": "video/mp4", ".webm": "video/webm",
};
const GRENZEN = { maxDateien: 600, maxDateiMb: 25, maxGesamtMb: 120 };

const ordnerVon = (id: number) => datenOrdner("demos", String(id));

/** Pfad aus dem ZIP prüfen: nur relative Pfade, keine Ausbrüche nach oben, nur erlaubte Dateitypen. Gibt null zurück für Dateien, die ignoriert werden. */
export function demoPfad(name: string): string | null {
  const n = name.replace(/\\/g, "/");
  if (n.startsWith("/") || /^[a-z]:/i.test(n) || n.split("/").some((t) => t === ".." )) throw new Error(`Unzulässiger Pfad im ZIP: ${name}`);
  const teile = n.split("/").filter((t) => t && t !== ".");
  if (teile.some((t) => t.startsWith("__MACOSX") || t === ".DS_Store" || t.startsWith("._"))) return null; // Mac-Beifang
  if (teile.some((t) => t.startsWith("."))) return null; // versteckte Dateien
  const endung = path.extname(teile.at(-1) ?? "").toLowerCase();
  if (!DEMO_TYPEN[endung]) throw new Error(`Dateityp nicht erlaubt: ${name} (erlaubt: Website-Dateien, Bilder, Schriften)`);
  return teile.join("/");
}

/** ZIP hochladen und entpacken. Liegt alles in einem gemeinsamen Ordner, wird dieser entfernt. Braucht eine index.html. */
export async function demoHochladen(o: { betriebId: number; titel: string; datei: File; wer: string }): Promise<number> {
  const { daten } = await pruefeDatei(o.datei, ["zip"], 80);
  const roh = zipLesen(daten, GRENZEN);
  let dateien = roh.map((e) => ({ pfad: demoPfad(e.name), daten: e.daten })).filter((e): e is { pfad: string; daten: Buffer } => !!e.pfad);
  if (!dateien.length) throw new Error("Das ZIP enthält keine Website-Dateien.");
  // gemeinsamen Oberordner entfernen (z. B. „demo-bauer/index.html“ → „index.html“)
  const erster = dateien[0].pfad.split("/")[0];
  if (dateien.every((d) => d.pfad.includes("/") && d.pfad.split("/")[0] === erster)) dateien = dateien.map((d) => ({ ...d, pfad: d.pfad.slice(erster.length + 1) }));
  if (!dateien.some((d) => d.pfad === "index.html")) throw new Error("Im ZIP fehlt die Startseite index.html (oberste Ebene).");
  const titel = o.titel.trim().slice(0, 120) || "Demo";
  const db = await getDb();
  const [b] = await db.select({ id: schema.betriebe.id }).from(schema.betriebe).where(eq(schema.betriebe.id, o.betriebId));
  if (!b) throw new Error("Betrieb nicht gefunden");
  const [neu] = await db.insert(schema.demos).values({ betriebId: o.betriebId, titel, dateien: dateien.length, groesse: dateien.reduce((x, d) => x + d.daten.length, 0), erstelltVon: o.wer }).returning({ id: schema.demos.id });
  const basis = ordnerVon(neu.id);
  for (const d of dateien) {
    const ziel = path.join(basis, d.pfad);
    if (!ziel.startsWith(basis + path.sep)) throw new Error("Unzulässiger Pfad"); // doppelte Sicherung
    fs.mkdirSync(path.dirname(ziel), { recursive: true });
    fs.writeFileSync(ziel, d.daten);
  }
  await protokolliere(o.wer, `Demo-Paket hochgeladen: ${titel} (${dateien.length} Dateien)`, o.betriebId);
  return neu.id;
}

/** Datei einer Demo lesen (für die Auslieferung). Gibt null zurück, wenn es sie nicht gibt oder der Pfad unzulässig ist. */
export function demoDatei(id: number, pfadTeile: string[]): { daten: Buffer; typ: string } | null {
  const basis = ordnerVon(id);
  const rel = (pfadTeile.length ? pfadTeile : ["index.html"]).map((t) => decodeURIComponent(t)).join("/");
  if (rel.split("/").some((t) => t === ".." || t.startsWith("."))) return null;
  let ziel = path.resolve(basis, rel);
  if (!ziel.startsWith(basis + path.sep)) return null;
  if (fs.existsSync(ziel) && fs.statSync(ziel).isDirectory()) ziel = path.join(ziel, "index.html");
  const typ = DEMO_TYPEN[path.extname(ziel).toLowerCase()];
  if (!typ || !fs.existsSync(ziel)) return null;
  return { daten: fs.readFileSync(ziel), typ };
}

export async function demosVon(betriebId: number) {
  const db = await getDb();
  return db.select().from(schema.demos).where(eq(schema.demos.betriebId, betriebId)).orderBy(desc(schema.demos.erstelltAm));
}

/** „Im Kundenportal freigeben“: Mail an den Kunden in den Postausgang. Sichtbar wird die Demo erst nach Versand. */
export async function demoFreigabeAnfordern(id: number, wer: string): Promise<number> {
  const db = await getDb();
  const [d] = await db.select().from(schema.demos).where(eq(schema.demos.id, id));
  if (!d) throw new Error("Demo nicht gefunden");
  if (d.status === "im_portal") throw new Error("Die Demo ist schon im Kundenportal.");
  if (d.status === "zur_freigabe" && d.eintragId) return d.eintragId;
  const [b] = await db.select().from(schema.betriebe).where(eq(schema.betriebe.id, d.betriebId));
  const { inPostausgang } = await import("./ablauf/postausgang");
  const { portalLink } = await import("./kundenportal");
  const anrede = b.inhaber ? (b.anrede === "Frau" ? `Sehr geehrte Frau ${b.inhaber.split(" ").slice(-1)[0]},` : `Sehr geehrter Herr ${b.inhaber.split(" ").slice(-1)[0]},`) : "Guten Tag,";
  const eintragId = await inPostausgang({
    betriebId: b.id,
    kanal: "mail",
    zweck: "demo_portal",
    empfaenger: b.email ?? "(E-Mail-Adresse fehlt)",
    betreff: `Ihre Demo liegt im Kundenportal: ${d.titel}`,
    text: `${anrede}\n\nwie besprochen haben wir Ihnen gezeigt, wie Ihr neuer Auftritt aussehen könnte. Die Demo mit Website und Instagram-Vorlagen liegt jetzt in Ihrem Kundenportal. Jede Seite lässt sich anklicken.\n${await portalLink(b.id)}\n\nDie Demo ist nicht öffentlich und nur über Ihren persönlichen Link erreichbar. Texte und Fotos stammen aus Ihren Angaben; vor dem Start prüfen wir alles gemeinsam mit Ihnen.\n\nBei Fragen rufen Sie mich gern an.\n\nMit freundlichen Grüßen\nDaniel Lück\nLevarex Consulting`,
    hinweise: b.email ? [] : ["E-Mail-Adresse fehlt. Beim Betrieb ergänzen und Empfänger anpassen."],
    meta: { demoId: d.id },
  });
  await db.update(schema.demos).set({ status: "zur_freigabe", eintragId }).where(eq(schema.demos.id, id));
  await protokolliere(wer, `Demo zur Freigabe ins Kundenportal: ${d.titel}`, b.id);
  return eintragId;
}

/** Nach Versand der Mail: Demo im Portal sichtbar (aufgerufen aus nachVersand). */
export async function demoImPortal(demoId: number): Promise<void> {
  const db = await getDb();
  await db.update(schema.demos).set({ status: "im_portal", imPortalAm: new Date() }).where(eq(schema.demos.id, demoId));
}

/** Aus dem Portal nehmen (bleibt intern erhalten). */
export async function demoZurueckziehen(id: number, wer: string): Promise<void> {
  const db = await getDb();
  const [d] = await db.update(schema.demos).set({ status: "zurueckgezogen" }).where(eq(schema.demos.id, id)).returning();
  if (d) await protokolliere(wer, `Demo aus dem Kundenportal genommen: ${d.titel}`, d.betriebId);
}

/** Demo samt Dateien löschen. */
export async function demoLoeschen(id: number, wer: string): Promise<void> {
  const db = await getDb();
  const [d] = await db.delete(schema.demos).where(eq(schema.demos.id, id)).returning();
  fs.rmSync(ordnerVon(id), { recursive: true, force: true });
  if (d) await protokolliere(wer, `Demo gelöscht: ${d.titel}`, d.betriebId);
}

/** Dateien aller Demos eines Betriebs löschen (Datenschutz-Löschung). Die Zeilen löscht die Datenbank über den Betrieb. */
export async function demoDateienLoeschen(betriebId: number): Promise<void> {
  for (const d of await demosVon(betriebId)) fs.rmSync(ordnerVon(d.id), { recursive: true, force: true });
}

/** Für das Portal: nur freigegebene Demos dieses Betriebs. */
export async function portalDemo(betriebId: number, demoId: number) {
  const db = await getDb();
  const [d] = await db.select().from(schema.demos).where(and(eq(schema.demos.id, demoId), eq(schema.demos.betriebId, betriebId), eq(schema.demos.status, "im_portal")));
  return d ?? null;
}
