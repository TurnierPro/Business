import { naechsterJob } from "./warteschlange";
import { zeitplanPruefen } from "./zeitplan";
import { HANDLER } from "./handler";

const g = globalThis as unknown as { __nexovaArbeiter?: boolean };

/** Startet die Hintergrund-Abarbeitung einmal pro Serverprozess. */
export function starteArbeiter(): void {
  if (g.__nexovaArbeiter || process.env.NEXOVA_ARBEITER === "aus") return;
  g.__nexovaArbeiter = true;
  let laeuft = false;
  let katalogAm = 0;
  setInterval(async () => {
    if (laeuft) return;
    laeuft = true;
    try {
      // Stammdaten (Preise, Pakete) höchstens alle 30 Sekunden neu laden
      if (Date.now() - katalogAm > 30_000) {
        await (await import("../katalog-db")).katalogLaden();
        katalogAm = Date.now();
      }
      while (await naechsterJob(HANDLER)) {}
    } catch (e) {
      console.error("[arbeiter]", e);
    } finally {
      laeuft = false;
    }
  }, 2000);
  setInterval(() => zeitplanPruefen().catch((e) => console.error("[zeitplan]", e)), 60_000);
  console.log("Nexova OS: Hintergrund-Arbeiter gestartet");
}
