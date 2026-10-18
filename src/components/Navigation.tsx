"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function Navigation({ freigaben }: { freigaben: number }) {
  const pfad = usePathname();
  const punkte = [
    { href: "/", text: "Heute" },
    { href: "/leads", text: "Leads" },
    { href: "/freigaben", text: "Freigaben", zahl: freigaben },
    { href: "/projekte", text: "Projekte" },
    { href: "/simulator", text: "Simulator" },
    { href: "/system", text: "System" },
  ];
  return (
    <nav className="nav" aria-label="Hauptmenü">
      {punkte.map((p) => {
        const aktiv = p.href === "/" ? pfad === "/" : pfad.startsWith(p.href);
        return (
          <Link key={p.href} href={p.href} aria-current={aktiv ? "page" : undefined}>
            {p.text}
            {p.zahl ? <span className="zahl" aria-label={`${p.zahl} offen`}>{p.zahl}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
