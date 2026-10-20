import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { COOKIE, COOKIE_2FA, liesZwischen, sitzungsWert } from "@/lib/auth";
import { pruefe } from "@/lib/totp";
import { protokolliere } from "@/lib/protokoll";
import { Logo } from "@/components/Logo";

export const metadata = { title: "Code eingeben" };

async function bestaetigen(f: FormData) {
  "use server";
  const id = liesZwischen((await cookies()).get(COOKIE_2FA)?.value);
  if (!id) redirect("/login");
  const db = await getDb();
  const [b] = await db.select().from(schema.benutzer).where(eq(schema.benutzer.id, id));
  if (!b?.totpGeheim || !pruefe(b.totpGeheim, String(f.get("code") ?? ""))) {
    await protokolliere(b?.name ?? "Unbekannt", "Falscher Zwei-Faktor-Code");
    redirect("/login/code?fehler=1");
  }
  const c = await cookies();
  c.delete(COOKIE_2FA);
  c.set(COOKIE, sitzungsWert(b.id), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 14 * 86400 });
  await protokolliere(b.name, "Angemeldet (mit Zwei-Faktor)");
  redirect("/");
}

export default async function Code({ searchParams }: { searchParams: Promise<{ fehler?: string }> }) {
  if (!liesZwischen((await cookies()).get(COOKIE_2FA)?.value)) redirect("/login");
  const { fehler } = await searchParams;
  return (
    <div className="zentriert">
      <div className="schmal">
        <div style={{ marginBottom: 32 }}><Logo hoehe={30} /></div>
        <form action={bestaetigen} className="karte">
          <h1 style={{ fontSize: 22, marginBottom: 12 }}>Code aus der App</h1>
          <p className="leise" style={{ marginBottom: 16 }}>Öffne deine Authenticator-App und gib den 6-stelligen Code für Stelax OS ein.</p>
          {fehler ? <div className="hinweis fehler" role="alert">Der Code stimmt nicht. Bitte den aktuellen Code eingeben.</div> : null}
          <label className="feld"><span>Code</span><input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" required autoFocus className="mono" /></label>
          <button className="knopf haupt" style={{ width: "100%" }}>Anmelden</button>
        </form>
      </div>
    </div>
  );
}
