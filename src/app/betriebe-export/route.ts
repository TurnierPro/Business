import { asc } from "drizzle-orm";
import { aktuellerBenutzer } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";

// Alle Betriebe als CSV (Excel-tauglich: Semikolon, UTF-8 mit BOM). Daten gehören euch, nicht dem System.
export async function GET() {
  const b = await aktuellerBenutzer();
  if (!b) return new Response("Nicht angemeldet", { status: 401 });
  const db = await getDb();
  const liste = await db.select().from(schema.betriebe).orderBy(asc(schema.betriebe.name));
  const zelle = (v: unknown) => {
    const t = v instanceof Date ? v.toLocaleDateString("de-DE") : Array.isArray(v) ? v.join(", ") : String(v ?? "");
    return /[";\n]/.test(t) || /^[=+\-@]/.test(t) ? `"${t.replace(/^([=+\-@])/, "'$1").replace(/"/g, '""')}"` : t;
  };
  const spalten = ["name", "gewerk", "status", "inhaber", "strasse", "plz", "ort", "telefon", "email", "website", "mitarbeiter", "zustaendig", "tags", "quelle", "datenquelle", "erstelltAm"] as const;
  const csv = [spalten.join(";"), ...liste.map((x) => spalten.map((s) => zelle(x[s])).join(";"))].join("\r\n");
  return new Response("﻿" + csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="betriebe-${new Date().toISOString().slice(0, 10)}.csv"` } });
}
