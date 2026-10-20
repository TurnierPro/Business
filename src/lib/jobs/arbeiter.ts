import { naechsterJob } from "./warteschlange";
import { zeitplanPruefen } from "./zeitplan";
import { HANDLER } from "./handler";

const g = globalThis as unknown as { __nexovaArbeiter?: boolean };

/** Startet die Hintergrund-Abarbeitung einmal pro Serverprozess. */
export function starteArbeiter(): void {
  if (g.__nexovaArbeiter || process.env.NEXOVA_ARBEITER === "aus") return;
  g.__nexovaArbeiter = true;
  let laeuft = false;
  setInterval(async () => {
    if (laeuft) return;
    laeuft = true;
    try {
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
