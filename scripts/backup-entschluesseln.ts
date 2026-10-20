// Notfall: verschlüsseltes Backup von der Storage Box wieder lesbar machen.
// Aufruf: BACKUP_SCHLUESSEL=… npx tsx scripts/backup-entschluesseln.ts nexova-2027-01-15-02-00.tar.gz.enc
import fs from "node:fs";
import { entschluesseleBackup } from "../src/lib/ablauf/betrieb";

const datei = process.argv[2];
if (!datei || !process.env.BACKUP_SCHLUESSEL) {
  console.error("Aufruf: BACKUP_SCHLUESSEL=… npx tsx scripts/backup-entschluesseln.ts <datei.enc>");
  process.exit(1);
}
const ziel = datei.replace(/\.enc$/, "");
fs.writeFileSync(ziel, entschluesseleBackup(fs.readFileSync(datei), process.env.BACKUP_SCHLUESSEL));
console.log(`Entschlüsselt: ${ziel}`);
