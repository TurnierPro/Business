import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { getDb, schema } from "../db";
import { einreihen } from "../jobs/warteschlange";
import { protokolliere } from "../protokoll";
import { datenOrdner } from "../pfade";
import { schreibeSeite, standardInhalt, SeitenInhalt } from "../sites/generator";
import { pruefeSeite } from "../sites/qualitaet";
import { schreibe, jsonAus } from "../adapters/ki";
import { PAKETE, PaketKey, euro } from "../pakete";
import { zahlungUeberStripe } from "../adapters/stripe";
import { inPostausgang } from "./postausgang";
import { betrieb, slugAus, zufallsCode, SYSTEM } from "./gemeinsam";

// Lieferung: Inhalte vom Kunden, Seite bauen, prüfen, Livegang nach Freigabe.

export async function projektPerToken(token: string) {
  const db = await getDb();
  const [p] = await db.select().from(schema.projekte).where(eq(schema.projekte.portalToken, token));
  return p ?? null;
}

export async function inhalteEinreichen(token: string, form: FormData): Promise<void> {
  const p = await projektPerToken(token);
  if (!p) throw new Error("Unbekannter Link");
  if (p.status !== "inhalte") throw new Error("Die Inhalte sind schon eingereicht. Für Änderungen melden Sie sich bitte bei uns.");
  const bilder: { datei: string; alt: string }[] = [];
  const ordner = datenOrdner("uploads", `projekt-${p.id}`);
  const dateien = form.getAll("fotos").filter((f): f is File => f instanceof File && f.size > 0);
  for (const [i, f] of dateien.entries()) {
    if (!f.type.startsWith("image/")) continue;
    const name = `foto-${i + 1}.${(f.name.split(".").pop() || "jpg").replace(/[^a-z0-9]/gi, "").slice(0, 4)}`;
    fs.writeFileSync(path.join(ordner, name), Buffer.from(await f.arrayBuffer()));
    bilder.push({ datei: name, alt: String(form.get(`alt-${i + 1}`) || "") });
  }
  const inhalte = {
    claim: String(form.get("claim") ?? ""),
    einleitung: String(form.get("einleitung") ?? ""),
    leistungen: String(form.get("leistungen") ?? ""),
    ueberUns: String(form.get("ueberUns") ?? ""),
    telefon: String(form.get("telefon") ?? ""),
    email: String(form.get("email") ?? ""),
    stellen: String(form.get("stellen") ?? ""),
    domain: String(form.get("domain") ?? ""),
    prioritaeten: String(form.get("prioritaeten") ?? ""),
    bilder,
  };
  // Bestehende Domain: Umzug anlegen (prüft den Auftrag des Kunden, bevor irgendetwas gespeichert wird)
  if (inhalte.domain) {
    const { umzugAnlegen } = await import("./umzug");
    await umzugAnlegen(p.id, {
      domain: inhalte.domain,
      weg: String(form.get("umzugWeg") ?? "selbst") as "selbst",
      anbieter: String(form.get("domainAnbieter") ?? "").trim(),
      mail: String(form.get("mailUeberDomain") ?? ""),
      vollmacht: form.get("umzugVollmacht") === "ja",
      rechte: form.get("rechteInhalte") === "ja",
      authInfo: String(form.get("authInfo") ?? ""),
      name: String(form.get("ansprechpartner") ?? ""),
    });
  }
  const onboarding = { mitarbeiter: String(form.get("mitarbeiter") ?? ""), umsatz: String(form.get("umsatz") ?? ""), verbraucher: String(form.get("verbraucher") ?? ""), rechteInhalte: form.get("rechteInhalte") === "ja" ? "bestaetigt" : "" };
  const db = await getDb();
  await db.update(schema.projekte).set({ inhalte, onboarding, status: "bau", domain: inhalte.domain || null, inhalteAm: new Date() }).where(eq(schema.projekte.id, p.id));
  await protokolliere("Kunde (Portal)", "Inhalte eingereicht", p.betriebId, `${bilder.length} Fotos`);
  await einreihen("bau", { projektId: p.id });
}

