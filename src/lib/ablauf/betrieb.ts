import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { PGlite } from "@electric-sql/pglite";
import { getDb, eingebauteDb, schema } from "../db";
import { datenOrdner } from "../pfade";
import { melde } from "../adapters/push";
import { protokolliere } from "../protokoll";
import { loescheSeite } from "../sites/generator";
import { SYSTEM } from "./gemeinsam";

// Betrieb des Systems: Backups, Probe-Rücksicherung, Erreichbarkeit, Aufräumen, Tagesbericht.

const run = promisify(execFile);
const AUFBEWAHRUNG_TAGE = 30;

function backupOrdner() {
  return datenOrdner("backups");
}

export async function backup(): Promise<string> {
  const stempel = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 16);
  let datei: string;
  const pg = await eingebauteDb();
  if (pg) {
    const dump = await pg.dumpDataDir("gzip");
    datei = path.join(backupOrdner(), `stelax-${stempel}.tar.gz`);
    fs.writeFileSync(datei, Buffer.from(await dump.arrayBuffer()));
  } else {
    datei = path.join(backupOrdner(), `stelax-${stempel}.dump`);
    await run("pg_dump", ["--format=custom", `--file=${datei}`, process.env.DATABASE_URL!]);
  }
  // Alte Backups löschen
  for (const f of fs.readdirSync(backupOrdner())) {
    const voll = path.join(backupOrdner(), f);
    if (Date.now() - fs.statSync(voll).mtimeMs > AUFBEWAHRUNG_TAGE * 864e5) fs.rmSync(voll);
  }
  // Kopie außerhalb des Servers (Hetzner Storage Box), sobald eingerichtet
  let extern = "nur lokal (BACKUP_ZIEL fehlt)";
  if (process.env.BACKUP_ZIEL) {
    await run("rsync", ["-a", "-e", "ssh -p 23", `${backupOrdner()}/`, process.env.BACKUP_ZIEL]);
    extern = "auf Storage Box kopiert";
  }
  const kb = Math.round(fs.statSync(datei).size / 1024);
  await melde("backup", !!process.env.BACKUP_ZIEL || process.env.NODE_ENV !== "production", process.env.BACKUP_ZIEL ? "Backup erstellt" : "Backup erstellt, nur lokal", `${path.basename(datei)}, ${kb} KB, ${extern}`);
  return `${path.basename(datei)} (${kb} KB, ${extern})`;
}

/** Spielt das neueste Backup in eine leere Datenbank ein und zählt nach. */
export async function ruecksicherung(): Promise<string> {
  const dateien = fs.readdirSync(backupOrdner()).filter((f) => f.startsWith("stelax-")).sort();
  const neuestes = dateien.at(-1);
  if (!neuestes) {
    await melde("ruecksicherung", false, "Probe-Rücksicherung fehlgeschlagen", "Kein Backup gefunden.");
    throw new Error("Kein Backup vorhanden");
  }
  const db = await getDb();
  const [live] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.betriebe);
  let gezaehlt: number;
  if (neuestes.endsWith(".tar.gz")) {
    const blob = new Blob([fs.readFileSync(path.join(backupOrdner(), neuestes))]);
    const test = new PGlite({ loadDataDir: blob });
    const r = await test.query<{ n: number }>("select count(*)::int as n from betriebe");
    gezaehlt = r.rows[0].n;
    await test.close();
  } else {
    if (!process.env.RUECKSICHERUNG_DB_URL) throw new Error("RUECKSICHERUNG_DB_URL fehlt (leere Test-Datenbank)");
    await run("pg_restore", ["--clean", "--if-exists", "--no-owner", `--dbname=${process.env.RUECKSICHERUNG_DB_URL}`, path.join(backupOrdner(), neuestes)]);
    const { stdout } = await run("psql", [process.env.RUECKSICHERUNG_DB_URL, "-tAc", "select count(*) from betriebe"]);
    gezaehlt = Number(stdout.trim());
  }
  const ok = gezaehlt >= 0 && gezaehlt <= live.n;
  await melde("ruecksicherung", ok, ok ? "Probe-Rücksicherung OK" : "Probe-Rücksicherung auffällig", `${neuestes}: ${gezaehlt} Betriebe im Backup, ${live.n} aktuell.`);
  return `${neuestes}: ${gezaehlt} Betriebe wiederhergestellt`;
}

