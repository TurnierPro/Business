import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { COOKIE, COOKIE_2FA, COOKIE_OPTIONEN, liesZwischen, sitzungsWert } from "@/lib/auth";
import { pruefeMitSchritt } from "@/lib/totp";
import { entschluessele } from "@/lib/geheim";
import { erlaubt, GRENZEN, versuchMerken, versucheLoeschen } from "@/lib/sicherheit";
import { protokolliere } from "@/lib/protokoll";
import { Logo } from "@/components/Logo";

export const metadata = { title: "Code eingeben" };

async function bestaetigen(f: FormData) {
  "use server";
  const id = liesZwischen((await cookies()).get(COOKIE_2FA)?.value);
  if (!id) redirect("/login");
  // Höchstens 5 falsche Codes in 15 Minuten, sonst zurück zum Passwort
  if (!(await erlaubt("code", `konto:${id}`, GRENZEN.codeJeKonto))) {
    (await cookies()).delete(COOKIE_2FA);
    redirect("/login?gesperrt=1");
  }
  const db = await getDb();
  const [b] = await db.select().from(schema.benutzer).where(eq(schema.benutzer.id, id));
  const schritt = b?.totpGeheim ? pruefeMitSchritt(entschluessele(b.totpGeheim), String(f.get("code") ?? "")) : null;
  // Ein Code gilt nur einmal (Schutz, falls jemand ihn mitliest)
  if (!b || schritt === null || (b.totpLetzterSchritt !== null && schritt <= b.totpLetzterSchritt)) {
    await versuchMerken("code", `konto:${id}`);
    await protokolliere(b?.name ?? "Unbekannt", "Falscher Zwei-Faktor-Code");
    redirect("/login/code?fehler=1");
  }
  await versucheLoeschen("code", `konto:${id}`);
  await db.update(schema.benutzer).set({ totpLetzterSchritt: schritt }).where(eq(schema.benutzer.id, b.id));
  const c = await cookies();
  c.delete(COOKIE_2FA);
  c.set(COOKIE, sitzungsWert(b.id, b.sitzungVersion), COOKIE_OPTIONEN);
  await protokolliere(b.name, "Angemeldet (mit Zwei-Faktor)");
  if (b.mussPasswortAendern) redirect("/passwort");
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
          <p className="leise" style={{ marginBottom: 16 }}>Öffne deine Authenticator-App und gib den 6-stelligen Code für Nexova OS ein.</p>
          {fehler ? <div className="hinweis fehler" role="alert">Der Code stimmt nicht. Bitte den aktuellen Code eingeben.</div> : null}
          <label className="feld"><span>Code</span><input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" required autoFocus className="mono" /></label>
          <button className="knopf haupt" style={{ width: "100%" }}>Anmelden</button>
        </form>
      </div>
    </div>
  );
}