/** Baut die Seite aus Vorlage + Inhalten, prüft sie und legt bei Erfolg den Livegang zur Freigabe vor. */
export async function bau(projektId: number): Promise<string> {
  const db = await getDb();
  const [p] = await db.select().from(schema.projekte).where(eq(schema.projekte.id, projektId));
  if (!p) throw new Error("Projekt nicht gefunden");
  const b = await betrieb(p.betriebId);
  const roh = p.inhalte as Record<string, string> & { bilder?: { datei: string; alt: string }[] };
  const basis = standardInhalt({ ...b, telefon: roh.telefon || b.telefon, email: roh.email || b.email }, false);

  // Fehlende Bildbeschreibungen schreibt die KI vor; ohne KI ein neutraler Text. Max prüft vor dem Livegang.
  const bilder = (roh.bilder ?? []).map((x, i) => ({ datei: x.datei, alt: x.alt || `${b.name}: Foto ${i + 1} aus unserer Arbeit` }));
  const leistungen = roh.leistungen
    ? roh.leistungen.split("\n").map((z) => z.trim()).filter(Boolean).map((z) => {
        const [titel, ...rest] = z.split(":");
        return { titel: titel.trim(), text: rest.join(":").trim() || basis.leistungen.find((l) => l.titel === titel.trim())?.text || "" };
      })
    : basis.leistungen;
  const texte = await schreibe({
    zweck: "seitentexte",
    modell: "text",
    betriebId: b.id,
    aufgabe: 'Überarbeite diese Website-Texte für einen Handwerksbetrieb: klar, kurz, Sie-Form, keine erfundenen Fakten. Antworte nur mit JSON {"claim": string, "einleitung": string, "ueberUns": string}.',
    daten: { betrieb: b.name, gewerk: b.gewerk, ort: b.ort, claim: roh.claim || basis.claim, einleitung: roh.einleitung || basis.einleitung, ueberUns: roh.ueberUns || basis.ueberUns },
    ersatz: JSON.stringify({ claim: roh.claim || basis.claim, einleitung: roh.einleitung || basis.einleitung, ueberUns: roh.ueberUns || basis.ueberUns }),
  });
  const t = jsonAus<{ claim: string; einleitung: string; ueberUns: string }>(texte.text, { claim: basis.claim, einleitung: basis.einleitung, ueberUns: basis.ueberUns });
  const mitKarriere = ["M", "L"].includes(p.paket);
  const inhalt: SeitenInhalt = {
    ...basis,
    ...t,
    leistungen,
    bilder,
    karriere: mitKarriere
      ? (roh.stellen || "Geselle (m/w/d)\nAuszubildende (m/w/d)").split("\n").filter(Boolean).map((s) => ({ titel: s.trim(), text: "Feste Arbeitszeiten, Firmenfahrzeug, ein Team, das zusammenhält. Bewerben geht per Handy in zwei Minuten." }))
      : undefined,
  };

  const slug = p.seitenSlug ?? `${slugAus(b.name)}-${zufallsCode(4).toLowerCase()}`;
  schreibeSeite(slug, inhalt);
  // Fotos aus dem Portal in die Seite übernehmen
  const quelle = datenOrdner("uploads", `projekt-${p.id}`);
  const ziel = datenOrdner("sites", slug, "bild");
  for (const x of bilder) if (fs.existsSync(path.join(quelle, x.datei))) fs.copyFileSync(path.join(quelle, x.datei), path.join(ziel, x.datei));

  const [vorhanden] = await db.select().from(schema.seiten).where(eq(schema.seiten.slug, slug));
  if (!vorhanden) await db.insert(schema.seiten).values({ slug, betriebId: b.id, art: "kunde", zugangscode: zufallsCode(6) });

  const pruefung = pruefeSeite(slug);
  const allesOk = pruefung.every((x) => x.ok);
  await db.update(schema.projekte).set({ seitenSlug: slug, pruefung, status: allesOk ? "bereit" : "pruefung" }).where(eq(schema.projekte.id, projektId));
  await protokolliere(SYSTEM, allesOk ? "Seite gebaut, Prüfung bestanden" : "Seite gebaut, Prüfung NICHT bestanden", b.id, pruefung.filter((x) => !x.ok).map((x) => x.detail).join(" · "));

  if (allesOk) {
    const bfsg = bfsgHinweis(p.onboarding);
    await inPostausgang({
      betriebId: b.id,
      projektId,
      kanal: "livegang",
      zweck: "livegang",
      empfaenger: p.domain || roh.domain || "(Domain fehlt)",
      betreff: `Livegang ${b.name} (${PAKETE[p.paket as PaketKey].name})`,
      hinweise: bfsg ? [bfsg] : [],
      text: `Die Seite ist gebaut und hat alle ${pruefung.length} Prüfungen bestanden. Vorschau ansehen, dann freigeben.\n\nNach der Freigabe: Seite geht live, Betreuung startet, der Kunde wird um Abnahme gebeten. Die Schlusszahlung kommt nach der Abnahme.`,
      meta: { projektId, slug },
    });
  }
  return allesOk ? "Bereit zum Livegang" : "Prüfung nicht bestanden";
}

