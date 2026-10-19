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
import { htmlZuPdf } from "./docs/render";
import { druckSeite, esc } from "./docs/basis";
import * as finanzagenten from "./ablauf/finanzagenten";
import * as vertrag from "./ablauf/vertrag";
import * as berichte from "./ablauf/berichte";
import { AGB_VERSION } from "./recht";

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
  await warte();
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
  await verkauf.unterschriftEingegangen(angebotId, `Kunde: ${b.inhaber} (Kundenportal, Beispiel)`, { name: b.inhaber ?? b.name, am: new Date().toISOString(), agbVersion: AGB_VERSION, unternehmer: true });
  await freigeben(id, "auftragsbestaetigung");
  const projektId = await verkauf.zahlungEingegangen(angebotId, "Stripe (Beispiel)");
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
  f.set("mitarbeiter", "14");
  f.set("umsatz", "bis2");
  f.set("verbraucher", "nein");
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
  // Im Portal angenommen, Anzahlung über Stripe noch offen
  {
    const { angebotId } = await bisAngebotVersendet(BETRIEBE.rechnung);
    await verkauf.unterschriftEingegangen(angebotId, `Kunde: ${BETRIEBE.rechnung.inhaber} (Beispiel)`, { name: BETRIEBE.rechnung.inhaber ?? BETRIEBE.rechnung.name, am: new Date().toISOString(), agbVersion: AGB_VERSION, unternehmer: true });
  }
  // Vor Ort im Konfigurator zusammengestellt: Paket L mit 4 Modulen und Fotoshooting, wartet auf Freigabe
  {
    const id = await bisBesuch(BETRIEBE.gross);
    await verkauf.erstelleAngebot({
      betriebId: id,
      auswahl: { paket: "L", module: ["m1", "m2", "m5", "m7"], zusaetze: ["foto"] },
      einleitung: "vielen Dank für das gute Gespräch heute bei Ihnen in Stuttgart. Wie besprochen erhalten Sie unser Angebot mit den Bausteinen, die wir gemeinsam ausgewählt haben.",
      wer: DANIEL,
    });
    await warte();
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
  // Projekt live und abgenommen: Schlusszahlung über Stripe, Betreuung als Abo (alles nach Freigabe),
  // Anfragen über die Website und ein Monatsreport, der auf Freigabe wartet
  {
    const { id, projektId } = await bisProjekt(BETRIEBE.live);
    await inhalteSenden(projektId, BETRIEBE.live);
    await freigeben(id, "livegang", MAX);
    await freigeben(id, "abnahme_aufforderung", MAX);
    await vertrag.abnahmeErklaeren(projektId, { ergebnis: "abgenommen", name: BETRIEBE.live.inhaber ?? BETRIEBE.live.name, maengel: "" });
    await warte();
    await freigeben(id, "abnahme_bestaetigung", MAX);
    await freigeben(id, "schlusszahlung", MAX);
    await freigeben(id, "betreuung_start", MAX);
    const vor = (tage: number) => new Date(Date.now() - tage * 864e5);
    await db.update(schema.projekte).set({ liveAm: vor(45), aboAb: vor(45), abnahmeAm: vor(38) }).where(eq(schema.projekte.id, projektId));
    const [p] = await db.select().from(schema.projekte).where(eq(schema.projekte.id, projektId));
    await db.insert(schema.anfragen).values([
      { betriebId: id, seitenSlug: p.seitenSlug!, name: "Erika Beispiel", kontakt: "0721 111222 · erika@beispiel.example", nachricht: "Unsere Heizung macht seit gestern Geräusche. Können Sie diese Woche vorbeikommen?", am: vor(3) },
      { betriebId: id, seitenSlug: p.seitenSlug!, name: "Jonas Probe", kontakt: "0176 123456", nachricht: "Wir planen ein neues Bad (ca. 8 m²) und hätten gern ein Angebot.", dateien: [], am: vor(12) },
      { betriebId: id, seitenSlug: p.seitenSlug!, name: "Hausverwaltung Muster (Beispiel)", kontakt: "verwaltung@beispiel.example", nachricht: "Wartung für 6 Gasthermen im Mehrfamilienhaus gesucht.", am: vor(33) },
    ]);
    await berichte.monatsreports();
    await warte();
  }
  await finanzBeispiele();
  // Systemmeldungen
  await betrieb.backup();
  await betrieb.ruecksicherung();
  await betrieb.tagesbericht();
  return "Beispieldaten geladen: 16 Betriebe in allen Phasen.";
}

