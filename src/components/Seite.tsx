import Link from "next/link";
import type { ReactNode } from "react";

// Einheitlicher Aufbau der Verwaltungsseiten: Kopf, Leiste „auf einen Blick“, Reiter.

export function SeitenKopf({ titel, text, children }: { titel: string; text?: string; children?: ReactNode }) {
  return (
    <div className="kopfzeile">
      <div><h1>{titel}</h1>{text ? <p>{text}</p> : null}</div>
      {children ? <div className="knopfreihe">{children}</div> : null}
    </div>
  );
}

export type Blick = { wert: ReactNode; name: string; ton?: "ok" | "warten" | "fehler"; href?: string };

/** Kennzahlenleiste: das Wichtigste der Seite in einer Zeile. */
export function AufEinenBlick({ werte }: { werte: Blick[] }) {
  return (
    <div className="blickleiste" style={{ gridTemplateColumns: `repeat(${Math.min(werte.length, 5)}, minmax(0, 1fr))` }}>
      {werte.map((w) => {
        const inhalt = (<><div className={`wert ${w.ton ?? ""}`}>{w.wert}</div><div className="name">{w.name}</div></>);
        return w.href ? <Link key={w.name} href={w.href} className="blick-wert">{inhalt}</Link> : <div key={w.name} className="blick-wert">{inhalt}</div>;
      })}
    </div>
  );
}

export type ReiterEintrag = { key: string; name: string; zahl?: number | string; ton?: "warten" | "fehler" };

/** Reiter über ?reiter=…; weitere Parameter bleiben erhalten. */
export function SeitenReiter({ basis, aktiv, liste, param = "reiter", weitere = {} }: { basis: string; aktiv: string; liste: ReiterEintrag[]; param?: string; weitere?: Record<string, string> }) {
  return (
    <nav className="reiter seitenreiter" aria-label="Bereiche dieser Seite">
      {liste.map((r) => {
        const q = new URLSearchParams({ ...weitere, [param]: r.key }).toString();
        return (
          <Link key={r.key} href={`${basis}?${q}`} aria-current={aktiv === r.key ? "page" : undefined}>
            {r.name}{r.zahl !== undefined && r.zahl !== "" ? <span className={`reiter-zahl ${r.ton ?? ""}`}>{r.zahl}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}

/** Welcher Reiter ist aktiv? Unbekannte Werte fallen auf den ersten zurück. */
export const reiterWahl = (wert: string | undefined, liste: { key: string }[]) => (liste.some((r) => r.key === wert) ? wert! : liste[0].key);
