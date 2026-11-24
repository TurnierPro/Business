// Aufbau der Oberfläche: Menü links mit Unterpunkten unter dem aktiven Bereich. Eine Stelle für alles, was im Menü steht.

export type Seite = { href: string; name: string; exakt?: boolean };
export type Bereich = { key: string; name: string; href: string; seiten: Seite[] };

export const BEREICHE: Bereich[] = [
  { key: "zutun", name: "Zu tun", href: "/", seiten: [{ href: "/", name: "Übersicht", exakt: true }, { href: "/freigaben", name: "Freigaben" }, { href: "/aufgaben", name: "Aufgaben" }] },
  { key: "leads", name: "Leads", href: "/leads", seiten: [{ href: "/leads", name: "Alle Leads" }] },
  { key: "pipeline", name: "Pipeline", href: "/pipeline", seiten: [{ href: "/pipeline", name: "Pipeline" }] },
  { key: "projekte", name: "Kunden", href: "/projekte", seiten: [{ href: "/projekte", name: "Kunden und Projekte" }, { href: "/tickets", name: "Tickets" }] },
  { key: "finanzen", name: "Finanzen", href: "/finanzen", seiten: [{ href: "/finanzen", name: "Übersicht", exakt: true }, { href: "/finanzen/plan", name: "Plan und Soll" }, { href: "/kennzahlen", name: "Kennzahlen" }] },
  { key: "logs", name: "Logs", href: "/logs", seiten: [{ href: "/logs", name: "Protokoll", exakt: true }, { href: "/logs/post", name: "Versendet" }, { href: "/system", name: "Systemzustand" }] },
  { key: "stammdaten", name: "Stammdaten", href: "/stammdaten", seiten: [{ href: "/stammdaten", name: "Katalog", exakt: true }, { href: "/stammdaten/angebot", name: "Angebotsvorlage" }, { href: "/stammdaten/ziele", name: "Soll-Umsätze" }, { href: "/stammdaten/konnektoren", name: "Konnektoren" }, { href: "/einstellungen", name: "Benutzer und Sicherheit" }] },
];

const passt = (pfad: string, s: Seite) => (s.exakt ? pfad === s.href : pfad === s.href || pfad.startsWith(`${s.href}/`));

/** Welcher Bereich und welche Seite gehören zu diesem Pfad? (längster Treffer gewinnt) */
export function finde(pfad: string): { bereich: Bereich; seite: Seite } | null {
  let best: { bereich: Bereich; seite: Seite } | null = null;
  for (const b of BEREICHE) for (const s of b.seiten) if (passt(pfad, s) && (!best || s.href.length > best.seite.href.length)) best = { bereich: b, seite: s };
  // Unterseiten ohne eigenen Reiter (z. B. /finanzen/ausgabe/neu) dem Bereich zuordnen
  if (!best) for (const b of BEREICHE) for (const s of b.seiten) if (s.href !== "/" && pfad.startsWith(`${s.href}/`)) best ??= { bereich: b, seite: s };
  return best;
}
