import { naechsterJob } from "./warteschlange";
import { zeitplanPruefen } from "./zeitplan";
import { HANDLER } from "./handler";

const g = globalThis as unknown as { __stelaxArbeiter?: boolean };

/** Startet die Hintergrund-Abarbeitung einmal pro Serverprozess. */
export function starteArbeiter(): void {
  if (g.__stelaxArbeiter || process.env.STELAX_ARBEITER === "aus") return;
  g.__stelaxArbeiter = true;
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
  console.log("Stelax OS: Hintergrund-Arbeiter gestartet");
}