export async function erreichbarkeit(): Promise<string> {
  const db = await getDb();
  const live = await db.select().from(schema.projekte).where(eq(schema.projekte.status, "live"));
  const fehler: string[] = [];
  for (const p of live) {
    if (p.domain && process.env.NODE_ENV === "production") {
      try {
        const res = await fetch(`https://${p.domain}`, { signal: AbortSignal.timeout(10000) });
        if (!res.ok) fehler.push(`${p.domain}: HTTP ${res.status}`);
      } catch {
        fehler.push(`${p.domain}: nicht erreichbar`);
      }
    } else if (p.seitenSlug && !fs.existsSync(path.join(datenOrdner("sites"), p.seitenSlug, "index.html"))) {
      fehler.push(`${p.seitenSlug}: Dateien fehlen`);
    }
  }
  if (fehler.length) await melde("erreichbarkeit", false, `${fehler.length} Seite(n) nicht erreichbar`, fehler.join("\n"));
  return fehler.length ? fehler.join("; ") : `${live.length} Live-Seiten erreichbar`;
}

export async function aufraeumen(): Promise<string> {
  const db = await getDb();
  const jetzt = new Date();
  // Demos nach 60 Tagen löschen
  const alt = await db.select().from(schema.seiten).where(and(eq(schema.seiten.art, "demo"), lt(schema.seiten.loeschenAm, jetzt)));
  for (const s of alt) {
    loescheSeite(s.slug);
    await db.delete(schema.seiten).where(eq(schema.seiten.id, s.id));
  }
  // Leads ohne Reaktion nach 6 Monaten löschen (laut Business Case)
  const grenze = new Date(Date.now() - 182 * 864e5);
  const leads = await db
    .delete(schema.betriebe)
    .where(and(inArray(schema.betriebe.status, ["neu", "interessant", "nicht_interessant", "angeschrieben"]), lt(schema.betriebe.letzteAktivitaet, grenze)))
    .returning({ id: schema.betriebe.id });
  if (alt.length || leads.length) await protokolliere(SYSTEM, "Aufgeräumt", null, `${alt.length} Demos und ${leads.length} Leads gelöscht`);
  return `${alt.length} Demos, ${leads.length} Leads gelöscht`;
}

export async function tagesbericht(): Promise<string> {
  const db = await getDb();
  const seit = new Date(Date.now() - 864e5);
  const [freigaben] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.postausgang).where(eq(schema.postausgang.status, "zur_freigabe"));
  const [fehlerJobs] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.jobs).where(eq(schema.jobs.status, "fehler"));
  const [kosten] = await db.select({ s: sql<number>`coalesce(sum(${schema.kiNutzung.kostenMikroUsd}),0)::int` }).from(schema.kiNutzung).where(gte(schema.kiNutzung.am, seit));
  const meldungen = await db.select().from(schema.meldungen).where(and(gte(schema.meldungen.am, seit), eq(schema.meldungen.ok, false)));
  const ok = fehlerJobs.n === 0 && meldungen.length === 0;
  const text = [
    `${freigaben.n} Einträge warten auf Freigabe.`,
    `${fehlerJobs.n} fehlgeschlagene Jobs.`,
    `${meldungen.length} Warnungen in den letzten 24 Stunden.`,
    `KI-Kosten 24 h: ${(kosten.s / 1_000_000).toFixed(2)} USD.`,
  ].join("\n");
  await melde("tagesbericht", ok, ok ? "Tagesbericht: alles läuft" : "Tagesbericht: bitte prüfen", text);
  return text;
}
