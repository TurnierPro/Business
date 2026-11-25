import crypto from "node:crypto";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { getDb, schema } from "./db";
import { basisUrl } from "./ablauf/gemeinsam";

// Kundenportal: Jeder Kunde sieht über seinen geheimen Link den Stand seines Projekts,
// seine Unterlagen und Rechnungen. Grundregel: Sichtbar ist nur, was wir freigegeben und verschickt haben.

/** Adresse des Kundenportals: eigene Adresse (PORTAL_URL), sonst dieselbe wie Levarex OS (lokal). */
export function portalBasis(): string {
  return (process.env.PORTAL_URL || basisUrl()).replace(/\/$/, "");
}

export async function portalLink(betriebId: number): Promise<string> {
  const db = await getDb();
  const [b] = await db.select({ token: schema.betriebe.portalToken }).from(schema.betriebe).where(eq(schema.betriebe.id, betriebId));
  let token = b?.token;
  if (!token) {
    token = crypto.randomBytes(24).toString("base64url");
    await db.update(schema.betriebe).set({ portalToken: token }).where(eq(schema.betriebe.id, betriebId));
  }
  return `${portalBasis()}/portal/k/${token}`;
}

/** Betrieb zum Link: Hauptlink des Betriebs oder persönlicher Zugang einer Person (nicht gesperrt). */
export async function betriebPerPortal(token: string) {
  return (await zugangPerPortal(token))?.betrieb ?? null;
}

export async function zugangPerPortal(token: string) {
  if (!token || token.length < 20) return null;
  const db = await getDb();
  const [b] = await db.select().from(schema.betriebe).where(eq(schema.betriebe.portalToken, token));
  if (b) return b.status !== "gesperrt" ? { betrieb: b, person: b.inhaber ?? null } : null;
  const [z] = await db.select().from(schema.portalZugaenge).where(eq(schema.portalZugaenge.token, token));
  if (!z || z.gesperrtAm) return null;
  const [zb] = await db.select().from(schema.betriebe).where(eq(schema.betriebe.id, z.betriebId));
  if (!zb || zb.status === "gesperrt") return null;
  await db.update(schema.portalZugaenge).set({ zuletztAm: new Date() }).where(eq(schema.portalZugaenge.id, z.id));
  return { betrieb: zb, person: z.name };
}

/** Persönlichen Zugang für eine weitere Person anlegen. Der Link geht per Mail über die Freigabe raus. */
export async function zugangAnlegen(o: { betriebId: number; name: string; email: string; kontaktId?: number | null }, wer: string): Promise<number> {
  const name = o.name.trim();
  const email = o.email.trim().toLowerCase();
  if (name.length < 2) throw new Error("Name fehlt.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Keine gültige E-Mail-Adresse.");
  const db = await getDb();
  const doppelt = (await db.select().from(schema.portalZugaenge).where(eq(schema.portalZugaenge.betriebId, o.betriebId))).find((z) => z.email === email && !z.gesperrtAm);
  if (doppelt) throw new Error("Diese Person hat schon einen Zugang.");
  const token = crypto.randomBytes(24).toString("base64url");
  const [z] = await db.insert(schema.portalZugaenge).values({ betriebId: o.betriebId, kontaktId: o.kontaktId ?? null, name, email, token, erstelltVon: wer }).returning();
  const { inPostausgang } = await import("./ablauf/postausgang");
  await inPostausgang({
    betriebId: o.betriebId,
    kanal: "mail",
    zweck: "portal_zugang",
    empfaenger: email,
    betreff: "Ihr Zugang zum Kundenportal Mein Levarex",
    text: `Guten Tag ${name},\n\nSie haben jetzt einen eigenen Zugang zum Kundenportal Ihres Betriebs. Dort sehen Sie den Stand des Projekts und alle Unterlagen:\n${portalBasis()}/portal/k/${token}\n\nDer Link ist nur für Sie. Bitte nicht weitergeben.\n\nMit freundlichen Grüßen\nIhr Team von Levarex Consulting`,
    meta: { zugangId: z.id },
  });
  const { protokolliere } = await import("./protokoll");
  await protokolliere(wer, `Portal-Zugang angelegt für ${name}`, o.betriebId);
  return z.id;
}

