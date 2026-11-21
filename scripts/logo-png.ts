import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

// Rastert die Original-Logodatei für E-Mails (Gmail zeigt kein SVG). Aufruf: npx tsx scripts/logo-png.ts
async function main() {
  const svg = fs.readFileSync(path.join("brand", "logos", "levarex-lockup-quadrat-ohne-consulting-hell.svg"), "utf8");
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
  const p = await b.newPage({ viewport: { width: 432, height: 52 }, deviceScaleFactor: 2 });
  await p.setContent(`<html><body style="margin:0;background:transparent">${svg.replace("<svg ", '<svg width="432" height="52" ')}</body></html>`);
  fs.mkdirSync(path.join("public", "marke"), { recursive: true });
  await p.screenshot({ path: path.join("public", "marke", "levarex-logo-mail.png"), omitBackground: true, clip: { x: 0, y: 0, width: 432, height: 52 } });
  await b.close();
  console.log("public/marke/levarex-logo-mail.png");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
