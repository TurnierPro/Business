import { ilike, or } from "drizzle-orm";
import { getDb, schema } from "./db";
import { ticketNummer } from "./ablauf/tickets";

// Eine Suche über alles: Betriebe, Ansprechpartner, Projekte, Rechnungen, Tickets, Dokumente.

export type Treffer = { art: string; titel: string; unter: string; href: string };

export async function suche(roh: string): Promise<Treffer[]> {
  const q = roh.trim();
  if (q.length < 2) return [];
  const m = `%${q.replace(/[%_]/g, "")}%`;
  const db = await getDb();
  const [betriebe, kontakte, projekte, rechnungen, tickets, dokumente] = await Promise.all([
    db.select().from(schema.betriebe).where(or(ilike(schema.betriebe.name, m), ilike(schema.betriebe.ort, m), ilike(schema.betriebe.inhaber, m), ilike(schema.betriebe.email, m), ilike(schema.betriebe.telefon, m), ilike(schema.betriebe.website, m))).limit(20),
    db.select().from(schema.kontakte).where(or(ilike(schema.kontakte.name, m), ilike(schema.kontakte.email, m), ilike(schema.kontakte.telefon, m))).limit(20),
    db.select().from(schema.projekte).where(ilike(schema.projekte.domain, m)).limit(10),
    db.select().from(schema.rechnungen).where(ilike(schema.rechnungen.nummer, m)).limit(10),
    db.select().from(schema.tickets).where(or(ilike(schema.tickets.betreff, m), ilike(schema.tickets.beschreibung, m))).limit(10),
    db.select().from(schema.dokumente).where(ilike(schema.dokumente.titel, m)).limit(10),
  ]);
  const ticketTreffer = /^t-?\d+$/i.test(q) ? await db.select().from(schema.tickets) : [];
  return [
    ...betriebe.map((b) => ({ art: "Betrieb", titel: b.name, unter: [b.gewerk, b.ort, b.inhaber].filter(Boolean).join(" · "), href: `/leads/${b.id}` })),
    ...kontakte.map((k) => ({ art: "Kontakt", titel: k.name, unter: [k.rolle, k.telefon, k.email].filter(Boolean).join(" · "), href: `/leads/${k.betriebId}` })),
    ...projekte.map((p) => ({ art: "Projekt", titel: p.domain ?? `Projekt ${p.id}`, unter: p.status, href: `/projekte/${p.id}` })),
    ...rechnungen.map((r) => ({ art: "Rechnung", titel: r.nummer, unter: r.status, href: `/leads/${r.betriebId}` })),
    ...[...tickets, ...ticketTreffer.filter((t) => ticketNummer(t.id).toLowerCase() === q.toLowerCase().replace(/^t(\d)/, "t-$1"))].map((t) => ({ art: "Ticket", titel: `${ticketNummer(t.id)} ${t.betreff}`, unter: t.status, href: `/tickets/${t.id}` })),
    ...dokumente.map((d) => ({ art: "Dokument", titel: d.titel, unter: d.art, href: d.betriebId ? `/leads/${d.betriebId}` : `/dokument/${d.id}` })),
  ].filter((t, i, alle) => alle.findIndex((x) => x.href === t.href && x.titel === t.titel) === i);
}
