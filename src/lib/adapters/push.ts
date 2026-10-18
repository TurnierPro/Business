import { getDb, schema } from "../db";

// Meldung speichern und, wenn ntfy eingerichtet ist, aufs Handy schicken.
export async function melde(art: string, ok: boolean, titel: string, detail?: string): Promise<void> {
  let gepusht = false;
  if (process.env.NTFY_URL) {
    try {
      await fetch(process.env.NTFY_URL, {
        method: "POST",
        headers: { Title: `Stelax OS: ${titel}`, Priority: ok ? "default" : "high", Tags: ok ? "white_check_mark" : "warning" },
        body: detail ?? titel,
      });
      gepusht = true;
    } catch {
      gepusht = false;
    }
  }
  const db = await getDb();
  await db.insert(schema.meldungen).values({ art, ok, titel, detail, gepusht });
}