// Ausgaben der letzten Monate (Planwerte aus dem Business Case, leicht schwankend), einige mit Beleg.
const AUSGABEN: [number, string, string, string, number, number, boolean][] = [
  // [Monate zurück, Lieferant, Beschreibung, Kategorie, Brutto in Cent, USt-Satz, mit Beleg]
  [3, "Notariat Karlsruhe (Beispiel)", "Gründung GmbH, Entwurf Satzung", "gruendung", 89250, 19, true],
  [3, "Kanzlei Arbeitsrecht (Beispiel)", "Freistellungsvereinbarung", "gruendung", 142800, 19, true],
  [3, "Hetzner Online (Beispiel)", "Cloud-Server und Storage Box", "software", 3570, 19, true],
  [2, "Hetzner Online (Beispiel)", "Cloud-Server und Storage Box", "software", 3570, 19, true],
  [1, "Hetzner Online (Beispiel)", "Cloud-Server und Storage Box", "software", 4760, 19, true],
  [0, "Hetzner Online (Beispiel)", "Cloud-Server und Storage Box", "software", 4760, 19, false],
  [2, "Anthropic (Beispiel)", "Claude Max und API", "software", 23800, 19, false],
  [1, "Anthropic (Beispiel)", "Claude Max und API", "software", 26180, 19, false],
  [0, "Anthropic (Beispiel)", "Claude Max und API", "software", 25000, 19, false],
  [2, "Apple (Beispiel)", "MacBook Pro und Monitor", "hardware", 416500, 19, true],
  [1, "Steuerkanzlei (Beispiel)", "Beratung Gründung, Ist-Versteuerung", "steuerberater", 59500, 19, true],
  [0, "Steuerkanzlei (Beispiel)", "Laufende Beratung", "steuerberater", 59500, 19, false],
  [2, "eRecht24 (Beispiel)", "Rechtstexte-Lizenz", "rechtstexte", 5950, 19, false],
  [1, "eRecht24 (Beispiel)", "Rechtstexte-Lizenz", "rechtstexte", 5950, 19, false],
  [1, "Versicherung (Beispiel)", "IT-Haftpflicht und Cyber, Quartal", "versicherungen", 75000, 0, true],
  [1, "Druckerei (Beispiel)", "Briefpapier und Visitenkarten", "marketing", 35700, 19, false],
  [0, "Briefdienst (Beispiel)", "Akquise-Briefe Testlauf", "marketing", 11900, 19, false],
  [0, "Telekom (Beispiel)", "Mobilfunk Max und Daniel", "mobilfunk", 9520, 19, false],
  [0, "Coworking Karlsruhe (Beispiel)", "Arbeitsplätze Oktober", "buero", 26180, 19, false],
  [0, "Tankstelle (Beispiel)", "Fahrten zu Leads", "fahrten", 8340, 19, false],
];

async function belegPdf(lieferant: string, beschreibung: string, brutto: number, datum: Date): Promise<string> {
  const html = druckSeite({ titel: "Beleg", inhalt: `<div class="seite"><h1>${esc(lieferant)}</h1><p class="mono">Rechnung vom ${datum.toLocaleDateString("de-DE")}</p><p>An: Stelax Consulting GmbH i. G.</p><table><tr><td>${esc(beschreibung)}</td><td class="zahl">${(brutto / 100).toFixed(2).replace(".", ",")} €</td></tr></table><p class="leise">Beispielbeleg, erfunden.</p></div>` });
  const pfad = path.join(datenOrdner("belege", "beispiel"), `${Date.now()}-${Math.round(Math.random() * 1e6)}.pdf`);
  fs.writeFileSync(pfad, await htmlZuPdf(html));
  return pfad;
}

