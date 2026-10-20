import crypto from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "./db";
import { basisUrl } from "./ablauf/gemeinsam";
import { zahlungUeberStripe } from "./adapters/stripe";

// Kundenportal: Jeder Kunde sieht über seinen geheimen Link den Stand seines Projekts,
// seine Unterlagen und Rechnungen. Grundregel: Sichtbar ist nur, was wir freigegeben und verschickt haben.

export async function portalLink(betriebId: number): Promise<string> {
  const db = await getDb();
  const [b] = await db.select({ token: schema.betriebe.portalToken }).from(schema.betriebe).where(eq(schema.betriebe.id, betriebId));
  let token = b?.token;
  if (!token) {
    token = crypto.randomBytes(24).toString("base64url");
    await db.update(schema.betriebe).set({ portalToken: token }).where(eq(schema.betriebe.id, betriebId));
  }
  return `${basisUrl()}/portal/k/${token}`;
}

export async function betriebPerPortal(token: string) {
  if (!token || token.length < 20) return null;
  const db = await getDb();
  const [b] = await db.select().from(schema.betriebe).where(eq(schema.betriebe.portalToken, token));
  return b && b.status !== "gesperrt" ? b : null;
}

const FUER_KUNDEN = ["angebot", "protokoll", "rechnung", "auftragsbestaetigung", "abnahmeprotokoll", "monatsreport", "umzugsanleitung"];

/** Alle Einträge, die an diesen Kunden wirklich verschickt wurden (nach Qualitätskontrolle und Freigabe). */
async function versendet(betriebId: number) {
  const db = await getDb();
  return db
    .select()
    .from(schema.postausgang)
    .where(and(eq(schema.postausgang.betriebId, betriebId), eq(schema.postausgang.status, "versendet")))
    .orderBy(desc(schema.postausgang.versendetAm));
}

export async function sichtbareDokumente(betriebId: number) {
  const db = await getDb();
  const post = await versendet(betriebId);
  const ids = [...new Set(post.flatMap((p) => p.anhaenge))];
  if (!ids.length) return [];
  const doks = await db.select().from(schema.dokumente).where(and(inArray(schema.dokumente.id, ids), eq(schema.dokumente.betriebId, betriebId)));
  const versandAm = (id: number) => post.find((p) => p.anhaenge.includes(id))?.versendetAm ?? null;
  return doks
    .filter((d) => FUER_KUNDEN.includes(d.art))
    .map((d) => ({ ...d, versendetAm: versandAm(d.id) }))
    .sort((a, b) => (b.versendetAm?.getTime() ?? 0) - (a.versendetAm?.getTime() ?? 0));
}

export async function darfDokumentSehen(betriebId: number, dokumentId: number): Promise<boolean> {
  return (await sichtbareDokumente(betriebId)).some((d) => d.id === dokumentId);
}

export type Schritt = { titel: string; text: string; erledigt: boolean; datum: Date | null };

/** Der Fortschritt aus Sicht des Kunden: abgehakt, was erledigt ist. */
export async function schritte(betriebId: number): Promise<Schritt[]> {
  const db = await getDb();
  const [termine, angebote, projekte, post] = await Promise.all([
    db.select().from(schema.termine).where(eq(schema.termine.betriebId, betriebId)),
    db.select().from(schema.angebote).where(eq(schema.angebote.betriebId, betriebId)).orderBy(desc(schema.angebote.erstelltAm)),
    db.select().from(schema.projekte).where(eq(schema.projekte.betriebId, betriebId)).orderBy(desc(schema.projekte.erstelltAm)),
    versendet(betriebId),
  ]);
  const p = projekte[0];
  // Fortschritt hängt am Angebot des laufenden Projekts; ein späterer Nachtrag setzt nichts zurück
  const a = (p && angebote.find((x) => x.id === p.angebotId)) || angebote[0];
  const angebotVersendet = post.find((e) => e.zweck === "angebot");
  const nachBau = p && ["pruefung", "bereit", "live"].includes(p.status);
  return [
    { titel: "Gespräch vor Ort", text: "Wir haben Ihren Betrieb kennengelernt und Ziele festgehalten.", erledigt: termine.length > 0 || !!angebotVersendet, datum: termine[0]?.datum ?? a?.erstelltAm ?? null },
    { titel: "Angebot erhalten", text: "Protokoll, Maßnahmenplan und Angebot liegen unten bei Ihren Unterlagen.", erledigt: !!angebotVersendet, datum: angebotVersendet?.versendetAm ?? null },
    { titel: "Angebot angenommen", text: "Danke für Ihr Vertrauen.", erledigt: !!a?.unterschriebenAm, datum: a?.unterschriebenAm ?? null },
    { titel: "Anzahlung eingegangen", text: "Damit starten wir Ihr Projekt.", erledigt: !!a?.angezahltAm, datum: a?.angezahltAm ?? null },
    { titel: "Inhalte geliefert", text: "Texte und Fotos von Ihnen sind da.", erledigt: !!p?.inhalteAm, datum: p?.inhalteAm ?? null },
    { titel: "Website gebaut und geprüft", text: "Ladezeit, Barrierefreiheit, Formulare und Rechtstexte geprüft.", erledigt: !!nachBau, datum: null },
    { titel: "Website live", text: "Ihre Seite ist unter Ihrer Domain erreichbar.", erledigt: !!p?.liveAm, datum: p?.liveAm ?? null },
    { titel: "Website abgenommen", text: "Sie haben die fertige Seite geprüft und abgenommen.", erledigt: ["abgenommen", "vorbehalt", "fiktion"].includes(p?.abnahmeStatus ?? ""), datum: p?.abnahmeAm ?? null },
    { titel: "Betreuung läuft", text: "Wir kümmern uns um Technik, Sicherheit und Änderungen.", erledigt: !!p?.aboAb, datum: p?.aboAb ?? null },
  ];
}

