import path from "node:path";
import fs from "node:fs";

export function datenOrdner(...teile: string[]): string {
  const basis = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
  const ziel = path.join(basis, ...teile);
  fs.mkdirSync(teile.length && path.extname(ziel) ? path.dirname(ziel) : ziel, { recursive: true });
  return ziel;
}
