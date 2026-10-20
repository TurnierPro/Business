import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { aktuellerBenutzer, COOKIE, COOKIE_OPTIONEN, hashPasswort, passwortProblem, pruefePasswort, sitzungsWert } from "@/lib/auth";
import { protokolliere } from "@/lib/protokoll";
import { Logo } from "@/components/Logo";

export const metadata = { title: "Passwort ändern" };

// Eigene Seite außerhalb des App-Rahmens: Wer noch das Start-Passwort hat, kommt nirgends sonst hin.
async function aendern(f: FormData) {
  "use server";
  const ich = await aktuellerBenutzer();
  if (!ich) redirect("/login");
  const db = await getDb();
  const [b] = await db.select().from(schema.benutzer).where(eq(schema.benutzer.id, ich.id));
  const neu = String(f.get("neu") ?? "");
  const fehler = !pruefePasswort(String(f.get("alt") ?? ""), b.passwortHash) ? "Das bisherige Passwort stimmt nicht." : neu !== String(f.get("wiederholt") ?? "") ? "Die beiden neuen Passwörter sind nicht gleich." : passwortProblem(neu);
  if (fehler) redirect(`/passwort?fehler=${encodeURIComponent(fehler)}`);
  // Neue Sitzungs-Version: alle anderen Geräte sind damit abgemeldet
  const version = b.sitzungVersion + 1;
  await db.update(schema.benutzer).set({ passwortHash: hashPasswort(neu), mussPasswortAendern: false, sitzungVersion: version }).where(eq(schema.benutzer.id, b.id));
  (await cookies()).set(COOKIE, sitzungsWert(b.id, version), COOKIE_OPTIONEN);
  await protokolliere(b.name, "Passwort geändert, andere Sitzungen beendet");
  redirect("/?ok=" + encodeURIComponent("Passwort geändert. Andere Geräte sind abgemeldet."));
}

export default async function Passwort({ searchParams }: { searchParams: Promise<{ fehler?: string }> }) {
  const ich = await aktuellerBenutzer();
  if (!ich) redirect("/login");
  const { fehler } = await searchParams;
  return (
    <div className="zentriert">
      <div className="schmal">
        <div style={{ marginBottom: 32 }}><Logo hoehe={30} /></div>
        <form action={aendern} className="karte">
          <h1 style={{ fontSize: 22, marginBottom: 12 }}>{ich.mussPasswortAendern ? "Bitte zuerst ein eigenes Passwort setzen" : "Passwort ändern"}</h1>
          <p className="leise" style={{ marginBottom: 16 }}>Mindestens 12 Zeichen. Am besten ein Satz oder ein Passwort aus dem Passwortmanager. Danach sind alle anderen Geräte abgemeldet.</p>
          {fehler ? <div className="hinweis fehler" role="alert">{fehler}</div> : null}
          <label className="feld"><span>Bisheriges Passwort</span><input name="alt" type="password" autoComplete="current-password" required /></label>
          <label className="feld"><span>Neues Passwort</span><input name="neu" type="password" autoComplete="new-password" minLength={12} required /></label>
          <label className="feld"><span>Neues Passwort wiederholen</span><input name="wiederholt" type="password" autoComplete="new-password" minLength={12} required /></label>
          <button className="knopf haupt" style={{ width: "100%" }}>Speichern</button>
        </form>
        {!ich.mussPasswortAendern ? <p className="klein" style={{ marginTop: 16 }}><a href="/">Zurück</a></p> : null}
      </div>
    </div>
  );
}
