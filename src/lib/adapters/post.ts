import fs from "node:fs";
import path from "node:path";
import { getDb, schema } from "../db";
import { datenOrdner } from "../pfade";

// Briefdienst. Der Simulator legt das PDF in data/post ab.
// Echter Anbieter: hier die API des gewählten Briefdienstes einsetzen (Modul 7).

export async function sendeBrief(b: { an: string; betreff: string; pdf: Buffer; dateiname: string }): Promise<string> {
  if (!process.env.BRIEFDIENST_API_KEY) {
    const ziel = path.join(datenOrdner("post"), b.dateiname);
    fs.writeFileSync(ziel, b.pdf);
    const db = await getDb();
    await db.insert(schema.simulatorPost).values({ kanal: "brief", an: b.an, betreff: b.betreff, text: `PDF: ${ziel}`, anhaenge: [b.dateiname] });
    return "Simulator: Brief in data/post abgelegt";
  }
  throw new Error("Briefdienst ist noch nicht angebunden. Adapter in src/lib/adapters/post.ts ergänzen.");
}
