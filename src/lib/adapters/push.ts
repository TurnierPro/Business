import { getDb, schema } from "../db";

// Meldung speichern und, wenn ntfy eingerichtet ist, aufs Handy schicken (nur Titel und kurzer Hinweis, keine Kundendaten wie Inhalte oder Kontodaten).
export async function melde(art: string, ok: boolean, titel: string, detail?: string): Promise<void> {
  let gepusht = false;
  if (process.env.NTFY_URL) {
    try {
      await fetch(process.env.NTFY_URL, {
        method: "POST",
        // Mit NTFY_TOKEN (Zugangsschlüssel des eigenen ntfy-Servers) kann nur, wer den Schlüssel hat, in das Thema schreiben und lesen
        headers: { Title: `Levarex OS: ${titel}`, Priority: ok ? "default" : "high", Tags: ok ? "white_check_mark" : "warning", ...(process.env.NTFY_TOKEN ? { Authorization: `Bearer ${process.env.NTFY_TOKEN}` } : {}) },
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

/** Gibt zurück, ob ntfy die Testnachricht angenommen hat (für den Knopf „Push testen“). */
export async function pushTesten(): Promise<string> {
  if (!process.env.NTFY_URL) throw new Error("NTFY_URL ist in Coolify noch nicht gesetzt.");
  const res = await fetch(process.env.NTFY_URL, {
    method: "POST",
    headers: { Title: "Levarex OS: Test", Tags: "white_check_mark", ...(process.env.NTFY_TOKEN ? { Authorization: `Bearer ${process.env.NTFY_TOKEN}` } : {}) },
    body: "Push aufs Handy funktioniert.",
  });
  if (!res.ok) throw new Error(`ntfy antwortet ${res.status}${res.status === 401 || res.status === 403 ? ": Zugangsschlüssel (NTFY_TOKEN) fehlt oder stimmt nicht" : ""}.`);
  return "Testnachricht verschickt. Sie sollte jetzt auf dem Handy erscheinen.";
}
