import fs from "node:fs";
import path from "node:path";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { getDb, schema } from "./db";
import { naechsterJob } from "./jobs/warteschlange";
import { HANDLER } from "./jobs/handler";
import * as akquise from "./ablauf/akquise";
import * as post from "./ablauf/postausgang";
import * as verkauf from "./ablauf/verkauf";
import * as lieferung from "./ablauf/lieferung";
import * as betrieb from "./ablauf/betrieb";
import { datenOrdner } from "./pfade";
import { pruefeSeite } from "./sites/qualitaet";
import { loescheSeite } from "./sites/generator";
import { GefundenerBetrieb } from "./adapters/research";

// Beispieldaten: erfundene Betriebe in allen Phasen des Ablaufs, damit man sieht, wie alles zusammenhängt.
// Alles läuft durch die echten Abläufe (mit Simulatoren). Nur lokal erlaubt, nie auf der echten Datenbank.

export const QUELLE = "Beispiel";

export function beispieleErlaubt(): boolean {
  return !process.env.DATABASE_URL || process.env.BEISPIELDATEN === "ja";
}

type Beispiel = GefundenerBetrieb & { email: string };

const B = (name: string, gewerk: string, anrede: string, inhaber: string, strasse: string, plz: string, ort: string, mitarbeiter: number, score: number, scoreGrund: string): Beispiel => ({
  name,
  gewerk,
  anrede,
  inhaber,
  strasse,
  plz,
  ort,
  mitarbeiter,
  score,
  scoreGrund,
  telefon: `${plz.startsWith("70") ? "0711" : "0721"} 555 ${String(score).padStart(3, "0")}`,
  website: "",
  email: `info@${name.toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.example`,
});

const BETRIEBE = {
  live: B("Sanitär Muster GmbH", "SHK", "Herr", "Thomas Muster", "Musterweg 12", "76185", "Karlsruhe", 14, 86, "Keine Website, zwei offene Stellen bei der Arbeitsagentur."),
  bereit: B("Elektro Beispiel KG", "Elektro", "Frau", "Sabine Beispiel", "Probestraße 3", "76137", "Karlsruhe", 22, 74, "Website ohne Karriereseite und ohne Anfrageformular."),
  pruefung: B("Schlosserei Prüfstand GmbH", "Ausbau", "Herr", "Karl Prüfstand", "Eisenweg 4", "76189", "Karlsruhe", 11, 69, "Seite nicht fürs Handy, keine Bildbeschreibungen."),
  inhalte: B("Malerbetrieb Probe GmbH", "Maler", "Herr", "Erik Probe", "Farbweg 21", "70173", "Stuttgart", 31, 79, "Sucht Azubis, Website nicht fürs Handy eingerichtet."),
  rechnung: B("Heizung Musterle GmbH", "SHK", "Frau", "Petra Musterle", "Kesselweg 9", "76131", "Karlsruhe", 18, 64, "Website veraltet, kein Klick zum Anruf."),
  gross: B("Dach & Wand Exempel GmbH", "Ausbau", "Herr", "Jan Exempel", "Ziegelstraße 15", "70469", "Stuttgart", 44, 82, "Viel Büroarbeit, drei offene Stellen."),
  unterschrift: B("Kfz-Werkstatt Demo", "Kfz", "Herr", "Murat Demo", "Motorstraße 2", "70469", "Stuttgart", 6, 71, "Terminvergabe nur per Telefon, keine Website."),
  angebot: B("Schreinerei Test & Sohn", "Schreiner", "Herr", "Jonas Test", "Holzgasse 7", "76227", "Karlsruhe", 8, 68, "Gute Bewertungen, aber kaum sichtbar bei Google."),
  besuch: B("Fliesen Vorlage GmbH", "Ausbau", "Frau", "Ina Vorlage", "Kachelweg 5", "76139", "Karlsruhe", 9, 66, "Kein Anfrageformular, keine Fotos von Arbeiten."),
  brief: B("Elektro Muster-Lux GmbH", "Elektro", "Herr", "Lukas Lux", "Stromstraße 8", "70178", "Stuttgart", 16, 77, "Keine Website, gute Google-Bewertungen."),
  gesperrt: B("Sanitär Widerspruch GmbH", "SHK", "Herr", "Paul Nein", "Ruheweg 1", "76133", "Karlsruhe", 12, 58, "Website ohne Impressum."),
  nein: B("Bäder Nichtinteresse KG", "SHK", "Frau", "Nora Keinbedarf", "Wannenweg 3", "70176", "Stuttgart", 5, 41, "Zu klein, kaum Bedarf erkennbar."),
  neu: [
    B("Haustechnik Platzhalter GmbH", "SHK", "Herr", "Felix Platzhalter", "Rohrweg 10", "76135", "Karlsruhe", 27, 81, "Drei offene Stellen, Website von 2015."),
    B("Kfz-Service Fiktiv", "Kfz", "Herr", "Can Fiktiv", "Werkstattweg 6", "70435", "Stuttgart", 9, 73, "HU/AU-Termine nur telefonisch."),
    B("Malerei Beispielhaft", "Maler", "Frau", "Lea Beispielhaft", "Pinselgasse 2", "76199", "Karlsruhe", 7, 62, "Keine Karriereseite."),
    B("Zimmerei Muster & Partner", "Schreiner", "Herr", "Ole Muster", "Balkenweg 11", "70372", "Stuttgart", 19, 70, "Sucht Zimmerer, keine Stellenanzeigen online."),
  ],
};

