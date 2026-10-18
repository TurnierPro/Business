import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb, schema } from "../db";
import type { Anschrift } from "../docs/basis";

export const SYSTEM = "Stelax OS";

export function basisUrl(): string {
  return (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export function zufallsCode(laenge = 6): string {
  const zeichen = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(crypto.randomBytes(laenge), (b) => zeichen[b % zeichen.length]).join("");
}

export function slugAus(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

export async function betrieb(id: number) {
  const db = await getDb();
  const [b] = await db.select().from(schema.betriebe).where(eq(schema.betriebe.id, id));
  if (!b) throw new Error(`Betrieb ${id} nicht gefunden`);
  return b;
}

export type Betrieb = Awaited<ReturnType<typeof betrieb>>;

export function anschrift(b: Betrieb): Anschrift {
  return { name: b.name, anrede: b.anrede, inhaber: b.inhaber, strasse: b.strasse, plz: b.plz, ort: b.ort };
}

export async function neuesDokument(d: { betriebId?: number | null; projektId?: number | null; art: string; titel: string; daten: unknown }): Promise<number> {
  const db = await getDb();
  const [neu] = await db
    .insert(schema.dokumente)
    .values({ betriebId: d.betriebId ?? null, projektId: d.projektId ?? null, art: d.art, titel: d.titel, daten: d.daten })
    .returning({ id: schema.dokumente.id });
  return neu.id;
}

export async function setzeStatus(betriebId: number, status: string): Promise<void> {
  const db = await getDb();
  await db.update(schema.betriebe).set({ status, letzteAktivitaet: new Date() }).where(eq(schema.betriebe.id, betriebId));
}

export function sperrSchluessel(name: string, website?: string | null): string {
  const domain = (website ?? "").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  return domain || name.toLowerCase().replace(/gmbh|kg|& co\.?|ug|e\.k\.|[^a-z0-9äöüß]/g, "");
}