export async function zugangSperren(id: number, wer: string): Promise<void> {
  const db = await getDb();
  const [z] = await db.update(schema.portalZugaenge).set({ gesperrtAm: new Date() }).where(eq(schema.portalZugaenge.id, id)).returning();
  if (!z) throw new Error("Zugang nicht gefunden");
  const { protokolliere } = await import("./protokoll");
  await protokolliere(wer, `Portal-Zugang gesperrt: ${z.name}`, z.betriebId);
}

const FUER_KUNDEN = ["angebot", "protokoll", "rechnung", "auftragsbestaetigung", "rahmenvertrag", "leistungsschein_erstellung", "leistungsschein_betrieb", "av_vertrag", "pilotvereinbarung", "sepa_mandat", "domain_vollmacht", "foto_einwilligung", "abnahmeprotokoll", "monatsreport", "umzugsanleitung"];

/** Alle Einträge, die an diesen Kunden wirklich verschickt wurden (nach Qualitätskontrolle und Freigabe). */
async function versendet(betriebId: number) {
  const db = await getDb();
  return db
    .select()
    .from(schema.postausgang)
    .where(and(eq(schema.postausgang.betriebId, betriebId), eq(schema.postausgang.status, "versendet")))
    .orderBy(desc(schema.postausgang.versendetAm));
}

// Was der Kunde selbst im Portal unterschrieben hat, sieht er sofort (es verlässt Levarex nicht)
const VOM_KUNDEN = ["sepa_mandat", "foto_einwilligung"];