const MAX = "Max Steiner (Beispiel)";
const DANIEL = "Daniel Lück (Beispiel)";

async function warte(): Promise<void> {
  const db = await getDb();
  for (let i = 0; i < 500; i++) {
    if (await naechsterJob(HANDLER)) continue;
    const [offen] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.jobs)
      .where(and(inArray(schema.jobs.status, ["wartet", "laeuft"]), ne(schema.jobs.art, "beispieldaten"), sql`${schema.jobs.faelligAm} <= now()`));
    if (!offen.n) return;
    await new Promise((r) => setTimeout(r, 300));
  }
}

async function anlegen(b: Beispiel): Promise<number> {
  const r = await akquise.legeBetriebAn(b, QUELLE, "Wochenlauf (Beispiel)");
  if (!r.id) throw new Error(`${b.name} ${r.grund}`);
  return r.id;
}

async function offen(betriebId: number, zweck: string) {
  const db = await getDb();
  const [e] = await db.select().from(schema.postausgang).where(and(eq(schema.postausgang.betriebId, betriebId), eq(schema.postausgang.zweck, zweck), eq(schema.postausgang.status, "zur_freigabe")));
  if (!e) throw new Error(`Kein offener Eintrag ${zweck} für Betrieb ${betriebId}`);
  return e;
}

async function freigeben(betriebId: number, zweck: string, wer = DANIEL) {
  const e = await offen(betriebId, zweck);
  await post.freigeben(e.id, wer);
  await warte();
  return e;
}

async function bisBrief(b: Beispiel): Promise<number> {
  const id = await anlegen(b);
  await akquise.einstufen(id, true, DANIEL);
  await warte();
  return id;
}

async function bisBesuch(b: Beispiel): Promise<number> {
  const id = await bisBrief(b);
  await freigeben(id, "akquise_brief");
  const db = await getDb();
  await db.update(schema.betriebe).set({ besuchAb: new Date(Date.now() - 2 * 864e5) }).where(eq(schema.betriebe.id, id));
  return id;
}

async function bisAngebotEntwurf(b: Beispiel): Promise<number> {
  const id = await bisBesuch(b);
  const audio = new File([Buffer.from("Beispielaufnahme")], "termin.webm", { type: "audio/webm" });
  await verkauf.terminAufnehmen({ betriebId: id, datei: audio, einwilligung: true, wer: DANIEL });
  await warte();
  return id;
}

async function bisAngebotVersendet(b: Beispiel): Promise<{ id: number; angebotId: number }> {
  const id = await bisAngebotEntwurf(b);
  const e = await freigeben(id, "angebot");
  return { id, angebotId: Number(e.meta.angebotId) };
}

async function bisProjekt(b: Beispiel): Promise<{ id: number; projektId: number }> {
  const { id, angebotId } = await bisAngebotVersendet(b);
  await verkauf.unterschriftEingegangen(angebotId, `Kunde: ${b.inhaber} (Beispiel)`);
  await freigeben(id, "rechnung", MAX);
  const projektId = await verkauf.zahlungEingegangen(angebotId, "Zahlungseingang (Beispiel)");
  await freigeben(id, "kickoff", MAX);
  return { id, projektId };
}

async function inhalteSenden(projektId: number, b: Beispiel) {
  const db = await getDb();
  const [p] = await db.select().from(schema.projekte).where(eq(schema.projekte.id, projektId));
  const f = new FormData();
  f.set("claim", `${b.gewerk === "Elektro" ? "Strom, Licht und Technik" : "Ihr Fachbetrieb"} aus ${b.ort}.`);
  f.set("einleitung", `${b.name} arbeitet seit vielen Jahren für Privatkunden und Betriebe in ${b.ort} und Umgebung.`);
  f.set("telefon", b.telefon ?? "");
  f.set("email", b.email);
  f.set("domain", b.email.split("@")[1]);
  f.set("stellen", "Geselle (m/w/d)\nAusbildung 2027 (m/w/d)");
  await lieferung.inhalteEinreichen(p.portalToken, f);
  await warte();
}

