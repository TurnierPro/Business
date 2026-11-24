// Notfall: Anmeldung klappt nicht (z. B. Start-Passwort wurde nach dem ersten Start in Coolify geändert).
// Setzt das Passwort eines Kontos auf LEVAREX_START_PASSWORT zurück, hebt die Sperre nach Fehlversuchen auf
// und beendet alle Sitzungen. Beim nächsten Anmelden muss ein neues Passwort gewählt werden.
// Die Zwei-Faktor-Anmeldung bleibt, außer mit --ohne-2fa (z. B. Handy verloren).
// Aufruf im App-Container (Coolify → app → Terminal):
//   npx tsx scripts/passwort-zuruecksetzen.ts maximilian@levarex-consulting.de
//   npx tsx scripts/passwort-zuruecksetzen.ts maximilian@levarex-consulting.de --ohne-2fa
export {};
const { eq, like } = await import("drizzle-orm");
const { getDb, schema } = await import("../src/lib/db");
const { hashPasswort } = await import("../src/lib/auth");
const { protokolliere } = await import("../src/lib/protokoll");

const email = (process.argv[2] ?? "").trim().toLowerCase();
const ohne2fa = process.argv.includes("--ohne-2fa");
const neu = process.env.LEVAREX_START_PASSWORT ?? "";
const db = await getDb();
const konten = await db.select({ email: schema.benutzer.email }).from(schema.benutzer);
if (!email) {
  console.log(`Bitte die E-Mail des Kontos angeben. Vorhandene Konten: ${konten.map((k) => k.email).join(", ") || "keine"}`);
  process.exit(1);
}
if (neu.length < 12) {
  console.log("LEVAREX_START_PASSWORT ist nicht gesetzt oder kürzer als 12 Zeichen. Erst in Coolify eintragen und neu deployen.");
  process.exit(1);
}
const [b] = await db.select().from(schema.benutzer).where(eq(schema.benutzer.email, email));
if (!b) {
  console.log(`Kein Konto „${email}“. Vorhandene Konten: ${konten.map((k) => k.email).join(", ") || "keine"}`);
  process.exit(1);
}
await db
  .update(schema.benutzer)
  .set({ passwortHash: hashPasswort(neu), mussPasswortAendern: true, aktiv: true, sitzungVersion: b.sitzungVersion + 1, ...(ohne2fa ? { totpAktiv: false, totpGeheim: null, totpLetzterSchritt: null } : {}) })
  .where(eq(schema.benutzer.id, b.id));
await db.delete(schema.versuche).where(like(schema.versuche.schluessel, `%${email}%`));
await protokolliere("Notfall (Server-Terminal)", `Passwort zurückgesetzt für ${email}${ohne2fa ? ", Zwei-Faktor neu einzurichten" : ""}`, null);
console.log(`Fertig. ${email} meldet sich jetzt mit dem Start-Passwort aus LEVAREX_START_PASSWORT an und wählt danach ein neues.${ohne2fa ? " Zwei-Faktor danach neu einrichten." : ""}`);
process.exit(0);
