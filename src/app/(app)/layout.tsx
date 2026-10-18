import { Suspense } from "react";
import { eq, sql } from "drizzle-orm";
import { brauchtBenutzer } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { Logo } from "@/components/Logo";
import { Navigation } from "@/components/Navigation";
import { Meldung } from "@/components/Meldung";
import { marke } from "@/lib/marke";
import { abmelden } from "./aktionen";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const b = await brauchtBenutzer();
  const db = await getDb();
  const [offen] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.postausgang).where(eq(schema.postausgang.status, "zur_freigabe"));
  return (
    <div className="app">
      <aside className="seitenleiste">
        <div>
          <a href="/" className="logo"><Logo hoehe={20} /></a>
          <div className="slogan">{marke.slogan}</div>
        </div>
        <Navigation freigaben={offen.n} />
        <div className="fuss">
          {b.name}
          <br />
          <form action={abmelden}><button>Abmelden</button></form>
        </div>
      </aside>
      <main className="inhalt">
        <Suspense>
          <Meldung />
        </Suspense>
        {children}
      </main>
    </div>
  );
}
