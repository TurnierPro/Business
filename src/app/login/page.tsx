import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { headers } from "next/headers";
import { COOKIE, COOKIE_2FA, COOKIE_OPTIONEN, pruefeAnmeldung, sitzungsWert, startBenutzer, startPasswortUnsicher, START_PASSWORT, aktuellerBenutzer, zwischenWert } from "@/lib/auth";
import { clientIp, erlaubt, GRENZEN, versuchMerken, versucheLoeschen } from "@/lib/sicherheit";
import { protokolliere } from "@/lib/protokoll";
import { Logo } from "@/components/Logo";
import { marke } from "@/lib/marke";

export const metadata = { title: "Anmelden" };

async function anmelden(f: FormData) {
  "use server";
  const email = String(f.get("email") ?? "").trim().toLowerCase().slice(0, 200);
  const ip = clientIp(await headers());
  // Sperre nach zu vielen Fehlversuchen (je Konto und je Netz), 15 Minuten
  if (!(await erlaubt("login", `konto:${email}`, GRENZEN.loginJeKonto)) || !(await erlaubt("login", `ip:${ip}`, GRENZEN.loginJeIp))) {
    await protokolliere("Sicherheit", `Anmeldung gesperrt (zu viele Fehlversuche) für ${email || "?"}`);
    redirect("/login?gesperrt=1");
  }
  const db = await getDb();
  const [b] = await db.select().from(schema.benutzer).where(eq(schema.benutzer.email, email));
  if (!pruefeAnmeldung(String(f.get("passwort") ?? ""), b?.passwortHash) || !b?.aktiv) {
    await versuchMerken("login", `konto:${email}`);
    await versuchMerken("login", `ip:${ip}`);
    redirect("/login?fehler=1");
  }
  await versucheLoeschen("login", `konto:${email}`);
  if (b.totpAktiv) {
    // Passwort stimmt, jetzt noch der Code aus der Authenticator-App
    (await cookies()).set(COOKIE_2FA, zwischenWert(b.id), { ...COOKIE_OPTIONEN, maxAge: 300 });
    redirect("/login/code");
  }
  (await cookies()).set(COOKIE, sitzungsWert(b.id, b.sitzungVersion), COOKIE_OPTIONEN);
  await protokolliere(b.name, "Angemeldet");
  redirect(b.mussPasswortAendern ? "/passwort" : "/");
}

export default async function Login({ searchParams }: { searchParams: Promise<{ fehler?: string; gesperrt?: string }> }) {
  if (await aktuellerBenutzer()) redirect("/");
  const erster = await startBenutzer();
  const db = await getDb();
  const benutzer = await db.select({ email: schema.benutzer.email }).from(schema.benutzer);
  const { fehler, gesperrt } = await searchParams;
  const entwicklung = process.env.NODE_ENV !== "production";
  return (
    <div className="zentriert">
      <div className="schmal">
        <div style={{ marginBottom: 32 }}>
          <Logo hoehe={30} />
          <p className="leise klein" style={{ marginTop: 10 }}>{marke.slogan}</p>
        </div>
        <form action={anmelden} className="karte">
          <h1 style={{ fontSize: 22, marginBottom: 20 }}>Anmelden</h1>
          {fehler ? <div className="hinweis fehler" role="alert">E-Mail oder Passwort stimmt nicht.</div> : null}
          {gesperrt ? <div className="hinweis fehler" role="alert">Zu viele Fehlversuche. Bitte in 15 Minuten erneut versuchen.</div> : null}
          {startPasswortUnsicher() && !benutzer.length ? <div className="hinweis fehler" role="alert">Einrichtung: Auf dem Server zuerst NEXOVA_START_PASSWORT (mindestens 12 Zeichen) setzen.</div> : null}
          <label className="feld">
            <span>E-Mail</span>
            <input name="email" type="email" autoComplete="username" required defaultValue={entwicklung ? benutzer[0]?.email : undefined} />
          </label>
          <label className="feld">
            <span>Passwort</span>
            <input name="passwort" type="password" autoComplete="current-password" required />
          </label>
          <button className="knopf haupt" style={{ width: "100%" }}>Anmelden</button>
        </form>
        {entwicklung ? (
          <p className="leise klein" style={{ marginTop: 16 }}>
            Nur auf dem eigenen Rechner sichtbar: Konten {benutzer.map((b) => b.email).join(" und ")}, Start-Passwort <span className="mono">{process.env.NEXOVA_START_PASSWORT ? "aus NEXOVA_START_PASSWORT" : START_PASSWORT}</span>. Beim ersten Anmelden muss es geändert werden.
          </p>
        ) : erster ? <p className="leise klein" style={{ marginTop: 16 }}>Konten angelegt. Start-Passwort aus NEXOVA_START_PASSWORT, beim ersten Anmelden ändern.</p> : null}
      </div>
    </div>
  );
}
