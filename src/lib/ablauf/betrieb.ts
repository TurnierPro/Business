import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { and, eq, gte, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { PGlite } from "@electric-sql/pglite";
import { getDb, eingebauteDb, schema } from "../db";
import { datenOrdner } from "../pfade";
import { melde } from "../adapters/push";
import { protokolliere } from "../protokoll";
import { ANGEBOT_LOESCHEN_TAGE, frist } from "../recht";
import { alteVersucheLoeschen, sicheresFetch } from "../sicherheit";
import { loescheSeite } from "../sites/generator";
import { SYSTEM } from "./gemeinsam";

// Betrieb des Systems: Backups, Probe-Rücksicherung, Erreichbarkeit, Aufräumen, Tagesbericht.

const run = promisify(execFile);
const AUFBEWAHRUNG_TAGE = 30;

function backupOrdner() {
  return datenOrdner("backups");
}

/** Format: „NXV1“ | Salz (16) | IV (12) | Tag (16) | Daten. Schlüssel aus Passphrase per scrypt. */
export function verschluesseleBackup(daten: Buffer, passphrase: string): Buffer {
  const salz = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", crypto.scryptSync(passphrase, salz, 32), iv);
  const inhalt = Buffer.concat([c.update(daten), c.final()]);
  return Buffer.concat([Buffer.from("NXV1"), salz, iv, c.getAuthTag(), inhalt]);
}

export function entschluesseleBackup(daten: Buffer, passphrase: string): Buffer {
  if (daten.subarray(0, 4).toString() !== "NXV1") throw new Error("Keine Nexova-Backup-Datei");
  const salz = daten.subarray(4, 20), iv = daten.subarray(20, 32), tag = daten.subarray(32, 48);
  const d = crypto.createDecipheriv("aes-256-gcm", crypto.scryptSync(passphrase, salz, 32), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(daten.subarray(48)), d.final()]);
}

export async function backup(): Promise<string> {
  const stempel = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 16);
  let datei: string;
  const pg = await eingebauteDb();
  if (pg) {
    const dump = await pg.dumpDataDir("gzip");
    datei = path.join(backupOrdner(), `nexova-${stempel}.tar.gz`);
    fs.writeFileSync(datei, Buffer.from(await dump.arrayBuffer()));
  } else {
    datei = path.join(backupOrdner(), `nexova-${stempel}.dump`);
    await run("pg_dump", ["--format=custom", `--file=${datei}`, process.env.DATABASE_URL!]);
  }
  // Alte Backups löschen
  for (const f of fs.readdirSync(backupOrdner())) {
    const voll = path.join(backupOrdner(), f);
    if (Date.now() - fs.statSync(voll).mtimeMs > AUFBEWAHRUNG_TAGE * 864e5) fs.rmSync(voll);
  }
  // Kopie außerhalb des Servers (Hetzner Storage Box), nur verschlüsselt (AES-256-GCM, Schlüssel nur im Passwortmanager und in Coolify)
  let extern = "nur lokal (BACKUP_ZIEL fehlt)";
  if (process.env.BACKUP_ZIEL) {
    if (!process.env.BACKUP_SCHLUESSEL || process.env.BACKUP_SCHLUESSEL.length < 32) throw new Error("BACKUP_SCHLUESSEL fehlt (mindestens 32 Zeichen). Ohne Verschlüsselung verlässt kein Backup den Server.");
    const ausgang = datenOrdner("backup-extern");
    fs.writeFileSync(path.join(ausgang, `${path.basename(datei)}.enc`), verschluesseleBackup(fs.readFileSync(datei), process.env.BACKUP_SCHLUESSEL));
    for (const f of fs.readdirSync(ausgang)) if (!fs.existsSync(path.join(backupOrdner(), f.replace(/\.enc$/, "")))) fs.rmSync(path.join(ausgang, f));
    await run("rsync", ["-a", "--delete", "-e", "ssh -p 23", `${ausgang}/`, process.env.BACKUP_ZIEL]);
    extern = "verschlüsselt auf Storage Box kopiert";
  }
  const kb = Math.round(fs.statSync(datei).size / 1024);
  await melde("backup", !!process.env.BACKUP_ZIEL || process.env.NODE_ENV !== "production", process.env.BACKUP_ZIEL ? "Backup erstellt" : "Backup erstellt, nur lokal", `${path.basename(datei)}, ${kb} KB, ${extern}`);
  return `${path.basename(datei)} (${kb} KB, ${extern})`;
}

