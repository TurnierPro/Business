// Testdaten vor dem Start aufräumen: alle Betriebe mit „(TEST)“ im Namen und alles, was an ihnen hängt
// (Angebote, Rechnungen, Verträge, Dateien, Demo-Seiten, Freigaben, Aufgaben, Protokolleinträge),
// dazu Test-Ausgaben („TEST“ im Lieferanten oder in der Beschreibung), interne Testmails, alle Meldungen unter System
// (Fehler, Hinweise, Tagesberichte aus der Testzeit) und fehlgeschlagene Hintergrund-Jobs.
// Echte Betriebe werden nie angefasst. Ohne --wirklich wird nur angezeigt, was gelöscht würde.
// Aufruf im App-Container (Coolify → app → Terminal):
//   npx tsx scripts/testdaten-loeschen.ts             (nur anzeigen)
//   npx tsx scripts/testdaten-loeschen.ts --wirklich  (löschen)
// Vorher ein Backup machen (läuft jede Nacht; sonst unter System → Backup).
export {};
const fs = await import("node:fs");
const path = await import("node:path");
const { and, eq, ilike, inArray, isNull, or, sql } = await import("drizzle-orm");
const { getDb, schema } = await import("../src/lib/db");
const { datenOrdner } = await import("../src/lib/pfade");
const { protokolliere } = await import("../src/lib/protokoll");

const wirklich = process.argv.includes("--wirklich");
const db = await getDb();

const betriebe = await db.select({ id: schema.betriebe.id, name: schema.betriebe.name }).from(schema.betriebe).where(ilike(schema.betriebe.name, "%(TEST)%"));
const ids = betriebe.map((b) => b.id);
const ausgaben = await db.select({ id: schema.ausgaben.id, lieferant: schema.ausgaben.lieferant, belegPfad: schema.ausgaben.belegPfad }).from(schema.ausgaben).where(or(ilike(schema.ausgaben.lieferant, "%TEST%"), ilike(schema.ausgaben.beschreibung, "%TEST%")));
const testmails = await db.select({ id: schema.postausgang.id }).from(schema.postausgang).where(and(isNull(schema.postausgang.betriebId), eq(schema.postausgang.zweck, "testmail")));
const [{ n: meldungen }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.meldungen);
const [{ n: fehlJobs }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.jobs).where(eq(schema.jobs.status, "fehler"));
const rechnungen = ids.length ? await db.select({ nummer: schema.rechnungen.nummer }).from(schema.rechnungen).where(inArray(schema.rechnungen.betriebId, ids)) : [];

console.log(`Betriebe mit „(TEST)“: ${betriebe.length}${betriebe.length ? `\n  ${betriebe.map((b) => `#${b.id} ${b.name}`).join("\n  ")}` : ""}`);
console.log(`Rechnungen dieser Betriebe: ${rechnungen.map((r) => r.nummer).join(", ") || "keine"}`);
console.log(`Test-Ausgaben: ${ausgaben.length}${ausgaben.length ? ` (${ausgaben.map((a) => a.lieferant).join(", ")})` : ""}`);
console.log(`Interne Testmails: ${testmails.length}`);
console.log(`Meldungen unter System: ${meldungen}`);
console.log(`Fehlgeschlagene Hintergrund-Jobs: ${fehlJobs}`);

if (!wirklich) {
  console.log("\nNur angezeigt, nichts gelöscht. Zum Löschen: npx tsx scripts/testdaten-loeschen.ts --wirklich");
  process.exit(0);
}

const loeschenOrdner = (...teile: string[]) => fs.rmSync(path.join(datenOrdner(), ...teile), { recursive: true, force: true });
if (ids.length) {
  // Dateien auf der Platte: Demo-Seiten, Uploads, Kundendateien, Beitragsbilder, archivierte PDFs
  const { loescheSeite } = await import("../src/lib/sites/generator");
  for (const s of await db.select().from(schema.seiten).where(inArray(schema.seiten.betriebId, ids))) {
    loescheSeite(s.slug);
    loeschenOrdner("anfragen", s.slug);
  }
  for (const p of await db.select({ id: schema.projekte.id }).from(schema.projekte).where(inArray(schema.projekte.betriebId, ids))) {
    loeschenOrdner("uploads", `projekt-${p.id}`);
    loeschenOrdner("umzug", `projekt-${p.id}`);
  }
  for (const d of await db.select({ archivPfad: schema.dokumente.archivPfad }).from(schema.dokumente).where(inArray(schema.dokumente.betriebId, ids))) if (d.archivPfad) fs.rmSync(d.archivPfad, { force: true });
  for (const id of ids) {
    await (await import("../src/lib/demos")).demoDateienLoeschen(id);
    (await import("../src/lib/beitraege")).beitragsbilderLoeschen(id);
    (await import("../src/lib/dateien")).dateienLoeschenAlle(id);
  }
  // Datenbank: Tabellen ohne automatisches Mitlöschen zuerst, dann die Betriebe (der Rest hängt per Fremdschlüssel daran)
  await db.delete(schema.rechnungen).where(inArray(schema.rechnungen.betriebId, ids));
  await db.delete(schema.projekte).where(inArray(schema.projekte.betriebId, ids));
  await db.delete(schema.postausgang).where(inArray(schema.postausgang.betriebId, ids));
  await db.delete(schema.betriebe).where(inArray(schema.betriebe.id, ids));
  await db.delete(schema.protokoll).where(inArray(schema.protokoll.betriebId, ids));
}
for (const a of ausgaben) if (a.belegPfad) fs.rmSync(a.belegPfad, { force: true });
if (ausgaben.length) await db.delete(schema.ausgaben).where(inArray(schema.ausgaben.id, ausgaben.map((a) => a.id)));
if (testmails.length) await db.delete(schema.postausgang).where(inArray(schema.postausgang.id, testmails.map((t) => t.id)));
await db.delete(schema.meldungen);
await db.delete(schema.jobs).where(eq(schema.jobs.status, "fehler"));
await protokolliere("Aufräumen (Server-Terminal)", `Testdaten gelöscht: ${betriebe.length} Betriebe, ${rechnungen.length} Rechnungen, ${ausgaben.length} Ausgaben, ${testmails.length} Testmails, ${meldungen} Meldungen, ${fehlJobs} fehlgeschlagene Jobs`, null);
console.log("\nFertig. Testdaten gelöscht.");
process.exit(0);
