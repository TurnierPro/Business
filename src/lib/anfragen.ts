import fs from "node:fs";
import path from "node:path";
import { getDb, schema } from "./db";
import { datenOrdner } from "./pfade";
import { clientIp, erlaubt, GRENZEN, pruefeDatei, versuchMerken } from "./sicherheit";

// Anfragen über das Formular einer Kunden-Website. Gespeichert und im Kundenportal sichtbar; Demos speichern nichts.

type Seite = typeof schema.seiten.$inferSelect;

export async function anfrageAnnehmen(req: Request, seite: Seite, weiter: string): Promise<Response> {
  const danke = new Response(null, { status: 303, headers: { Location: weiter } });
  if (seite.art !== "kunde" || !seite.betriebId) return danke;
  // Gegen Spam und Überflutung: höchstens 10 Anfragen je Netz und Stunde
  const ip = clientIp(req.headers);
  if (!(await erlaubt("formular", `anfrage:${ip}`, GRENZEN.formularJeIp))) return new Response("Zu viele Anfragen. Bitte später erneut versuchen oder anrufen.", { status: 429, headers: { "Content-Type": "text/plain; charset=utf-8", "Retry-After": "3600" } });
  await versuchMerken("formular", `anfrage:${ip}`);
  const f = await req.formData().catch(() => null);
  if (!f) return new Response("Ungültige Anfrage", { status: 400 });
  if (String(f.get("webseite") ?? "")) return danke; // Spam-Falle
  const feld = (k: string, max: number) => String(f.get(k) ?? "").trim().slice(0, max);
  const name = feld("name", 120);
  const kontakt = [feld("telefon", 40), feld("email", 160)].filter(Boolean).join(" · ");
  const nachricht = feld("nachricht", 5000);
  if (!name || !kontakt || !nachricht) return new Response("Bitte Name, Telefon und Nachricht angeben.", { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  const dateien: string[] = [];
  const ordner = datenOrdner("anfragen", seite.slug);
  for (const d of f.getAll("fotos").filter((x): x is File => x instanceof File && x.size > 0).slice(0, 5)) {
    const geprueft = await pruefeDatei(d, ["bild"], 10).catch(() => null);
    if (!geprueft) continue;
    const ziel = `${Date.now()}-${dateien.length + 1}.${geprueft.endung}`;
    fs.writeFileSync(path.join(ordner, ziel), geprueft.daten);
    dateien.push(ziel);
  }
  const db = await getDb();
  await db.insert(schema.anfragen).values({ betriebId: seite.betriebId, seitenSlug: seite.slug, name, kontakt, nachricht, dateien });
  return danke;
}
