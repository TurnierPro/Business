import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { COOKIE, pruefePasswort, sitzungsWert, startBenutzer, START_PASSWORT, aktuellerBenutzer } from "@/lib/auth";
import { protokolliere } from "@/lib/protokoll";
import { Logo } from "@/components/Logo";
import { marke } from "@/lib/marke";

export const metadata = { title: "Anmelden" };

async function anmelden(f: FormData) {
  "use server";
  const email = String(f.get("email") ?? "").trim().toLowerCase();
  const db = await getDb();
  const [b] = await db.select().from(schema.benutzer).where(eq(schema.benutzer.email, email));
  if (!b || !pruefePasswort(String(f.get("passwort") ?? ""), b.passwortHash)) redirect("/login?fehler=1");
  (await cookies()).set(COOKIE, sitzungsWert(b.id), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 14 * 86400 });
  await protokolliere(b.name, "Angemeldet");
  redirect("/");
}

export default async function Login({ searchParams }: { searchParams: Promise<{ fehler?: string }> }) {
  if (await aktuellerBenutzer()) redirect("/");
  const erster = await startBenutzer();
  const db = await getDb();
  const benutzer = await db.select({ email: schema.benutzer.email }).from(schema.benutzer);
  const { fehler } = await searchParams;
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
          <label className="feld">
            <span>E-Mail</span>
            <input name="email" type="email" autoComplete="username" required defaultValue={benutzer[0]?.email} />
          </label>
          <label className="feld">
            <span>Passwort</span>
            <input name="passwort" type="password" autoComplete="current-password" required />
          </label>
          <button className="knopf haupt" style={{ width: "100%" }}>Anmelden</button>
        </form>
        {erster || process.env.NODE_ENV !== "production" ? (
          <p className="leise klein" style={{ marginTop: 16 }}>
            Erster Start: Konten {benutzer.map((b) => b.email).join(" und ")} mit dem Start-Passwort <span className="mono">{process.env.STELAX_START_PASSWORT ? "aus STELAX_START_PASSWORT" : START_PASSWORT}</span>. Danach unter System ändern.
          </p>
        ) : null}
      </div>
    </div>
  );
}
