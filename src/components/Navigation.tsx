"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

type Zahlen = { freigaben: number; aufgaben: number; tickets: number };

export function Navigation({ zahlen }: { zahlen: Zahlen }) {
  const pfad = usePathname();
  const gruppen: { titel?: string; punkte: { href: string; text: string; zahl?: number }[] }[] = [
    { punkte: [{ href: "/", text: "Heute" }, { href: "/aufgaben", text: "Aufgaben", zahl: zahlen.aufgaben }, { href: "/freigaben", text: "Freigaben", zahl: zahlen.freigaben }] },
    { titel: "Vertrieb", punkte: [{ href: "/pipeline", text: "Pipeline" }, { href: "/leads", text: "Betriebe" }] },
    { titel: "Lieferung", punkte: [{ href: "/projekte", text: "Projekte" }, { href: "/tickets", text: "Tickets", zahl: zahlen.tickets }] },
    { titel: "Firma", punkte: [{ href: "/finanzen", text: "Finanzen" }, { href: "/kennzahlen", text: "Kennzahlen" }, { href: "/unterlagen", text: "Unterlagen" }] },
    { titel: "Technik", punkte: [{ href: "/simulator", text: "Simulator" }, { href: "/system", text: "System" }, { href: "/einstellungen", text: "Einstellungen" }] },
  ];
  return (
    <nav className="nav" aria-label="Hauptmenü">
      <form action="/suche" role="search">
        <input name="q" className="suche-feld" placeholder="Suchen …" aria-label="Suchen" />
      </form>
      {gruppen.map((g, i) => (
        <div key={i}>
          {g.titel ? <div className="nav-gruppe">{g.titel}</div> : null}
          {g.punkte.map((p) => {
            const aktiv = p.href === "/" ? pfad === "/" : pfad.startsWith(p.href);
            return (
              <Link key={p.href} href={p.href} aria-current={aktiv ? "page" : undefined}>
                {p.text}
                {p.zahl ? <span className="zahl" aria-label={`${p.zahl} offen`}>{p.zahl}</span> : null}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