export async function portalDaten(betriebId: number) {
  const db = await getDb();
  const [doks, schr, angebote, projekte, rechnungen, post, anfragen, tickets] = await Promise.all([
    sichtbareDokumente(betriebId),
    schritte(betriebId),
    db.select().from(schema.angebote).where(eq(schema.angebote.betriebId, betriebId)).orderBy(desc(schema.angebote.erstelltAm)),
    db.select().from(schema.projekte).where(eq(schema.projekte.betriebId, betriebId)).orderBy(desc(schema.projekte.erstelltAm)),
    db.select().from(schema.rechnungen).where(eq(schema.rechnungen.betriebId, betriebId)).orderBy(desc(schema.rechnungen.erstelltAm)),
    versendet(betriebId),
    db.select().from(schema.anfragen).where(eq(schema.anfragen.betriebId, betriebId)).orderBy(desc(schema.anfragen.am)).limit(50),
    db.select().from(schema.tickets).where(eq(schema.tickets.betriebId, betriebId)).orderBy(desc(schema.tickets.erstelltAm)).limit(20),
  ]);
  const verschickteNummern = new Set(post.map((p) => p.meta.rechnungsnummer).filter(Boolean));
  const angebot = angebote[0];
  const projekt = projekte[0];
  const [seite] = projekt?.seitenSlug && projekt.status === "live" ? await db.select().from(schema.seiten).where(eq(schema.seiten.slug, projekt.seitenSlug)) : [];
  return {
    schritte: schr,
    dokumente: doks.filter((d) => d.art !== "rechnung"),
    // Eigene Rechnungen erst nach Freigabe und Versand, Stripe-Rechnungen verschickt Stripe selbst.
    rechnungen: rechnungen
      .filter((r) => r.quelle === "stripe" || verschickteNummern.has(r.nummer))
      .map((r) => ({ ...r, dokumentId: doks.find((d) => d.art === "rechnung" && (d.daten as { nummer?: string }).nummer === r.nummer)?.id ?? null })),
    angebotOffen: angebot?.status === "versendet" ? angebot : null,
    anzahlungOffen: angebot?.status === "unterschrieben" && zahlungUeberStripe() ? angebot : null,
    inhalteOffen: projekt?.status === "inhalte" ? projekt : null,
    // Abnahme erst, wenn die Aufforderung verschickt ist (dann läuft die Frist)
    abnahmeOffen: projekt?.abnahmeStatus === "offen" && projekt.abnahmeFrist ? projekt : null,
    anfragen,
    tickets,
    projekt,
    website: seite ? { url: projekt!.domain ? `https://${projekt!.domain}` : `/vorschau/${seite.slug}`, domain: projekt!.domain } : null,
  };
}

/** Neuer Portal-Link: Der alte funktioniert sofort nicht mehr (z. B. wenn er weitergeleitet wurde). */
export async function portalLinkErneuern(betriebId: number, wer: string): Promise<string> {
  const db = await getDb();
  await db.update(schema.betriebe).set({ portalToken: crypto.randomBytes(24).toString("base64url") }).where(eq(schema.betriebe.id, betriebId));
  const { protokolliere } = await import("./protokoll");
  await protokolliere(wer, "Portal-Link erneuert, alter Link gesperrt", betriebId);
  return portalLink(betriebId);
}

/**
 * Kunde hat seinen Link verloren und gibt seine E-Mail ein. Passt sie zu einem Kunden mit Portal,
 * legt Nexova OS eine Mail mit dem Link in den Postausgang (Freigabe wie immer). Die Antwort ist
 * immer gleich, damit niemand herausfinden kann, welche Adressen es gibt.
 */
export async function zugangAnfordern(email: string): Promise<void> {
  const adresse = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adresse)) return;
  const db = await getDb();
  const kunden = (await db.select().from(schema.betriebe)).filter((b) => b.portalToken && b.status !== "gesperrt" && b.email?.toLowerCase() === adresse);
  const { inPostausgang } = await import("./ablauf/postausgang");
  for (const b of kunden.slice(0, 3)) {
    const schon = (await db.select().from(schema.postausgang).where(and(eq(schema.postausgang.betriebId, b.id), eq(schema.postausgang.zweck, "portal_zugang"), eq(schema.postausgang.status, "zur_freigabe")))).length;
    if (schon) continue;
    await inPostausgang({
      betriebId: b.id,
      kanal: "mail",
      zweck: "portal_zugang",
      empfaenger: b.email!,
      betreff: "Ihr Zugang zum Kundenportal",
      text: `Guten Tag,\n\nSie haben Ihren Zugang zum Kundenportal angefordert. Hier ist Ihr persönlicher Link:\n${await portalLink(b.id)}\n\nDer Link ist nur für Sie. Bitte nicht weitergeben. Wenn Sie den Zugang nicht angefordert haben, können Sie diese Mail ignorieren.\n\nMit freundlichen Grüßen\nIhr Team von Nexova Consulting`,
      meta: { angefordert: true },
    });
  }
}