/** Spielt das neueste Backup in eine leere Datenbank ein und zählt nach. */
export async function ruecksicherung(): Promise<string> {
  const dateien = fs.readdirSync(backupOrdner()).filter((f) => f.startsWith("nexova-")).sort();
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
    const umzug = p.umzug as { domain?: string; status?: string };
    if (umzug.domain && umzug.status !== "umgestellt") continue; // Domain zeigt noch auf den alten Anbieter
    if (p.domain && process.env.NODE_ENV === "production") {
      try {
        const res = await sicheresFetch(`https://${p.domain}`);
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

const vor = (tage: number) => new Date(Date.now() - tage * 864e5);

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
  // Angebote ohne Auftrag nach einem Jahr löschen (Löschkonzept). Nur ohne Rechnungen.
  const jahr = new Date(Date.now() - ANGEBOT_LOESCHEN_TAGE * 864e5);
  const ohneAuftrag = await db.select({ id: schema.betriebe.id }).from(schema.betriebe).where(and(eq(schema.betriebe.status, "angebot"), lt(schema.betriebe.letzteAktivitaet, jahr)));
  let angebote = 0;
  for (const { id } of ohneAuftrag) {
    const [r] = await db.select({ id: schema.rechnungen.id }).from(schema.rechnungen).where(eq(schema.rechnungen.betriebId, id)).limit(1);
    if (r) continue;
    for (const s of await db.select().from(schema.seiten).where(eq(schema.seiten.betriebId, id))) loescheSeite(s.slug);
    await db.delete(schema.betriebe).where(eq(schema.betriebe.id, id));
    angebote++;
  }
  // Anfragen über Kunden-Websites nach 12 Monaten löschen (Annahme, im AVV festlegen)
  const anfragen = await db.delete(schema.anfragen).where(lt(schema.anfragen.am, vor(frist("Anfragen über Kunden-Websites")))).returning({ id: schema.anfragen.id });
  // Gesprächsaufnahmen spätestens nach 30 Tagen, auch wenn das Protokoll nie verschickt wurde
  for (const t of await db.select().from(schema.termine).where(and(isNotNull(schema.termine.audioPfad), lt(schema.termine.erstelltAm, vor(frist("Gesprächsaufnahmen")))))) {
    fs.rmSync(t.audioPfad!, { force: true });
    await db.update(schema.termine).set({ audioPfad: null, audioGeloeschtAm: jetzt }).where(eq(schema.termine.id, t.id));
  }
  // Sicherungen alter Websites aus dem Umzug
  const umzugOrdner = datenOrdner("umzug");
  for (const o of fs.readdirSync(umzugOrdner)) {
    const voll = path.join(umzugOrdner, o);
    if (fs.statSync(voll).mtime < vor(frist("Sicherung alter Kunden-Websites (Umzug)"))) fs.rmSync(voll, { recursive: true, force: true });
  }
  await db.delete(schema.nachrichten).where(and(isNull(schema.nachrichten.betriebId), lt(schema.nachrichten.zeit, vor(frist("Nachrichten ohne Zuordnung")))));
  await db.delete(schema.simulatorPost).where(lt(schema.simulatorPost.am, vor(frist("Simulator-Postfach"))));
  await db.delete(schema.meldungen).where(lt(schema.meldungen.am, vor(frist("Systemmeldungen"))));
  await db.delete(schema.jobs).where(and(eq(schema.jobs.status, "fertig"), lt(schema.jobs.erstelltAm, vor(frist("Erledigte Hintergrund-Jobs")))));
  await db.delete(schema.protokoll).where(lt(schema.protokoll.am, vor(frist("Änderungsprotokoll"))));
  await alteVersucheLoeschen(frist("Anmelde-Fehlversuche (IP gekürzt)"));
  if (alt.length || leads.length || angebote || anfragen.length) await protokolliere(SYSTEM, "Aufgeräumt", null, `${alt.length} Demos, ${leads.length} Leads, ${angebote} Angebote ohne Auftrag, ${anfragen.length} alte Anfragen gelöscht`);
  return `${alt.length} Demos, ${leads.length} Leads, ${angebote} Angebote, ${anfragen.length} Anfragen gelöscht`;
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
