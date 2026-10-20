import { Suspense } from "react";
import { and, eq, isNull, lte, ne, sql } from "drizzle-orm";
import { brauchtBenutzer } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { inTagen } from "@/lib/format";
import { Logo } from "@/components/Logo";
import { Navigation } from "@/components/Navigation";
import { Meldung } from "@/components/Meldung";
import { marke } from "@/lib/marke";
import { abmelden } from "./aktionen";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const b = await brauchtBenutzer();
  const db = await getDb();
  const heuteEnde = inTagen(1, "00:00"); // Mitternacht deutsche Zeit
  const [[offen], [aufgaben], [tickets]] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(schema.postausgang).where(eq(schema.postausgang.status, "zur_freigabe")),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.aktivitaeten).where(and(isNull(schema.aktivitaeten.erledigtAm), eq(schema.aktivitaeten.zustaendig, b.name), lte(schema.aktivitaeten.faelligAm, heuteEnde))),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.tickets).where(ne(schema.tickets.status, "erledigt")),
  ]);
  return (
    <div className="app">
      <aside className="seitenleiste">
        <div>
          <a href="/" className="logo"><Logo hoehe={20} /></a>
          <div className="slogan">{marke.slogan}</div>
        </div>
        <Navigation zahlen={{ freigaben: offen.n, aufgaben: aufgaben.n, tickets: tickets.n }} />
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
