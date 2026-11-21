"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BEREICHE, finde } from "@/lib/bereiche";

type Zahlen = { zutun: number; projekte: number };

/** Links: Bereiche mit ihren Unterpunkten (aufgeklappt beim aktiven Bereich) und die Suche. */
export function Navigation({ zahlen }: { zahlen: Zahlen }) {
  const t = finde(usePathname());
  const aktiv = t?.bereich.key;
  const zahl: Record<string, number> = { zutun: zahlen.zutun, projekte: zahlen.projekte };
  return (
    <nav className="nav" aria-label="Hauptmenü">
      <form action="/suche" role="search">
        <input name="q" className="suche-feld" placeholder="Suchen …" aria-label="Suchen" />
      </form>
      {BEREICHE.map((b) => (
        <div key={b.key} className="nav-punkt">
          <Link href={b.href} aria-current={aktiv === b.key && (b.seiten.length < 2 || t?.seite.href === b.seiten[0].href) ? "page" : undefined} className={aktiv === b.key ? "bereich-aktiv" : undefined}>
            {b.name}
            {zahl[b.key] ? <span className="zahl" aria-label={`${zahl[b.key]} offen`}>{zahl[b.key]}</span> : null}
          </Link>
          {aktiv === b.key && b.seiten.length > 1 ? (
            <div className="nav-unter">
              {b.seiten.slice(1).map((s) => <Link key={s.href} href={s.href} aria-current={t?.seite.href === s.href ? "page" : undefined}>{s.name}</Link>)}
            </div>
          ) : null}
        </div>
      ))}
    </nav>
  );
}

/** Nur auf dem Handy (dort ist das Menü eine Leiste oben): die Unterpunkte des aktuellen Bereichs. */
export function Unternavigation() {
  const pfad = usePathname();
  const t = finde(pfad);
  if (!t || t.bereich.seiten.length < 2) return null;
  return (
    <nav className="unternav" aria-label={t.bereich.name}>
      {t.bereich.seiten.map((s) => (
        <Link key={s.href} href={s.href} aria-current={t.seite.href === s.href ? "page" : undefined}>{s.name}</Link>
      ))}
    </nav>
  );
}
