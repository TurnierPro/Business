import path from "node:path";
import fs from "node:fs";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { PGlite } from "@electric-sql/pglite";
import * as schema from "./schema";
import { datenOrdner } from "../pfade";

// Ohne DATABASE_URL läuft eine eingebaute Postgres-Datenbank (PGlite) im Ordner data/db.
// Auf dem Server setzt du DATABASE_URL auf die echte PostgreSQL-Datenbank.

export type Db = ReturnType<typeof drizzlePglite<typeof schema>>;

type Speicher = { db?: Promise<Db>; pglite?: PGlite };
const g = globalThis as unknown as { __nexovaDb?: Speicher };
g.__nexovaDb ??= {};

const migrationsOrdner = path.join(process.cwd(), "drizzle");

async function verbinden(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (url && url.startsWith("postgres")) {
    const { default: postgres } = await import("postgres");
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    const client = postgres(url, { max: 10 });
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: migrationsOrdner });
    return db as unknown as Db;
  }
  const ziel = url === "memory://" ? undefined : path.join(datenOrdner(), "db");
  if (ziel) fs.mkdirSync(ziel, { recursive: true });
  const pglite = new PGlite(ziel);
  g.__nexovaDb!.pglite = pglite;
  const db = drizzlePglite(pglite, { schema });
  await migratePglite(db, { migrationsFolder: migrationsOrdner });
  return db;
}

export function getDb(): Promise<Db> {
  g.__nexovaDb!.db ??= verbinden();
  return g.__nexovaDb!.db;
}

/** Nur für die eingebaute Datenbank: Rohzugriff für Backup und Probe-Rücksicherung. */
export async function eingebauteDb(): Promise<PGlite | undefined> {
  await getDb();
  return g.__nexovaDb!.pglite;
}

export { schema };
