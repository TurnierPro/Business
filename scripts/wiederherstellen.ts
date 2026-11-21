// Notfall: Levarex OS aus der Sicherung bei IONOS wiederherstellen (Runbook in docs/runbook-wiederherstellen.md).
// Holt die neueste Sicherung (Datenbank und Dateien), entschlüsselt sie und spielt sie ein.
// Aufruf im App-Container: npx tsx scripts/wiederherstellen.ts            → zeigt nur, was es tun würde
//                         npx tsx scripts/wiederherstellen.ts --wirklich  → spielt ein (Datenbank muss leer sein)
// Braucht: S3_* und BACKUP_SCHLUESSEL (aus Bitwarden), DATABASE_URL, DATA_DIR.
export {};
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const { auflisten, herunterladen } = await import("../src/lib/adapters/objektspeicher");
const { entschluesseleBackup } = await import("../src/lib/ablauf/betrieb");

const schluessel = process.env.BACKUP_SCHLUESSEL;
if (!schluessel) {
  console.error("BACKUP_SCHLUESSEL fehlt (steht in Bitwarden unter „Levarex Backup-Schlüssel“).");
  process.exit(1);
}
const wirklich = process.argv.includes("--wirklich");
const start = Date.now();
const alle = (await auflisten()).filter((o) => o.name.endsWith(".enc")).sort((a, b) => a.name.localeCompare(b.name));
const db = alle.filter((o) => !o.name.startsWith("levarex-dateien-") && !o.name.startsWith("levarex-n8n-")).at(-1);
const n8n = alle.filter((o) => o.name.startsWith("levarex-n8n-")).at(-1);
const dateien = alle.filter((o) => o.name.startsWith("levarex-dateien-")).at(-1);
if (!db) {
  console.error("Keine Sicherung im Objektspeicher gefunden.");
  process.exit(1);
}
console.log(`Neueste Sicherung: ${db.name} (${Math.round(db.groesse / 1024)} KB, ${db.am.toISOString()})`);
console.log(`Dateien: ${dateien ? `${dateien.name} (${Math.round(dateien.groesse / 1024)} KB)` : "keine gefunden"}`);
console.log(`n8n: ${n8n ? n8n.name : "keine gefunden"}`);
if (!wirklich) {
  console.log("Probelauf. Zum Einspielen: --wirklich anhängen.");
  process.exit(0);
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "levarex-wiederherstellen-"));
const dbDatei = path.join(tmp, db.name.replace(/\.enc$/, ""));
fs.writeFileSync(dbDatei, entschluesseleBackup(await herunterladen(db.name), schluessel));
const daten = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
if (dbDatei.endsWith(".dump")) {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL fehlt");
  execFileSync("pg_restore", ["--no-owner", "--clean", "--if-exists", `--dbname=${process.env.DATABASE_URL}`, dbDatei], { stdio: "inherit" });
} else {
  // Eingebaute Datenbank (PGlite): Datenverzeichnis ersetzen
  fs.rmSync(path.join(daten, "db"), { recursive: true, force: true });
  fs.mkdirSync(path.join(daten, "db"), { recursive: true });
  execFileSync("tar", ["-xzf", dbDatei, "-C", path.join(daten, "db")], { stdio: "inherit" });
}
if (dateien) {
  const archiv = path.join(tmp, dateien.name.replace(/\.enc$/, ""));
  fs.writeFileSync(archiv, entschluesseleBackup(await herunterladen(dateien.name), schluessel));
  execFileSync("tar", ["-xzf", archiv, "-C", daten], { stdio: "inherit" });
}
if (n8n && process.env.N8N_DATEN) {
  // n8n vorher stoppen: docker compose stop n8n
  const archiv = path.join(tmp, n8n.name.replace(/\.enc$/, ""));
  fs.writeFileSync(archiv, entschluesseleBackup(await herunterladen(n8n.name), schluessel));
  execFileSync("tar", ["-xzf", archiv, "-C", process.env.N8N_DATEN], { stdio: "inherit" });
  console.log("n8n-Abläufe eingespielt. Gleichen N8N_ENCRYPTION_KEY aus Bitwarden verwenden, sonst sind die Zugangsdaten in n8n unlesbar.");
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`Fertig in ${Math.round((Date.now() - start) / 1000)} Sekunden. Jetzt App neu starten und unter /system die Probe-Rücksicherung ansehen.`);
