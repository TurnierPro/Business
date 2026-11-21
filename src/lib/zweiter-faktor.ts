import { eq } from "drizzle-orm";
import { getDb, schema } from "./db";
import { entschluessele } from "./geheim";
import { pruefeMitSchritt } from "./totp";
import { TECHNIK } from "./ablauf/crm";
import { protokolliere } from "./protokoll";

/**
 * Zweiter Faktor für heikle Schritte (Livegang, Benutzer und Rollen, API-Schlüssel, Webhooks):
 * frischer Code aus der Authenticator-App, jeder Code nur einmal (Schutz gegen Wiederverwenden).
 */
export async function zweiterFaktor(wer: string, code: string): Promise<void> {
  const db = await getDb();
  const [b] = await db.select().from(schema.benutzer).where(eq(schema.benutzer.name, wer));
  if (!b?.totpAktiv || !b.totpGeheim) throw new Error("Dafür brauchst du die Anmeldung mit Authenticator-App (Einstellungen → Zwei-Faktor).");
  const schritt = pruefeMitSchritt(entschluessele(b.totpGeheim), code ?? "");
  if (schritt === null || (b.totpLetzterSchritt !== null && schritt <= b.totpLetzterSchritt)) throw new Error("Code falsch oder schon benutzt. Bitte den nächsten Code eingeben.");
  await db.update(schema.benutzer).set({ totpLetzterSchritt: schritt }).where(eq(schema.benutzer.id, b.id));
}

/** Nur die Technik-Leitung (Maximilian) mit frischem Code. Wird protokolliert. */
export async function technikMitCode(wer: string, code: string, wofuer: string): Promise<void> {
  if (wer !== TECHNIK) throw new Error(`Das darf nur ${TECHNIK} (Technik-Leitung).`);
  await zweiterFaktor(wer, code);
  await protokolliere(wer, `Zweiter Faktor bestätigt: ${wofuer}`);
}
