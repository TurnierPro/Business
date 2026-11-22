import zlib from "node:zlib";

// Kleiner ZIP-Leser ohne Fremdpaket (Node bringt zlib mit). Liest das zentrale Verzeichnis und entpackt
// „gespeichert“ (0) und „deflate“ (8). Grenzen gegen Zip-Bomben: Anzahl, Einzelgröße und Gesamtgröße.

export type ZipEintrag = { name: string; daten: Buffer };

export function zipLesen(zip: Buffer, o: { maxDateien: number; maxDateiMb: number; maxGesamtMb: number }): ZipEintrag[] {
  // Ende des zentralen Verzeichnisses suchen (Signatur 0x06054b50), höchstens 64 KB Kommentar
  let ende = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 65535); i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) { ende = i; break; }
  }
  if (ende < 0) throw new Error("Keine gültige ZIP-Datei.");
  const anzahl = zip.readUInt16LE(ende + 10);
  let pos = zip.readUInt32LE(ende + 16);
  if (anzahl > o.maxDateien) throw new Error(`Zu viele Dateien im ZIP (höchstens ${o.maxDateien}).`);
  const eintraege: ZipEintrag[] = [];
  let gesamt = 0;
  for (let n = 0; n < anzahl; n++) {
    if (pos + 46 > zip.length || zip.readUInt32LE(pos) !== 0x02014b50) throw new Error("ZIP-Verzeichnis beschädigt.");
    const flags = zip.readUInt16LE(pos + 8);
    const methode = zip.readUInt16LE(pos + 10);
    const gepackt = zip.readUInt32LE(pos + 20);
    const groesse = zip.readUInt32LE(pos + 24);
    const nameLen = zip.readUInt16LE(pos + 28);
    const extraLen = zip.readUInt16LE(pos + 30);
    const kommentarLen = zip.readUInt16LE(pos + 32);
    const lokal = zip.readUInt32LE(pos + 42);
    const name = zip.subarray(pos + 46, pos + 46 + nameLen).toString(flags & 0x800 ? "utf8" : "latin1");
    pos += 46 + nameLen + extraLen + kommentarLen;
    if (name.endsWith("/")) continue; // Ordner
    if (flags & 0x1) throw new Error("Verschlüsselte ZIP-Dateien werden nicht unterstützt.");
    if (groesse > o.maxDateiMb * 1024 * 1024) throw new Error(`${name}: zu groß (höchstens ${o.maxDateiMb} MB je Datei).`);
    gesamt += groesse;
    if (gesamt > o.maxGesamtMb * 1024 * 1024) throw new Error(`Inhalt zu groß (höchstens ${o.maxGesamtMb} MB entpackt).`);
    if (lokal + 30 > zip.length || zip.readUInt32LE(lokal) !== 0x04034b50) throw new Error("ZIP-Eintrag beschädigt.");
    const start = lokal + 30 + zip.readUInt16LE(lokal + 26) + zip.readUInt16LE(lokal + 28);
    const roh = zip.subarray(start, start + gepackt);
    let daten: Buffer;
    if (methode === 0) daten = Buffer.from(roh);
    else if (methode === 8) daten = zlib.inflateRawSync(roh, { maxOutputLength: o.maxDateiMb * 1024 * 1024 + 1 });
    else throw new Error(`${name}: Packverfahren ${methode} wird nicht unterstützt.`);
    if (daten.length !== groesse) throw new Error(`${name}: Größe stimmt nicht (ZIP beschädigt).`);
    eintraege.push({ name, daten });
  }
  return eintraege;
}

/** Minimaler ZIP-Schreiber (nur „gespeichert“), z. B. für Tests und Exporte. */
export function zipSchreiben(dateien: { name: string; daten: Buffer }[]): Buffer {
  const teile: Buffer[] = [];
  const verzeichnis: Buffer[] = [];
  let pos = 0;
  for (const d of dateien) {
    const name = Buffer.from(d.name, "utf8");
    const crc = zlib.crc32(d.daten);
    const kopf = Buffer.alloc(30);
    kopf.writeUInt32LE(0x04034b50, 0); kopf.writeUInt16LE(20, 4); kopf.writeUInt16LE(0x800, 6); kopf.writeUInt16LE(0, 8);
    kopf.writeUInt32LE(crc, 14); kopf.writeUInt32LE(d.daten.length, 18); kopf.writeUInt32LE(d.daten.length, 22); kopf.writeUInt16LE(name.length, 26);
    const zentral = Buffer.alloc(46);
    zentral.writeUInt32LE(0x02014b50, 0); zentral.writeUInt16LE(20, 4); zentral.writeUInt16LE(20, 6); zentral.writeUInt16LE(0x800, 8); zentral.writeUInt16LE(0, 10);
    zentral.writeUInt32LE(crc, 16); zentral.writeUInt32LE(d.daten.length, 20); zentral.writeUInt32LE(d.daten.length, 24); zentral.writeUInt16LE(name.length, 28); zentral.writeUInt32LE(pos, 42);
    teile.push(kopf, name, d.daten);
    verzeichnis.push(zentral, name);
    pos += 30 + name.length + d.daten.length;
  }
  const vz = Buffer.concat(verzeichnis);
  const ende = Buffer.alloc(22);
  ende.writeUInt32LE(0x06054b50, 0); ende.writeUInt16LE(dateien.length, 8); ende.writeUInt16LE(dateien.length, 10); ende.writeUInt32LE(vz.length, 12); ende.writeUInt32LE(pos, 16);
  return Buffer.concat([...teile, vz, ende]);
}
