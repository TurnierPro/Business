import { Suspense } from "react";
import { and, eq, isNull, lte, ne, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { brauchtBenutzer, zweiFaktorPflichtFehlt } from "@/lib/auth";
import { zuTunZahlen } from "@/lib/zutun";
import { getDb, schema } from "@/lib/db";
import { inTagen } from "@/lib/format";
import { Logo } from "@/components/Logo";
import { Navigation, Unternavigation } from "@/components/Navigation";
import { katalogLaden } from "@/lib/katalog-db";
import { Meldung } from "@/components/Meldung";
import { marke } from "@/lib/marke";
import { abmelden } from "./aktionen";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const b = await brauchtBenutzer();
  const db = await getDb();
  // Zwei-Faktor ist Pflicht: ohne eingerichtete App erst zur Einrichtung (auf dem eigenen Rechner nur ein Hinweis)
  const [ich] = await db.select({ totpAktiv: schema.benutzer.totpAktiv }).from(schema.benutzer).where(eq(schema.benutzer.id, b.id));
  if (ich && zweiFaktorPflichtFehlt(ich)) redirect("/zwei-faktor");
  // Fehlt der zweite Faktor (nur lokal möglich, auf dem Server ist er Pflicht), erinnert „Zu tun“ unten daran.
  await katalogLaden(); // Stammdaten aktuell halten (eine kleine Abfrage)
  const [zutun, [tickets]] = await Promise.all([
    zuTunZahlen(b.name),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.tickets).where(ne(schema.tickets.status, "erledigt")),
  ]);
  return (
    <div className="app">
      <aside className="seitenleiste">
        <div>
          <a href="/" className="logo"><Logo hoehe={20} /></a>
          <div className="slogan">{marke.slogan}</div>
        </div>
        <Navigation zahlen={{ zutun: zutun.gesamt, projekte: tickets.n }} />
        <div className="fuss">
          {b.name}
          <br />
          <form action={abmelden}><button>Abmelden</button></form>
        </div>
      </aside>
      <main className="inhalt">
        <Unternavigation />
        <Suspense>
          <Meldung />
        </Suspense>
        {children}
      </main>
    </div>
  );
}