export async function beispieleLaden(): Promise<string> {
  if (!beispieleErlaubt()) throw new Error("Beispieldaten nur auf der lokalen Datenbank.");
  const db = await getDb();
  const [schon] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.betriebe).where(eq(schema.betriebe.quelle, QUELLE));
  if (schon.n) return "Beispieldaten sind schon geladen.";

  // Neue Leads aus dem Wochenlauf
  for (const b of BETRIEBE.neu) await anlegen(b);
  // Nicht interessant und Widerspruch
  await akquise.einstufen(await anlegen(BETRIEBE.nein), false, DANIEL);
  const gesperrt = await bisBesuch(BETRIEBE.gesperrt);
  await akquise.widerspruch(gesperrt, DANIEL, "Anruf: möchte keine Post mehr (Beispiel)");
  // Brief wartet auf Freigabe
  await bisBrief(BETRIEBE.brief);
  // Brief raus, Besuch fällig
  await bisBesuch(BETRIEBE.besuch);
  // Termin war da, Angebot wartet auf Freigabe
  await bisAngebotEntwurf(BETRIEBE.angebot);
  // Angebot versendet, wartet auf Unterschrift
  await bisAngebotVersendet(BETRIEBE.unterschrift);
  // Unterschrieben, Rechnung über Anzahlung wartet auf Freigabe
  {
    const { angebotId } = await bisAngebotVersendet(BETRIEBE.rechnung);
    await verkauf.unterschriftEingegangen(angebotId, `Kunde: ${BETRIEBE.rechnung.inhaber} (Beispiel)`);
  }
  // Individuelles Angebot (L plus Zusatzmodule): Rechnung über 10.000 €, eine von zwei Freigaben erteilt
  {
    const id = await bisBesuch(BETRIEBE.gross);
    const [a] = await db.insert(schema.angebote).values({ betriebId: id, paket: "L", einmalig: 890000 * 2, monatlich: 59000 * 2, status: "versendet" }).returning();
    await verkauf.unterschriftEingegangen(a.id, `Kunde: ${BETRIEBE.gross.inhaber} (Beispiel)`);
    await post.freigeben((await offen(id, "rechnung")).id, MAX);
  }
  // Projekt wartet auf Inhalte vom Kunden
  await bisProjekt(BETRIEBE.inhalte);
  // Projekt gebaut, Livegang wartet auf Freigabe
  {
    const { projektId } = await bisProjekt(BETRIEBE.bereit);
    await inhalteSenden(projektId, BETRIEBE.bereit);
  }
  // Projekt gebaut, Prüfung nicht bestanden (Bild ohne Beschreibung)
  {
    const { id, projektId } = await bisProjekt(BETRIEBE.pruefung);
    await inhalteSenden(projektId, BETRIEBE.pruefung);
    const [p] = await db.select().from(schema.projekte).where(eq(schema.projekte.id, projektId));
    const datei = path.join(datenOrdner("sites"), p.seitenSlug!, "index.html");
    fs.writeFileSync(datei, fs.readFileSync(datei, "utf8").replace("<h2>Über uns</h2>", '<img src="{{BASIS}}/bild/werkstatt.jpg{{Q}}"><h2>Über uns</h2>'));
    const livegang = await offen(id, "livegang");
    await post.ablehnen(livegang.id, "Prüfung nachträglich nicht bestanden (Beispiel)", MAX);
    await db.update(schema.projekte).set({ status: "pruefung", pruefung: pruefeSeite(p.seitenSlug!) }).where(eq(schema.projekte.id, projektId));
  }
  // Projekt live, Schlussrechnung versendet
  {
    const { id, projektId } = await bisProjekt(BETRIEBE.live);
    await inhalteSenden(projektId, BETRIEBE.live);
    await freigeben(id, "livegang", MAX);
    await freigeben(id, "schlussrechnung", MAX);
  }
  // Systemmeldungen
  await betrieb.backup();
  await betrieb.ruecksicherung();
  await betrieb.tagesbericht();
  return "Beispieldaten geladen: 16 Betriebe in allen Phasen.";
}

export async function beispieleEntfernen(): Promise<string> {
  if (!beispieleErlaubt()) throw new Error("Beispieldaten nur auf der lokalen Datenbank.");
  const db = await getDb();
  const ids = (await db.select({ id: schema.betriebe.id }).from(schema.betriebe).where(eq(schema.betriebe.quelle, QUELLE))).map((x) => x.id);
  if (!ids.length) return "Keine Beispieldaten vorhanden.";
  const seiten = await db.select().from(schema.seiten).where(inArray(schema.seiten.betriebId, ids));
  for (const s of seiten) loescheSeite(s.slug);
  const projekte = await db.select().from(schema.projekte).where(inArray(schema.projekte.betriebId, ids));
  for (const p of projekte) fs.rmSync(path.join(datenOrdner("uploads"), `projekt-${p.id}`), { recursive: true, force: true });
  await db.delete(schema.rechnungen).where(inArray(schema.rechnungen.betriebId, ids));
  await db.delete(schema.projekte).where(inArray(schema.projekte.betriebId, ids));
  await db.delete(schema.betriebe).where(inArray(schema.betriebe.id, ids));
  await db.delete(schema.protokoll).where(inArray(schema.protokoll.betriebId, ids));
  await db.delete(schema.sperrliste).where(sql`${schema.sperrliste.grund} like '%(Beispiel)%'`);
  await db.delete(schema.simulatorPost);
  return `${ids.length} Beispiel-Betriebe entfernt.`;
}