/**
 * BFSG: gilt, wenn Verbraucher auf der Seite einen Vertrag anbahnen können (z. B. Terminbuchung)
 * und der Betrieb kein Kleinstunternehmen ist (unter 10 Beschäftigte und höchstens 2 Mio. € Umsatz).
 */
export function bfsgHinweis(o: Record<string, string>): string | null {
  if (!o.verbraucher) return null;
  const klein = Number(o.mitarbeiter) < 10 && o.umsatz === "bis2";
  if (o.verbraucher === "nein") return null;
  if (klein) return "BFSG: Kleinstunternehmen, Ausnahme greift voraussichtlich. Trotzdem WCAG 2.2 AA wie zugesagt.";
  return "BFSG greift voraussichtlich (Verbraucherfunktion, kein Kleinstunternehmen): Erklärung zur Barrierefreiheit (Anlage 3) einbinden und Fremdtools wie die Terminbuchung prüfen.";
}

export async function livegangDurchfuehren(projektId: number): Promise<void> {
  const db = await getDb();
  const [p] = await db.select().from(schema.projekte).where(eq(schema.projekte.id, projektId));
  if (!p?.seitenSlug) throw new Error("Projekt ohne Seite");
  await db.update(schema.seiten).set({ zugangscode: null }).where(eq(schema.seiten.slug, p.seitenSlug));
  await db.update(schema.projekte).set({ status: "live", liveAm: new Date(), aboAb: new Date() }).where(eq(schema.projekte.id, projektId));
  await protokolliere(SYSTEM, "Livegang durchgeführt, Betreuung läuft", p.betriebId, p.domain ?? p.seitenSlug);
  // Bestehende Domain: erst umstellen, dann Abnahme. Sonst Abnahme sofort.
  // Schlusszahlung erst nach Abnahme (§ 641 BGB).
  const { umzugVon, umstellungStarten } = await import("./umzug");
  const u = umzugVon(p);
  if (u && u.status !== "umgestellt") await umstellungStarten(projektId);
  else {
    const { abnahmeAnfordern } = await import("./vertrag");
    await abnahmeAnfordern(projektId, SYSTEM);
  }
  if (!p.angebotId || !zahlungUeberStripe()) return;
  const [a] = await db.select().from(schema.angebote).where(eq(schema.angebote.id, p.angebotId));
  if (!a) return;
  // Mit Stripe: Abo-Start nach Freigabe (Betreuung beginnt mit dem Livegang)
  const b = await betrieb(p.betriebId);
  const startAb = p.paket === "S" ? new Date(Date.now() + 91 * 864e5) : new Date();
  await inPostausgang({
    betriebId: p.betriebId,
    projektId,
    kanal: "zahlung",
    zweck: "betreuung_start",
    empfaenger: `Stripe: ${b.name}`,
    betreff: `Betreuung starten: ${b.name}`,
    text: `Monatliche Betreuung ${euro(a.monatlich)} netto per Stripe, erste Abbuchung ${startAb.toLocaleDateString("de-DE")}${p.paket === "S" ? " (erste 3 Monate inklusive)" : ""}.`,
    meta: { projektId, monatlich: a.monatlich, startAb: startAb.toISOString() },
  });
}