export async function sichtbareDokumente(betriebId: number) {
  const db = await getDb();
  const post = await versendet(betriebId);
  const ids = [...new Set(post.flatMap((p) => p.anhaenge))];
  const eigene = await db.select().from(schema.dokumente).where(and(eq(schema.dokumente.betriebId, betriebId), inArray(schema.dokumente.art, VOM_KUNDEN)));
  const gesendet = ids.length ? await db.select().from(schema.dokumente).where(and(inArray(schema.dokumente.id, ids), eq(schema.dokumente.betriebId, betriebId))) : [];
  const imPortal = eigene.filter((d) => !ids.includes(d.id) && (d.art !== "sepa_mandat" || (d.daten as { kanal?: string }).kanal !== "tablet"));
  const doks = [...gesendet, ...imPortal];
  if (!doks.length) return [];
  const versandAm = (id: number) => post.find((p) => p.anhaenge.includes(id))?.versendetAm ?? null;
  return doks
    .filter((d) => FUER_KUNDEN.includes(d.art))
    .map((d) => ({ ...d, versendetAm: versandAm(d.id) ?? (VOM_KUNDEN.includes(d.art) ? d.erstelltAm : null) }))
    // Neueste Sendung zuerst; innerhalb einer Sendung in fester Reihenfolge (Bestätigung, Rahmenvertrag, Leistungsscheine …)
    .sort((a, b) => (b.versendetAm?.getTime() ?? 0) - (a.versendetAm?.getTime() ?? 0) || REIHENFOLGE.indexOf(a.art) - REIHENFOLGE.indexOf(b.art) || a.id - b.id);
}
const REIHENFOLGE = ["auftragsbestaetigung", "angebot", "protokoll", "rahmenvertrag", "leistungsschein_erstellung", "leistungsschein_betrieb", "av_vertrag", "pilotvereinbarung", "sepa_mandat", "rechnung", "abnahmeprotokoll", "monatsreport", "umzugsanleitung", "domain_vollmacht", "foto_einwilligung"];

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
  const nachBau = p && ["bereit", "live", "beendet"].includes(p.status);
  const [besuch] = await db.select({ am: schema.besuche.am }).from(schema.besuche).where(eq(schema.besuche.betriebId, betriebId)).orderBy(desc(schema.besuche.am)).limit(1);
  const protokollVersendet = angebotVersendet?.anhaenge.length ? (await db.select({ art: schema.dokumente.art }).from(schema.dokumente).where(inArray(schema.dokumente.id, angebotVersendet.anhaenge))).some((d) => d.art === "protokoll") : false;
  // Je Schritt zwei Texte: erledigt (Vergangenheit) und offen (was als Nächstes passiert)
  const s = (titel: string, erledigt: boolean, fertig: string, offen: string, datum: Date | null): Schritt => ({ titel, text: erledigt ? fertig : offen, erledigt, datum });
  const angebotText = angebotVersendet
    ? protokollVersendet ? "Protokoll, Maßnahmenplan und Angebot liegen unten bei Ihren Unterlagen." : "Das Angebot liegt unten bei Ihren Unterlagen."
    : "Beim Termin vorgelegt. Die Unterlagen schicken wir Ihnen zusammen mit der Auftragsbestätigung.";
  return [
    s("Gespräch vor Ort", termine.length > 0 || !!besuch || !!a?.unterschriebenAm || !!angebotVersendet, "Wir haben Ihren Betrieb kennengelernt und Ziele festgehalten.", "Wir lernen Ihren Betrieb kennen und halten fest, was Sie am meisten entlastet.", termine[0]?.datum ?? besuch?.am ?? null),
    s("Angebot erhalten", !!angebotVersendet || !!a?.unterschriebenAm, angebotText, "Sie bekommen unser Angebot per E-Mail und hier im Portal.", angebotVersendet?.versendetAm ?? null),
    s("Angebot angenommen", !!a?.unterschriebenAm, "Danke für Ihr Vertrauen.", "Sie unterschreiben Rahmenvertrag und Leistungsscheine, wenn alles passt.", a?.unterschriebenAm ?? null),
    s("Anzahlung eingegangen", !!a?.angezahltAm, "Damit starten wir Ihr Projekt.", "Mit der ersten Rate starten wir Ihr Projekt.", a?.angezahltAm ?? null),
    s("Inhalte geliefert", !!p?.inhalteAm, "Texte und Fotos von Ihnen sind da.", "Sie schicken uns Texte und Fotos, am einfachsten hier unter „Dateien“.", p?.inhalteAm ?? null),
    s("Website gebaut und geprüft", !!nachBau, "Ladezeit, Barrierefreiheit, Formulare und Rechtstexte geprüft. Sie sehen die Seite als Vorschau.", "Wir bauen Ihre Website und prüfen Ladezeit, Barrierefreiheit, Formulare und Rechtstexte.", null),
    s("Website abgenommen", ["abgenommen", "vorbehalt", "fiktion"].includes(p?.abnahmeStatus ?? ""), "Sie haben die Vorschau geprüft und abgenommen.", "Sie prüfen die Vorschau und nehmen sie ab.", p?.abnahmeAm ?? null),
    s("Website live", !!p?.liveAm, "Ihre Seite ist unter Ihrer Domain erreichbar.", "Nach Ihrer Abnahme geht die Seite unter Ihrer Domain online.", p?.liveAm ?? null),
    s("Betreuung läuft", !!p?.aboAb, "Wir kümmern uns um Technik, Sicherheit und Änderungen.", "Danach kümmern wir uns um Technik, Sicherheit und Änderungen.", p?.aboAb ?? null),
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
  const sichtbareRechnungen = rechnungen
    .filter((r) => verschickteNummern.has(r.nummer))
    .map((r) => ({ ...r, dokumentId: doks.find((d) => d.art === "rechnung" && (d.daten as { nummer?: string }).nummer === r.nummer)?.id ?? null }));
  const angebot = angebote[0];
  const projekt = projekte[0];
  const [seite] = projekt?.seitenSlug && projekt.status === "live" ? await db.select().from(schema.seiten).where(eq(schema.seiten.slug, projekt.seitenSlug)) : [];
  // Vorschau zur Abnahme (noch nicht öffentlich, mit Zugangscode)
  const [vorschauSeite] = projekt?.seitenSlug && projekt.status === "bereit" ? await db.select().from(schema.seiten).where(eq(schema.seiten.slug, projekt.seitenSlug)) : [];
  const { lieferfristBis, bereitgestellt, mitwirkungsliste } = await import("./ablauf/lieferfrist");
  const { basisUrl } = await import("./ablauf/gemeinsam");
  return {
    schritte: schr,
    dokumente: doks.filter((d) => d.art !== "rechnung"),
    // Rechnungen erst nach Freigabe und Versand (eigene und Lexware-Rechnungen)
    rechnungen: sichtbareRechnungen,
    // Das zuletzt verschickte, noch offene Angebot (ein neuer Entwurf versteckt es nicht)
    angebotOffen: angebote.find((x) => x.status === "versendet") ?? null,
    // Unterschriebener Auftrag (auch ohne Projekt, das erst mit der Anzahlung entsteht): Dateien und Einwilligungen gehen schon
    auftrag: angebote.find((x) => ["unterschrieben", "angezahlt", "abgeschlossen"].includes(x.status)) ?? null,
    // Erste Rate: verschickte, noch offene Anzahlungsrechnung (der Kunde überweist; Zahlung per Karte gibt es nicht)
    anzahlungOffen: sichtbareRechnungen.find((r) => r.art === "anzahlung" && r.status === "offen") ?? null,
    inhalteOffen: projekt?.status === "inhalte" ? projekt : null,
    // Abnahme erst, wenn die Aufforderung verschickt ist (dann läuft die Frist)
    abnahmeOffen: projekt?.abnahmeStatus === "offen" && projekt.abnahmeFrist ? projekt : null,
    anfragen,
    tickets,
    projekt,
    vorschau: vorschauSeite ? `/vorschau/${vorschauSeite.slug}${vorschauSeite.zugangscode ? `?code=${vorschauSeite.zugangscode}` : ""}` : null,
    lieferfrist: projekt && !bereitgestellt(projekt) ? lieferfristBis(projekt) : null,
    // Nur solange der Kunde noch etwas hochladen kann; danach würde „fehlt“ ohne Weg zum Nachreichen nur verunsichern
    mitwirkung: projekt?.status === "inhalte" ? mitwirkungsliste(projekt) : [],
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
 * legt Levarex OS eine Mail mit dem Link in den Postausgang (Freigabe wie immer). Die Antwort ist
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
      text: `${(await import("./ablauf/gemeinsam")).mailAnrede(b)}\n\nSie haben Ihren Zugang zum Kundenportal angefordert. Hier ist Ihr persönlicher Link:\n${await portalLink(b.id)}\n\nDer Link ist nur für Sie. Bitte nicht weitergeben. Wenn Sie den Zugang nicht angefordert haben, können Sie diese Mail ignorieren.\n\nMit freundlichen Grüßen\nIhr Team von Levarex Consulting`,
      meta: { angefordert: true },
    });
  }
}

/** Module, für die der Betrieb im Portal Interesse gemeldet hat und Daniel noch nicht angerufen hat (offene Aufgabe). */
export async function gemeldeteInteressen(betriebId: number): Promise<string[]> {
  const db = await getDb();
  const offen = await db.select({ titel: schema.aktivitaeten.titel }).from(schema.aktivitaeten).where(and(eq(schema.aktivitaeten.betriebId, betriebId), isNull(schema.aktivitaeten.erledigtAm)));
  return offen.map((a) => /^Interesse an (.+): anrufen$/.exec(a.titel)?.[1]).filter((x): x is string => !!x);
}