async function finanzBeispiele(): Promise<void> {
  const db = await getDb();
  const heute = new Date();
  for (const [zurueck, lieferant, beschreibung, kategorie, brutto, satz, mitBeleg] of AUSGABEN) {
    const tag = 3 + ((lieferant.length * 7) % 24);
    const datum = new Date(heute.getFullYear(), heute.getMonth() - zurueck, zurueck === 0 ? Math.min(tag, heute.getDate()) : tag);
    const netto = Math.round(brutto / (1 + satz / 100));
    const pfad = mitBeleg ? await belegPdf(lieferant, beschreibung, brutto, datum) : null;
    await db.insert(schema.ausgaben).values({ datum, lieferant, beschreibung, kategorie, netto, ust: brutto - netto, ustSatz: satz, bezahlt: true, belegPfad: pfad, belegName: pfad ? "beleg.pdf" : null, erfasstVon: MAX });
  }
  // Ein frisch hochgeladener Beleg, den der Beleg-Agent ausgelesen hat und der geprüft werden muss
  const pfad = await belegPdf("Bürobedarf (Beispiel)", "Druckerpapier und Ordner", 4590, heute);
  await db.insert(schema.ausgaben).values({ datum: heute, lieferant: "Bürobedarf (Beispiel)", beschreibung: "vom Beleg-Agenten gelesen", kategorie: "buero", netto: 3857, ust: 733, ustSatz: 19, belegPfad: pfad, belegName: "beleg.pdf", status: "pruefen", erfasstVon: DANIEL });

  // Rechnungen über die Monate verteilen, damit der Verlauf sichtbar wird
  const rechnungen = await db.select().from(schema.rechnungen).innerJoin(schema.betriebe, eq(schema.rechnungen.betriebId, schema.betriebe.id)).where(eq(schema.betriebe.quelle, QUELLE));
  for (const [i, { rechnungen: r }] of rechnungen.entries()) {
    const zurueck = i % 3;
    const am = new Date(heute.getFullYear(), heute.getMonth() - zurueck, 5 + i);
    if (am > heute) continue;
    await db.update(schema.rechnungen).set({ erstelltAm: am, bezahltAm: r.status === "bezahlt" ? new Date(am.getTime() + 6 * 864e5) : null }).where(eq(schema.rechnungen.id, r.id));
  }
  // Eine Anzahlung, die seit über 14 Tagen offen ist: der Mahn-Agent bereitet eine Erinnerung vor
  const [offen] = rechnungen.filter(({ rechnungen: r }) => r.status === "offen" && r.art === "anzahlung");
  if (offen) await db.update(schema.rechnungen).set({ erstelltAm: new Date(Date.now() - 20 * 864e5), faelligAm: new Date(Date.now() - 6 * 864e5) }).where(eq(schema.rechnungen.id, offen.rechnungen.id));
  await finanzagenten.zahlungserinnerungen();
  await finanzagenten.betreuungsrechnungen(new Date(heute.getFullYear(), heute.getMonth() + 1, 2));
  await finanzagenten.steuerberaterBericht();
  await warte();
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
  await db.delete(schema.ausgaben).where(sql`${schema.ausgaben.lieferant} like '%(Beispiel)%'`);
  await db.delete(schema.postausgang).where(eq(schema.postausgang.zweck, "finanzbericht"));
  fs.rmSync(path.join(datenOrdner("belege"), "beispiel"), { recursive: true, force: true });
  return `${ids.length} Beispiel-Betriebe entfernt.`;
}
