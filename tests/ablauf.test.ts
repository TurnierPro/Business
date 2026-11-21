import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Spielt den kompletten Ablauf mit Simulatoren durch: Lead → Brief → Termin → Angebot → Zahlung → Livegang.
process.env.DATABASE_URL = "memory://";
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "levarex-test-"));
delete process.env.ANTHROPIC_API_KEY;
delete process.env.SMTP_HOST;

const { getDb, schema } = await import("../src/lib/db");
const { alleAbarbeiten } = await import("../src/lib/jobs/warteschlange");
const { HANDLER } = await import("../src/lib/jobs/handler");
const akquise = await import("../src/lib/ablauf/akquise");
const post = await import("../src/lib/ablauf/postausgang");
const verkauf = await import("../src/lib/ablauf/verkauf");
const lieferung = await import("../src/lib/ablauf/lieferung");
const betrieb = await import("../src/lib/ablauf/betrieb");
const { eq } = await import("drizzle-orm");

const abarbeiten = () => alleAbarbeiten(HANDLER);
let db: Awaited<ReturnType<typeof getDb>>;

before(async () => {
  db = await getDb();
});

async function offeneFreigabe(zweck: string) {
  const alle = await db.select().from(schema.postausgang).where(eq(schema.postausgang.zweck, zweck));
  const e = alle.find((x) => x.status === "zur_freigabe");
  assert.ok(e, `Kein offener Eintrag für ${zweck}`);
  return e;
}

test("Ohne Freigabe wird nichts versendet", async () => {
  const { id } = await akquise.legeBetriebAn({ name: "Test Sperre GmbH", gewerk: "SHK", score: 50, scoreGrund: "Test", strasse: "A 1", plz: "76131", ort: "Karlsruhe" }, "Test", "Test");
  const eintragId = await post.inPostausgang({ betriebId: id, kanal: "mail", zweck: "test", empfaenger: "a@b.de", betreff: "Test", text: "Hallo" });
  await assert.rejects(() => post.versende(eintragId), /Versand verweigert/);
});

test("Sperrliste stoppt alles, auch Doppelte beim nächsten Wochenlauf", async () => {
  const { id } = await akquise.legeBetriebAn({ name: "Widerspruch AG", gewerk: "Maler", score: 60, scoreGrund: "Test", website: "widerspruch.example" }, "Test", "Test");
  await akquise.widerspruch(id!, "Daniel Lück");
  await assert.rejects(() => post.inPostausgang({ betriebId: id, kanal: "mail", zweck: "test", empfaenger: "x@y.de", betreff: "x", text: "x" }), /Sperrliste/);
  const erneut = await akquise.legeBetriebAn({ name: "Widerspruch AG", gewerk: "Maler", score: 60, scoreGrund: "Test", website: "https://www.widerspruch.example/" }, "Test", "Test");
  assert.equal(erneut.id, null);
});

test("Kompletter Ablauf von Lead bis Livegang", async () => {
  // Wochenlauf (Simulator)
  await HANDLER.wochenlauf({});
  const [lead] = await db.select().from(schema.betriebe).where(eq(schema.betriebe.name, "Sanitär Muster GmbH"));
  assert.ok(lead);
  await db.update(schema.betriebe).set({ email: "thomas@sanitaer-muster.example" }).where(eq(schema.betriebe.id, lead.id));

  // Einstufen → Vorbereitung
  await akquise.einstufen(lead.id, true, "Daniel Lück");
  await abarbeiten();
  const doks = await db.select().from(schema.dokumente).where(eq(schema.dokumente.betriebId, lead.id));
  assert.deepEqual(doks.map((d) => d.art).sort(), ["brief", "check_report", "leitfaden"]);
  const demos = await db.select().from(schema.seiten).where(eq(schema.seiten.betriebId, lead.id));
  assert.equal(demos.length, 1);

  // Brief freigeben → Simulator-Post
  const brief = await offeneFreigabe("akquise_brief");
  await post.freigeben(brief.id, "Daniel Lück");
  await abarbeiten();
  const [nachBrief] = await db.select().from(schema.betriebe).where(eq(schema.betriebe.id, lead.id));
  assert.equal(nachBrief.status, "angeschrieben");

  // Termin ohne Einwilligung → verweigert
  const audio = new File([Buffer.from("fake-audio")], "termin.webm", { type: "audio/webm" });
  await assert.rejects(() => verkauf.terminAufnehmen({ betriebId: lead.id, datei: audio, einwilligung: false, wer: "Daniel Lück" }), /Einwilligung/);
  const terminId = await verkauf.terminAufnehmen({ betriebId: lead.id, datei: audio, einwilligung: true, wer: "Daniel Lück" });
  await abarbeiten();

  // Angebot freigeben → Aufnahme gelöscht
  const angebotMail = await offeneFreigabe("angebot");
  assert.equal(angebotMail.empfaenger, "thomas@sanitaer-muster.example");
  await post.freigeben(angebotMail.id, "Daniel Lück");
  await abarbeiten();
  const [t] = await db.select().from(schema.termine).where(eq(schema.termine.id, terminId));
  assert.equal(t.audioPfad, null);
  assert.ok(t.audioGeloeschtAm);

  // Nachfass-Agent: nach dem Angebot gibt es eine Aufgabe für den Vertrieb
  const aufgabe = async (titel: string) => (await db.select().from(schema.aktivitaeten).where(eq(schema.aktivitaeten.betriebId, lead.id))).find((a) => a.titel === titel);
  assert.ok((await aufgabe("Angebot nachfassen")) && !(await aufgabe("Angebot nachfassen"))!.erledigtAm, "Nachfass-Aufgabe angelegt");
  assert.ok((await aufgabe("Besuch vor Ort"))?.erledigtAm, "Besuchs-Aufgabe mit dem Termin erledigt");

  // Unterschrift → Rechnung über die erste Rate (eigene Rechnung, ohne Lexware), Zahlung eingegangen → Projekt
  const angebotId = Number(angebotMail.meta.angebotId);
  // Daniel hat beim Termin zusätzlich das Modul Personal & Bewerbung vereinbart
  await db.update(schema.angebote).set({ module: ["personal"] }).where(eq(schema.angebote.id, angebotId));
  await verkauf.unterschriftEingegangen(angebotId, "Simulator");
  await abarbeiten();
  const ersteRate = await offeneFreigabe("rechnung");
  assert.match(ersteRate.text, /Bitte überweisen/);
  await post.freigeben(ersteRate.id, "Daniel Lück");
  await abarbeiten();
  const projektId = await verkauf.zahlungEingegangen(angebotId, "Simulator");
  assert.equal(await verkauf.zahlungEingegangen(angebotId, "Simulator"), projektId, "doppelte Zahlungsmeldung legt nichts doppelt an");
  await abarbeiten();
  const kickoff = await offeneFreigabe("kickoff");
  await post.freigeben(kickoff.id, "Maximilian Steiner");

  // Inhalte über das Portal → Bau → Prüfung
  const [p] = await db.select().from(schema.projekte).where(eq(schema.projekte.id, projektId));
  const form = new FormData();
  form.set("claim", "Bad und Heizung aus Karlsruhe.");
  form.set("leistungen", "Heizung: Neue Heizung und Wartung\nBad: Komplettbäder");
  form.set("telefon", "0721 1111111");
  form.set("stellen", "Anlagenmechaniker SHK (m/w/d)\nAzubi SHK (m/w/d)");
  await lieferung.inhalteEinreichen(p.portalToken, form);
  await abarbeiten();
  const [gebaut] = await db.select().from(schema.projekte).where(eq(schema.projekte.id, projektId));
  assert.equal(gebaut.status, "bereit", JSON.stringify(gebaut.pruefung));

  // Eingang der Inhalte bestätigen: Fertig-Datum laut Lieferfrist (Professional 6 Wochen), Mitwirkungsliste
  const lf = await import("../src/lib/ablauf/lieferfrist");
  const { PAKETE } = await import("../src/lib/pakete");
  const { datumDe } = await import("../src/lib/docs/basis");
  const eingang = await offeneFreigabe("inhalte_eingang");
  const frist = lf.lieferfristBis(gebaut)!;
  assert.equal(Math.round((frist.getTime() - gebaut.inhalteAm!.getTime()) / 864e5), (PAKETE[gebaut.paket as keyof typeof PAKETE].wochen) * 7);
  assert.ok(eingang.text.includes(datumDe(frist)), eingang.text);
  assert.equal(eingang.qkStatus === "blockiert", false);
  assert.ok(lf.mitwirkungsliste(gebaut).some((m) => m.titel.startsWith("Echte Fotos") && !m.erledigt), "ohne Fotos: fehlt");
  assert.equal(lf.plusWerktage(new Date("2026-11-20T10:00:00"), 2).getDate(), 24, "Freitag + 2 Werktage = Dienstag");
  assert.match(await lf.lieferfristenPruefen(new Date(frist.getTime() + 864e5)), /^0 /, "bereitgestellt: keine Warnung");
  await post.freigeben(eingang.id, "Maximilian Steiner");

  // Erst Vorschau und Abnahme, dann Livegang (Festlegung Leistungskatalog)
  assert.equal((await db.select().from(schema.postausgang).where(eq(schema.postausgang.zweck, "livegang"))).length, 0, "kein Livegang vor der Abnahme");
  const aufforderung = await offeneFreigabe("abnahme_aufforderung");
  assert.match(aufforderung.text, /\/vorschau\/.+\?code=/, "Vorschau-Link mit Zugangscode");
  assert.match(aufforderung.text, /Online geht sie erst nach der Abnahme/);
  const [vorAufforderung] = await db.select().from(schema.projekte).where(eq(schema.projekte.id, projektId));
  assert.equal(vorAufforderung.abnahmeFrist, null, "Frist läuft erst nach Versand der Aufforderung");
  await post.freigeben(aufforderung.id, "Maximilian Steiner");
  await abarbeiten();
  const [mitFrist] = await db.select().from(schema.projekte).where(eq(schema.projekte.id, projektId));
  assert.ok(mitFrist.abnahmeFrist && mitFrist.abnahmeFrist > new Date(Date.now() + 13 * 864e5));
  assert.equal(mitFrist.status, "bereit");

  // Abnahme im Portal mit Mängeln → Abnahmeprotokoll und Livegang zur Freigabe, noch keine Schlussrechnung
  const vertrag = await import("../src/lib/ablauf/vertrag");
  await assert.rejects(() => vertrag.abnahmeErklaeren(projektId, { ergebnis: "vorbehalt", name: "Thomas Muster", maengel: "" }), /Mängel/);
  await vertrag.abnahmeErklaeren(projektId, { ergebnis: "vorbehalt", name: "Thomas Muster", maengel: "Telefonnummer im Kopf fehlt" });
  await abarbeiten();
  const protokollMail = await offeneFreigabe("abnahme_bestaetigung");
  await post.freigeben(protokollMail.id, "Maximilian Steiner");
  assert.equal((await db.select().from(schema.postausgang).where(eq(schema.postausgang.zweck, "schlussrechnung"))).length, 0, "Schlussrechnung erst beim Livegang");

  // Livegang: nur Maximilian (zweiter Faktor prüft die Aktion), dann Schlussrechnung und Lastschrift
  const live = await offeneFreigabe("livegang");
  await assert.rejects(() => post.freigeben(live.id, "Daniel Lück"), /nur Maximilian Steiner/);
  await post.freigeben(live.id, "Maximilian Steiner");
  await abarbeiten();
  const [fertig] = await db.select().from(schema.projekte).where(eq(schema.projekte.id, projektId));
  assert.equal(fertig.status, "live");
  const schlussrechnung = await offeneFreigabe("schlussrechnung");
  assert.match(schlussrechnung.text + JSON.stringify(schlussrechnung.meta), /./);
  await post.freigeben(schlussrechnung.id, "Maximilian Steiner");
  const lastschrift = await offeneFreigabe("lastschrift_start");
  assert.equal(lastschrift.kanal, "lastschrift");
  await post.freigeben(lastschrift.id, "Maximilian Steiner");
  const bestaetigung = await offeneFreigabe("auftragsbestaetigung");
  await post.freigeben(bestaetigung.id, "Daniel Lück");
  await abarbeiten();
  const rechnungen = await db.select().from(schema.rechnungen);
  assert.deepEqual(rechnungen.map((r) => [r.art, r.quelle, r.status]), [["anzahlung", "eigen", "bezahlt"], ["schluss", "eigen", "offen"]]);
  const [mitAbo] = await db.select().from(schema.projekte).where(eq(schema.projekte.id, projektId));
  assert.match(mitAbo.qontoAboId ?? "", /^sim_abo_/, "Lastschrift eingerichtet (Simulator)");
  assert.ok((await aufgabe("Angebot nachfassen"))?.erledigtAm, "Nachfassen erledigt sich mit der Annahme");
  const { checkliste } = await import("../src/lib/ablauf/checkliste");
  const punkte = await checkliste(projektId);
  for (const k of ["anzahlung", "kickoff", "inhalte", "gebaut", "livegang", "domain", "abnahme"]) assert.ok(punkte.find((x) => x.schluessel === k)?.erledigtAm, `Checkliste: ${k} abgehakt`);
  assert.ok(punkte.some((x) => x.titel.startsWith("Karriereseite")), "Modul Personal & Bewerbung bringt Karriere-Schritte");
  const [angenommen] = await db.select().from(schema.angebote).where(eq(schema.angebote.id, angebotId));
  assert.equal(angenommen.status, "abgeschlossen");
  assert.ok(angenommen.annahme?.agbVersion, "Annahme-Nachweis gespeichert");

  // Nachtrag für Bestandskunden: Status bleibt „Kunde“
  await verkauf.erstelleAngebot({ betriebId: lead.id, auswahl: { paket: "KOMPAKT", module: ["personal"], zusaetze: [] }, wer: "Daniel Lück" });
  const [nachNachtrag] = await db.select().from(schema.betriebe).where(eq(schema.betriebe.id, lead.id));
  assert.equal(nachNachtrag.status, "kunde");

  // Kundenportal: alles abgehakt, beide Stripe-Rechnungen sichtbar, interne Dokumente nie
  const portal = await import("../src/lib/kundenportal");
  const sicht = await portal.portalDaten(lead.id);
  assert.ok(sicht.schritte.every((x) => x.erledigt), JSON.stringify(sicht.schritte.map((x) => [x.titel, x.erledigt])));
  assert.equal(sicht.rechnungen.length, 2);
  assert.deepEqual(sicht.dokumente.map((d) => d.art).sort(), ["abnahmeprotokoll", "angebot", "auftragsbestaetigung", "protokoll"]);
  const leitfaden = doks.find((d) => d.art === "leitfaden")!;
  assert.equal(await portal.darfDokumentSehen(lead.id, leitfaden.id), false, "interne Dokumente nie sichtbar");
  assert.ok(sicht.website);
});

test("Resend: Mail mit Anhang über die API", async () => {
  const { sendeMail } = await import("../src/lib/adapters/mail");
  const vorher = globalThis.fetch;
  let gesendet: { url: string; body: Record<string, unknown>; auth: string } | undefined;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    gesendet = { url, body: JSON.parse(String(init.body)), auth: String((init.headers as Record<string, string>).Authorization) };
    return new Response(JSON.stringify({ id: "test-123" }), { status: 200 });
  }) as typeof fetch;
  process.env.RESEND_API_KEY = "re_test";
  process.env.MAIL_FROM = "Levarex Consulting <hallo@levarex.example>";
  try {
    const r = await sendeMail({ an: "kunde@example.com", betreff: "Test", text: "Hallo", anhaenge: [{ name: "a.pdf", inhalt: Buffer.from("PDF") }] });
    assert.match(r, /test-123/);
    assert.equal(gesendet!.url, "https://api.resend.com/emails");
    assert.equal(gesendet!.auth, "Bearer re_test");
    assert.deepEqual(gesendet!.body.to, ["kunde@example.com"]);
    assert.equal((gesendet!.body.attachments as { content: string }[])[0].content, Buffer.from("PDF").toString("base64"));
  } finally {
    globalThis.fetch = vorher;
    delete process.env.RESEND_API_KEY;
  }
});

test("Qualitätskontrolle muss vor der Freigabe gelaufen sein", async () => {
  const { id } = await akquise.legeBetriebAn({ name: "QK GmbH", gewerk: "SHK", score: 50, scoreGrund: "Test", website: "qk.example" }, "Test", "Test");
  const e = await post.inPostausgang({ betriebId: id, kanal: "mail", zweck: "test", empfaenger: "chef@qk.example", betreff: "Hallo", text: "Guten Tag, wir garantiert Ihnen 50 % mehr Anfragen. Viele Grüße" });
  await assert.rejects(() => post.freigeben(e, "Maximilian Steiner"), /Qualitätskontrolle läuft/);
  await abarbeiten();
  const [x] = await db.select().from(schema.postausgang).where(eq(schema.postausgang.id, e));
  assert.equal(x.qkStatus, "hinweise");
  assert.ok(x.hinweise.some((h) => h.includes("50 %")));
  assert.ok(x.hinweise.some((h) => h.includes("garantiert")));
});

test("Finanz-Agenten: Mahnstufen und Betreuungsrechnung", async () => {
  const agenten = await import("../src/lib/ablauf/finanzagenten");
  // Eigene Rechnung, die offen bleibt. Offene Rechnungen anderer Tests gelten hier als bezahlt, damit nur diese zählt.
  const { ne } = await import("drizzle-orm");
  await db.update(schema.rechnungen).set({ status: "bezahlt" }).where(ne(schema.rechnungen.status, "bezahlt"));
  const { id } = await akquise.legeBetriebAn({ name: "Überweiser GmbH", gewerk: "Maler", score: 60, scoreGrund: "Test", website: "ueberweiser.example", email: "chef@ueberweiser.example" }, "Test", "Test");
  const [a] = await db.insert(schema.angebote).values({ betriebId: id!, paket: "KOMPAKT", einmalig: 149000, monatlich: 6000, status: "versendet" }).returning();
  await verkauf.unterschriftEingegangen(a.id, "Test");
  const [r] = await db.select().from(schema.rechnungen).where(eq(schema.rechnungen.betriebId, id!));
  assert.ok(r.faelligAm, "Rechnung hat ein Fälligkeitsdatum");
  const tag = (n: number) => new Date(r.faelligAm!.getTime() + n * 864e5);
  assert.match(await agenten.zahlungserinnerungen(tag(1)), /^0 /, "vor Ablauf von 3 Tagen nichts");
  assert.match(await agenten.zahlungserinnerungen(tag(4)), /^1 /);
  assert.match(await agenten.zahlungserinnerungen(tag(4)), /^0 /, "keine doppelte Erinnerung");
  const erinnerung = await offeneFreigabe("zahlungserinnerung");
  await post.qualitaetskontrolle(erinnerung.id);
  await post.freigeben(erinnerung.id, "Maximilian Steiner");
  await post.versende(erinnerung.id);
  const [nach1] = await db.select().from(schema.rechnungen).where(eq(schema.rechnungen.id, r.id));
  assert.equal(nach1.mahnstufe, 1, "Stufe erst nach Versand hochgezählt");
  // 1. Mahnung 10 Tage nach der Erinnerung, mit Zinsen und Pauschale
  const spaeter = new Date(Date.now() + 11 * 864e5);
  assert.match(await agenten.zahlungserinnerungen(spaeter), /^1 /);
  const m1 = await offeneFreigabe("mahnung1");
  assert.match(m1.text, /40,00\s€/);
  assert.match(m1.text, /10,52 %/);
  await post.qualitaetskontrolle(m1.id);
  const [m1qk] = await db.select().from(schema.postausgang).where(eq(schema.postausgang.id, m1.id));
  assert.ok(!m1qk.hinweise.some((h) => h.includes("steht nicht in den Daten")), m1qk.hinweise.join(" | "));
  await agenten.betreuungsrechnungen(new Date(Date.now() + 40 * 864e5));
  const betreuung = (await db.select().from(schema.rechnungen).where(eq(schema.rechnungen.betriebId, id!))).filter((x) => x.art === "betreuung");
  assert.equal(betreuung.length, 0, "ohne Livegang keine Betreuungsrechnung");
});

test("Abnahme durch Fristablauf, Schlussrechnung zieht die erste Rate ab", async () => {
  try {
    const vertrag = await import("../src/lib/ablauf/vertrag");
    const { id } = await akquise.legeBetriebAn({ name: "Frist GmbH", gewerk: "SHK", score: 60, scoreGrund: "Test", website: "frist.example", email: "chef@frist.example" }, "Test", "Test");
    const [a] = await db.insert(schema.angebote).values({ betriebId: id!, paket: "KOMPAKT", einmalig: 149000, monatlich: 6000, status: "angezahlt" }).returning();
    await db.insert(schema.rechnungen).values({ nummer: "2026-9001", lfdNr: 9001, jahr: 2026, betriebId: id!, angebotId: a.id, art: "anzahlung", netto: 74500, status: "bezahlt" });
    const [p] = await db.insert(schema.projekte).values({ betriebId: id!, angebotId: a.id, paket: "KOMPAKT", portalToken: "frist-token-1234567890", status: "bereit", abnahmeStatus: "offen", abnahmeFrist: new Date(Date.now() - 864e5) }).returning();
    assert.match(await vertrag.abnahmefiktion(), /^1 /);
    const [nach] = await db.select().from(schema.projekte).where(eq(schema.projekte.id, p.id));
    assert.equal(nach.abnahmeStatus, "fiktion");
    assert.ok((await db.select().from(schema.postausgang).where(eq(schema.postausgang.projektId, p.id))).some((e) => e.zweck === "livegang" && e.kanal === "livegang"), "Livegang liegt zur Freigabe");
    await vertrag.schlussrechnungStellen(p.id); // passiert beim Livegang
    await vertrag.schlussrechnungStellen(p.id); // doppelt aufgerufen: keine zweite Rechnung
    assert.equal((await db.select().from(schema.rechnungen).where(eq(schema.rechnungen.betriebId, id!))).filter((x) => x.art === "schluss").length, 1);
    const [schluss] = (await db.select().from(schema.rechnungen).where(eq(schema.rechnungen.betriebId, id!))).filter((x) => x.art === "schluss");
    assert.equal(schluss.netto, 149000 - 74500);
    const [dok] = (await db.select().from(schema.dokumente).where(eq(schema.dokumente.betriebId, id!))).filter((d) => d.art === "rechnung");
    const daten = dok.daten as { positionen: { netto: number; text: string }[]; zahlbarBis: string; leistung: string };
    assert.deepEqual(daten.positionen.map((x) => x.netto), [149000, -74500]);
    assert.match(daten.positionen[1].text, /2026-9001/);
    assert.match(daten.zahlbarBis, /^\d\d\.\d\d\.\d{4}$/);
    assert.match(daten.leistung, /Abnahme/);
    const { dokumentHtml } = await import("../src/lib/docs/render");
    assert.match(dokumentHtml(dok), /zahlbar|bis zum/);
    assert.match(await vertrag.abnahmefiktion(), /^0 /, "nicht doppelt");

    // Kündigung: 24 Monate ab Livegang, dann je 12 Monate; Kündigung bis 3 Monate vor Ende
    await db.update(schema.projekte).set({ status: "live", liveAm: new Date("2027-02-10T10:00:00Z"), aboAb: new Date("2027-02-10T10:00:00Z") }).where(eq(schema.projekte.id, p.id));
    const ende = await vertrag.kuendigungErfassen(p.id, "Test", new Date("2027-05-03T10:00:00Z"));
    assert.equal(ende.toISOString().slice(0, 10), "2029-02-09");
    // Zu spät gekündigt (weniger als 3 Monate vor Ende): verlängert sich um 12 Monate
    assert.equal(vertrag.laufzeitEnde(new Date("2027-02-10T10:00:00Z"), new Date("2028-12-01T10:00:00Z")).toISOString().slice(0, 10), "2030-02-09");
    assert.match(await vertrag.vertragsende(new Date("2028-03-01T10:00:00Z")), /^0 /, "läuft noch");
    assert.match(await vertrag.vertragsende(new Date("2029-03-01T10:00:00Z")), /^1 /);
  } finally {
  }
});

test("Anfragen über die Kunden-Website landen im Portal, Demos speichern nichts", async () => {
  const { id } = await akquise.legeBetriebAn({ name: "Anfrage GmbH", gewerk: "SHK", score: 60, scoreGrund: "Test", website: "anfrage.example" }, "Test", "Test");
  await db.insert(schema.seiten).values([{ slug: "anfrage-kunde", betriebId: id!, art: "kunde" }, { slug: "anfrage-demo", betriebId: id!, art: "demo", zugangscode: "ABC123" }]);
  const route = await import("../src/app/vorschau/[slug]/[[...pfad]]/route");
  const senden = (slug: string, felder: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(felder)) f.set(k, v);
    return route.POST(new Request("http://x/vorschau", { method: "POST", body: f }), { params: Promise.resolve({ slug, pfad: ["kontakt"] }) });
  };
  const ok = await senden("anfrage-kunde", { name: "Erika Beispiel", telefon: "0721 999", nachricht: "Heizung tropft" });
  assert.equal(ok.status, 303);
  await senden("anfrage-kunde", { name: "Bot", telefon: "1", nachricht: "Spam", webseite: "http://spam" });
  await senden("anfrage-demo", { name: "Demo", telefon: "1", nachricht: "Test in der Demo" });
  const anfragen = await db.select().from(schema.anfragen).where(eq(schema.anfragen.betriebId, id!));
  assert.deepEqual(anfragen.map((a) => a.name), ["Erika Beispiel"]);
  const portal = await import("../src/lib/kundenportal");
  assert.equal((await portal.portalDaten(id!)).anfragen.length, 1);
});

test("Domain-Umzug: Auftrag, Bestandsaufnahme, Anleitung, Umstellung, Auslieferung unter der Domain", async () => {
  const { id } = await akquise.legeBetriebAn({ name: "Müller Haustechnik", gewerk: "SHK", score: 70, scoreGrund: "Test", website: "mueller-haustechnik.example", email: "info@mueller-haustechnik.example" }, "Test", "Test");
  const [p] = await db.insert(schema.projekte).values({ betriebId: id!, paket: "KOMPAKT", portalToken: "umzug-token-1234567890" }).returning();
  const form = (vollmacht: boolean) => {
    const f = new FormData();
    f.set("claim", "Heizung und Bad aus Karlsruhe.");
    f.set("telefon", "0721 222333");
    f.set("domain", "https://www.Mueller-Haustechnik.example/");
    f.set("mailUeberDomain", "ja");
    f.set("umzugWeg", "selbst");
    f.set("rechteInhalte", "ja");
    if (vollmacht) f.set("umzugVollmacht", "ja");
    return f;
  };
  await assert.rejects(() => lieferung.inhalteEinreichen(p.portalToken, form(false)), /Auftrag/);
  await lieferung.inhalteEinreichen(p.portalToken, form(true));
  await abarbeiten();
  const umzug = await import("../src/lib/ablauf/umzug");
  let [stand] = await db.select().from(schema.projekte).where(eq(schema.projekte.id, p.id));
  const u = umzug.umzugVon(stand)!;
  assert.equal(u.domain, "mueller-haustechnik.example");
  assert.equal(u.status, "geprueft");
  assert.equal(u.stand?.mailAnbieter, "Microsoft 365");
  assert.ok(u.warnungen?.some((w) => w.includes("E-Mail läuft")), "warnt vor E-Mail");
  assert.deepEqual(u.alteSeiten?.find((x) => x.pfad === "/kontakt.html")?.ziel, "kontakt");
  assert.equal(stand.status, "bereit", JSON.stringify(stand.pruefung));

  // Erst Abnahme der Vorschau, dann Livegang mit Anleitung zur Umstellung
  const zwecke = async () => (await db.select().from(schema.postausgang).where(eq(schema.postausgang.projektId, p.id))).map((e) => e.zweck);
  await abarbeiten();
  const aufforderung = (await db.select().from(schema.postausgang).where(eq(schema.postausgang.projektId, p.id))).find((e) => e.zweck === "abnahme_aufforderung")!;
  await post.freigeben(aufforderung.id, "Maximilian Steiner");
  await abarbeiten();
  const vertrag = await import("../src/lib/ablauf/vertrag");
  await vertrag.abnahmeErklaeren(p.id, { ergebnis: "abgenommen", name: "Herr Müller", maengel: "" });
  await abarbeiten();
  const live = (await db.select().from(schema.postausgang).where(eq(schema.postausgang.projektId, p.id))).find((e) => e.zweck === "livegang")!;
  await post.freigeben(live.id, "Maximilian Steiner");
  await abarbeiten();
  assert.ok((await zwecke()).includes("umzug_anleitung"));
  [stand] = await db.select().from(schema.projekte).where(eq(schema.projekte.id, p.id));
  assert.equal(umzug.umzugVon(stand)?.status, "wartet_dns");

  // Unter der Domain wird die Seite ausgeliefert, auch bevor der Kunde umstellt (für den Test direkt aufgerufen)
  const seite = await import("../src/app/kunde-seite/[host]/[[...pfad]]/route");
  const aufruf = (host: string, pfad: string[] = []) => seite.GET(new Request(`https://${host}/${pfad.join("/")}`), { params: Promise.resolve({ host, pfad }) });
  const start = await aufruf("mueller-haustechnik.example");
  assert.equal(start.status, 200);
  const html = await start.text();
  assert.ok(html.includes("Müller Haustechnik") && !html.includes("{{BASIS}}"));
  assert.equal((await aufruf("www.mueller-haustechnik.example", ["kontakt"])).headers.get("location"), "https://mueller-haustechnik.example/kontakt");
  assert.equal((await aufruf("mueller-haustechnik.example", ["kontakt.html"])).headers.get("location"), "https://mueller-haustechnik.example/kontakt");
  assert.equal((await aufruf("fremd.example")).status, 404);
  const tls = await import("../src/app/api/tls-erlaubt/route");
  assert.equal((await tls.GET(new Request("http://x/api/tls-erlaubt?domain=www.mueller-haustechnik.example"))).status, 200);
  assert.equal((await tls.GET(new Request("http://x/api/tls-erlaubt?domain=boese.example"))).status, 404);

  // Kunde stellt um → Agent merkt es, Kündigungshinweis
  assert.match(await umzug.umstellungPruefen(), /^0 /);
  process.env.DNS_SIMULATOR_UMGESTELLT = "ja";
  try {
    assert.match(await umzug.umstellungPruefen(), /^1 /);
  } finally {
    delete process.env.DNS_SIMULATOR_UMGESTELLT;
  }
  assert.ok((await zwecke()).includes("umzug_fertig"));
  assert.equal((await zwecke()).filter((z) => z === "abnahme_aufforderung").length, 1, "keine zweite Abnahme nach der Umstellung");
  const fertig = (await db.select().from(schema.postausgang).where(eq(schema.postausgang.projektId, p.id))).find((e) => e.zweck === "umzug_fertig")!;
  assert.match(fertig.text, /nur das Webhosting, nicht die Domain/);
});

test("CRM: Zwei-Faktor, Schnittstelle, Import, Kalender, Tickets, Pipeline, Kennzahlen, Suche", async () => {
  // TOTP nach RFC 6238, Testwert aus dem Standard (Zeit 59 s, Geheimnis „12345678901234567890“)
  const totp = await import("../src/lib/totp");
  assert.equal(totp.code("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", 59_000), "287082");
  assert.ok(totp.pruefe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", "287 082", 59_000));
  assert.ok(!totp.pruefe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", "287083", 59_000));

  // Schnittstelle: Schlüssel mit Recht „leads“ legt an, ohne Recht „lesen“ kein Lesen
  const api = await import("../src/lib/api");
  const key = await api.schluesselErzeugen("Test", ["leads"], "Test");
  const route = await import("../src/app/api/v1/betriebe/route");
  const anfrage = (methode: string, body?: unknown, k = key) => new Request("http://x/api/v1/betriebe", { method: methode, headers: { Authorization: `Bearer ${k}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const neu = await route.POST(anfrage("POST", { name: "API Elektro GmbH", ort: "Karlsruhe", website: "api-elektro.example" }));
  assert.equal(neu.status, 201);
  assert.equal((await route.POST(anfrage("POST", { name: "API Elektro GmbH", website: "api-elektro.example" }))).status, 409, "Doppelte abgelehnt");
  assert.equal((await route.GET(anfrage("GET"))).status, 403);
  assert.equal((await route.GET(anfrage("GET", undefined, "lvx_falsch"))).status, 401);

  // CSV-Import mit Semikolon, Anführungszeichen und Doppeltem
  const imp = await import("../src/lib/import");
  const r = await imp.leadsImportieren('Firma;Ort;Ansprechpartner;Website\n"Maler ""Pinsel"" KG";Bruchsal;Eva Pinsel;pinsel.example\nAPI Elektro GmbH;Karlsruhe;;api-elektro.example\n;;;\n', "Test");
  assert.equal(r.neu, 1);
  assert.equal(r.uebersprungen.length, 1);
  const [pinsel] = await db.select().from(schema.betriebe).where(eq(schema.betriebe.name, 'Maler "Pinsel" KG'));
  assert.ok(pinsel?.datenquelle?.includes("CSV-Import"));

  // Aufgabe und Kalender
  const crm = await import("../src/lib/ablauf/crm");
  const { berlinZeit } = await import("../src/lib/format");
  await crm.aktivitaetAnlegen({ betriebId: pinsel.id, art: "termin", titel: "Besuch Pinsel", faelligAm: berlinZeit("2026-11-03", "10:00"), dauerMin: 45, zustaendig: "Daniel Lück" }, "Daniel Lück");
  await assert.rejects(() => crm.aktivitaetAnlegen({ art: "aufgabe", titel: "ohne Datum" }, "Test"), /Datum/);
  let [daniel] = await db.select().from(schema.benutzer).where(eq(schema.benutzer.name, "Daniel Lück"));
  daniel ??= (await db.insert(schema.benutzer).values({ email: "daniel@test.example", name: "Daniel Lück", passwortHash: "x:y" }).returning())[0];
  const kal = await import("../src/lib/kalender");
  const link = await kal.kalenderLink(daniel.id);
  const ics = await kal.kalender(link.split("/").pop()!);
  assert.ok(ics?.includes("SUMMARY:Besuch Pinsel (Maler \"Pinsel\" KG)") && ics.includes("DTSTART:20261103T090000Z"), ics ?? "kein Kalender");

  // Ticket: Zeit zählt gegen das Kontingent, Antwort geht in den Postausgang
  const tickets = await import("../src/lib/ablauf/tickets");
  const [kp] = await db.insert(schema.projekte).values({ betriebId: pinsel.id, paket: "KOMPAKT", portalToken: "ticket-token-1234567890", status: "live" }).returning();
  const tid = await tickets.ticketAnlegen({ betriebId: pinsel.id, betreff: "Neue Öffnungszeiten", beschreibung: "Ab November Mo–Fr 7–16 Uhr", quelle: "portal" }, "Kunde (Portal)");
  await tickets.ticketZeit(tid, 20, "Öffnungszeiten geändert", "Maximilian Steiner");
  await tickets.ticketZeit(tid, 20, "Handy-Ansicht geprüft", "Maximilian Steiner");
  const k = await tickets.kontingent(pinsel.id);
  assert.deepEqual([k.enthalten, k.verbraucht, k.ueber], [15, 40, 25], "Kompakt: 15 Minuten Änderungen im Monat");
  await tickets.ticketAntworten(tid, "Die neuen Öffnungszeiten stehen jetzt auf Ihrer Website.", true, "Maximilian Steiner");
  const [t] = await db.select().from(schema.tickets).where(eq(schema.tickets.id, tid));
  assert.equal(t.status, "erledigt");
  assert.equal(t.projektId, kp.id);
  assert.ok((await db.select().from(schema.postausgang).where(eq(schema.postausgang.zweck, "ticket_antwort"))).some((e) => Number(e.meta.ticketId) === tid && e.status === "zur_freigabe"));

  // Pipeline, Kennzahlen, Suche
  const { pipeline, prognose } = await import("../src/lib/pipeline");
  const stufen = await pipeline();
  assert.ok(stufen.find((s) => s.key === "neu")!.karten.some((x) => x.name === 'Maler "Pinsel" KG'));
  assert.ok(prognose(stufen) > 0);
  const { kennzahlen } = await import("../src/lib/kennzahlen");
  const kz = await kennzahlen();
  assert.equal(kz.messgroessen.length, 4);
  assert.ok(kz.trichter[0].anzahl >= kz.trichter[5].anzahl);
  const { suche } = await import("../src/lib/suche");
  assert.ok((await suche("pinsel")).some((x) => x.art === "Betrieb"));
  assert.ok((await suche(tickets.ticketNummer(tid))).some((x) => x.art === "Ticket"));
});

test("Stammdaten: Katalog ändern wirkt auf neue Angebote, verschickte bleiben; Soll-Umsätze", async () => {
  const kdb = await import("../src/lib/katalog-db");
  const { berechne } = await import("../src/lib/katalog");
  const { PAKETE } = await import("../src/lib/pakete");
  const vorher = PAKETE.KOMPAKT.einmalig;
  const { id } = await akquise.legeBetriebAn({ name: "Katalog GmbH", gewerk: "SHK", score: 60, scoreGrund: "Test", website: "katalog.example", email: "a@katalog.example" }, "Test", "Test");
  const alt = await verkauf.erstelleAngebot({ betriebId: id!, auswahl: { paket: "KOMPAKT", module: [], zusaetze: [] }, wer: "Test" });
  await kdb.paketSpeichern("KOMPAKT", { name: "Webauftritt Kompakt Plus", einmalig: "1.590,00", monatlich: "70,00", wochen: "3", problem: "Niemand findet den Betrieb.", inhalt: "Website\nGoogle-Profil", nichtEnthalten: "Shop", aenderungsMinuten: "20", zielStunden: "4", aktiv: "ja" }, "Maximilian Steiner");
  assert.equal(PAKETE.KOMPAKT.einmalig, 159000);
  assert.equal(berechne({ paket: "KOMPAKT", module: [], zusaetze: [] }).einmalig, 159000);
  await assert.rejects(() => kdb.paketSpeichern("KOMPAKT", { name: "", einmalig: "1", monatlich: "1", problem: "x" }, "Maximilian"), /Name/);
  await assert.rejects(() => kdb.paketSpeichern("KOMPAKT", { name: "X", einmalig: "-5", monatlich: "1", problem: "x" }, "Maximilian"), /Betrag/);
  // Neues Modul aus den Stammdaten
  const neu = await kdb.modulSpeichern(null, { name: "Bewertungs-Erinnerung", text: "Bittet zufriedene Kunden um eine Bewertung", punkte: "a\nb\nc\nd\ne", einmalig: "290", monatlich: "19", stufe: "1", aktiv: "ja" }, "Maximilian Steiner");
  const r = berechne({ paket: "PROFESSIONAL", module: ["personal", neu], zusaetze: [] });
  assert.ok(r.positionen.some((x) => x.text.includes("Bewertungs-Erinnerung") && x.einmalig === 29000));
  assert.equal(r.einmalig, 299000 + 149000 + 29000);
  // Neues Angebot hat neuen Inhalt, altes behält den eingefrorenen
  const n = await verkauf.erstelleAngebot({ betriebId: id!, auswahl: { paket: "KOMPAKT", module: [], zusaetze: [] }, wer: "Test" });
  const doks = await db.select().from(schema.dokumente).where(eq(schema.dokumente.betriebId, id!));
  const daten = (nr: string) => doks.find((d) => (d.daten as { nummer?: string }).nummer === nr)!.daten as { einmalig: number; paketName: string; paketInhalt: string[] };
  assert.equal(daten(n.nummer).paketName, "Webauftritt Kompakt Plus");
  assert.equal(daten(alt.nummer).einmalig, vorher);
  assert.notEqual(daten(alt.nummer).paketName, "Webauftritt Kompakt Plus");
  await kdb.zuruecksetzen("paket", "KOMPAKT", "Maximilian Steiner");
  await kdb.zuruecksetzen("modul", neu, "Maximilian Steiner");
  assert.equal(PAKETE.KOMPAKT.einmalig, vorher, "Werkseinstellung wiederhergestellt");

  const soll = await import("../src/lib/soll");
  const werte = await soll.sollwerte();
  assert.equal(werte.length, 24);
  assert.equal(await soll.sollSpeichern([{ monat: "2027-03", umsatz: 2_000_000, auftraege: 5 }], "Maximilian Steiner"), 1);
  assert.equal((await soll.sollwerte()).find((x) => x.monat === "2027-03")?.umsatz, 2_000_000);
  await assert.rejects(() => soll.sollSpeichern([{ monat: "2030-01", umsatz: 1, auftraege: 1 }], "Maximilian"), /Planzeitraum/);
  const si = await soll.sollIst(new Date(2027, 2, 15));
  assert.equal(si.zeitraeume[0].soll.umsatz, 2_000_000);

  const { finde } = await import("../src/lib/bereiche");
  assert.equal(finde("/leads/12")?.bereich.key, "leads");
  assert.equal(finde("/freigaben/3")?.bereich.key, "zutun");
  assert.equal(finde("/finanzen/plan")?.seite.name, "Plan und Soll");
  assert.equal(finde("/finanzen/ausgabe/neu")?.bereich.key, "finanzen");
  assert.equal(finde("/")?.seite.name, "Übersicht");
});

test("Kundenportal: Zugang per E-Mail anfordern, Link erneuern sperrt den alten", async () => {
  const kp = await import("../src/lib/kundenportal");
  const { id } = await akquise.legeBetriebAn({ name: "Portal GmbH", gewerk: "SHK", score: 60, scoreGrund: "Test", website: "portal.example", email: "chef@portal.example" }, "Test", "Test");
  const link = await kp.portalLink(id!);
  const zaehle = async () => (await db.select().from(schema.postausgang).where(eq(schema.postausgang.zweck, "portal_zugang"))).length;
  const vorher = await zaehle();
  await kp.zugangAnfordern("unbekannt@nirgends.example");
  assert.equal(await zaehle(), vorher, "unbekannte Adresse: nichts passiert (und dieselbe Antwort)");
  await kp.zugangAnfordern("Chef@Portal.example");
  await kp.zugangAnfordern("chef@portal.example");
  assert.equal(await zaehle(), vorher + 1, "eine Mail, nicht doppelt");
  const token = link.split("/").pop()!;
  assert.ok(await kp.betriebPerPortal(token));
  const neu = await kp.portalLinkErneuern(id!, "Maximilian Steiner");
  assert.equal(await kp.betriebPerPortal(token), null, "alter Link gesperrt");
  assert.ok(await kp.betriebPerPortal(neu.split("/").pop()!));
});

test("Datenschutz: Auskunft, Löschung mit und ohne Rechnungen", async () => {
  const ds = await import("../src/lib/ablauf/datenschutz");
  const { id } = await akquise.legeBetriebAn({ name: "Lösch GmbH", gewerk: "Maler", score: 60, scoreGrund: "Test", website: "loesch.example", email: "a@loesch.example" }, "Test", "Test");
  const auskunft = await ds.datenauskunft(id!, "Test");
  assert.equal(auskunft.stammdaten.name, "Lösch GmbH");
  assert.ok(auskunft.stammdaten.datenquelle?.includes("loesch.example"), "Datenquelle nach Art. 14 gespeichert");
  await assert.rejects(() => ds.allesLoeschen(id!, "falsch", "Test"), /Bestätigung/);
  assert.match(await ds.allesLoeschen(id!, "Lösch GmbH", "Test"), /Alle Daten/);
  assert.equal((await db.select().from(schema.betriebe).where(eq(schema.betriebe.id, id!))).length, 0);
  assert.equal((await akquise.legeBetriebAn({ name: "Lösch GmbH", gewerk: "Maler", score: 60, scoreGrund: "Test", website: "loesch.example" }, "Test", "Test")).id, null, "danach auf der Sperrliste");

  const { id: kunde } = await akquise.legeBetriebAn({ name: "Rechnung GmbH", gewerk: "Maler", score: 60, scoreGrund: "Test", website: "rechnung.example", email: "a@rechnung.example" }, "Test", "Test");
  await db.insert(schema.rechnungen).values({ nummer: "2026-9100", lfdNr: 9100, jahr: 2026, betriebId: kunde!, art: "anzahlung", netto: 1000, status: "bezahlt" });
  assert.match(await ds.allesLoeschen(kunde!, "Rechnung GmbH", "Test"), /bis auf 1 Rechnungen/);
  const [rest] = await db.select().from(schema.betriebe).where(eq(schema.betriebe.id, kunde!));
  assert.equal(rest.status, "gesperrt");
  assert.equal(rest.email, null);
});

test("Unterlagen-Register: Status speichern, nur bekannte Werte", async () => {
  const u = await import("../src/lib/unterlagen");
  assert.ok(u.UNTERLAGEN.length > 100);
  const key = u.UNTERLAGEN[0].key;
  await u.speichern(key, { status: "erledigt", notiz: "vom Anwalt", datei: new File([Buffer.from("pdf")], "agb.pdf") }, "Maximilian Steiner");
  assert.equal((await u.stand()).get(key)?.status, "erledigt");
  assert.equal((await u.datei(key))?.name, "agb.pdf");
  await assert.rejects(() => u.speichern(key, { status: "kaputt", notiz: "", datei: null }, "Maximilian Steiner"), /Status/);
  await assert.rejects(() => u.speichern("gibt-es-nicht", { status: "offen", notiz: "", datei: null }, "Maximilian Steiner"), /Unbekannte/);
});

test("Baukasten: Ausbaustufen, Pilotpreis, Prozess-Check, Individuelle Module", async () => {
  const { berechne, laufzeitSumme, AUSBAUSTUFEN } = await import("../src/lib/katalog");
  // Die sechs Ausbaustufen genau wie im Baukasten (einmalig, monatlich, Gesamt 24 Monate, Ø)
  const soll: [number, number, number, number][] = [[149000, 6000, 293000, 12208], [398000, 36000, 1262000, 52583], [448000, 23000, 1000000, 41667], [698000, 40000, 1658000, 69083], [1096000, 78000, 2968000, 123667], [1295000, 78000, 3167000, 131958]];
  AUSBAUSTUFEN.forEach((st, i) => {
    const r = berechne({ ...st.auswahl, prozessCheckAnrechnen: st.auswahl.module.includes("kundenmanagement") });
    const einmalig = r.einmalig + (st.auswahl.module.includes("kundenmanagement") ? 69000 : 0); // Anrechnung herausrechnen
    assert.equal(einmalig, soll[i][0], `Stufe ${st.nr} einmalig`);
    assert.equal(r.monatlich, soll[i][1], `Stufe ${st.nr} monatlich`);
    const l = laufzeitSumme(einmalig, r.monatlich);
    assert.equal(l.gesamt, soll[i][2], `Stufe ${st.nr} Gesamt 24 Monate`);
    assert.equal(l.schnitt, soll[i][3], `Stufe ${st.nr} Durchschnitt`);
  });
  // Kundenmanagement braucht einen Prozess-Check, Pilotpreis nur auf Wunsch
  const km = berechne({ paket: "PROFESSIONAL", module: ["kundenmanagement"], zusaetze: [] });
  assert.ok(km.hinweise.some((h) => h.includes("Prozess-Check")));
  const pilot = berechne({ paket: "PROFESSIONAL", module: ["kundenmanagement"], zusaetze: ["prozesscheck"], pilot: true, prozessCheckAnrechnen: true });
  assert.equal(pilot.einmalig, 299000 + 199000);
  assert.ok(!pilot.hinweise.length, pilot.hinweise.join(" | "));
  // Individuelle Module: Festpreis eintragen
  const ind = berechne({ paket: "KOMPAKT", module: [], zusaetze: ["individuell", "prozesscheck"], individuell: { einmalig: 170000, monatlich: 5000, text: "Anbindung Werkstattsoftware" } });
  assert.equal(ind.einmalig, 149000 + 69000 + 170000);
  assert.equal(ind.monatlich, 6000 + 5000);
  assert.ok(berechne({ paket: "KOMPAKT", module: [], zusaetze: ["individuell"] }).hinweise.some((h) => h.includes("Festpreis")));

  const { id } = await akquise.legeBetriebAn({ name: "Vor Ort GmbH", gewerk: "SHK", score: 70, scoreGrund: "Test", website: "vorort.example", email: "chef@vorort.example", strasse: "Weg 1", plz: "76131", ort: "Karlsruhe" }, "Test", "Test");
  const { eintragId } = await verkauf.erstelleAngebot({ betriebId: id!, auswahl: { paket: "PROFESSIONAL", module: ["personal"], zusaetze: ["foto"] }, wer: "Daniel Lück" });
  await abarbeiten();
  const [e] = await db.select().from(schema.postausgang).where(eq(schema.postausgang.id, eintragId));
  assert.notEqual(e.qkStatus, "blockiert", e.hinweise.join(" | "));
  const [a] = await db.select().from(schema.angebote).where(eq(schema.angebote.id, Number(e.meta.angebotId)));
  assert.equal(a.einmalig, 299000 + 149000 + 129000);
  assert.equal(a.monatlich, 15000 + 8000);
  assert.deepEqual(a.module, ["personal"]);
  assert.equal(a.positionen.length, 3);
  // Das Angebot friert Problem und fünf Punkte je Baustein ein
  const [dok] = await db.select().from(schema.dokumente).where(eq(schema.dokumente.betriebId, id!));
  const d = (await db.select().from(schema.dokumente).where(eq(schema.dokumente.betriebId, id!))).find((x) => x.art === "angebot")!.daten as { bausteine: { name: string; punkte: string[] }[]; paketProblem: string };
  assert.ok(dok);
  assert.equal(d.bausteine.find((b) => b.name === "Personal & Bewerbung")?.punkte.length, 5);
  assert.ok(d.paketProblem.length > 10);
});

test("Lexware Office: Rechnung erst beim freigegebenen Versand, Nummer und PDF von Lexware, Zahlstatus täglich", async () => {
  const vorher = globalThis.fetch;
  const aufrufe: { url: string; methode: string; body?: Record<string, unknown> }[] = [];
  let status = "open";
  globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
    aufrufe.push({ url, methode: init.method ?? "GET", body: init.body ? JSON.parse(String(init.body)) : undefined });
    if (url.endsWith("/v1/invoices?finalize=true")) return Response.json({ id: "lx-1", version: 1 });
    if (url.endsWith("/v1/invoices/lx-1")) return Response.json({ voucherNumber: "RE0042", voucherStatus: status });
    if (url.endsWith("/v1/invoices/lx-1/document")) return Response.json({ documentFileId: "datei-1" });
    if (url.endsWith("/v1/files/datei-1")) return new Response(Buffer.from("%PDF-1.4 Lexware-Rechnung"), { status: 200 });
    return new Response("unerwartet", { status: 500 });
  }) as typeof fetch;
  process.env.LEXWARE_API_KEY = "lx_test";
  try {
    const { id } = await akquise.legeBetriebAn({ name: "Lexware Test GmbH", gewerk: "SHK", score: 60, scoreGrund: "Test", website: "lexware.example", email: "chef@lexware.example", strasse: "Weg 3", plz: "76297", ort: "Stutensee" }, "Test", "Test");
    const [a] = await db.insert(schema.angebote).values({ betriebId: id!, paket: "KOMPAKT", einmalig: 149000, monatlich: 6000, status: "versendet" }).returning();
    await verkauf.unterschriftEingegangen(a.id, "Test");
    await abarbeiten();
    assert.equal(aufrufe.length, 0, "vor der Freigabe geht nichts an Lexware");
    const e = (await db.select().from(schema.postausgang).where(eq(schema.postausgang.betriebId, id!))).find((x) => x.zweck === "rechnung")!;
    await post.freigeben(e.id, "Daniel Lück");
    await abarbeiten();
    const anlegen = aufrufe.find((x) => x.methode === "POST")!;
    assert.equal((anlegen.body!.lineItems as { unitPrice: { netAmount: number } }[])[0].unitPrice.netAmount, 745, "erste Rate 50 % von 1.490 €");
    const [r] = await db.select().from(schema.rechnungen).where(eq(schema.rechnungen.angebotId, a.id));
    assert.deepEqual([r.nummer, r.quelle, r.lexwareId], ["RE0042", "lexware", "lx-1"]);
    const [versendet] = await db.select().from(schema.postausgang).where(eq(schema.postausgang.id, e.id));
    assert.equal(versendet.status, "versendet");
    assert.match(versendet.betreff, /RE0042/, "Nummer von Lexware in Betreff und Text");
    const [dok] = (await db.select().from(schema.dokumente).where(eq(schema.dokumente.betriebId, id!))).filter((d) => d.art === "rechnung");
    assert.ok((await import("node:fs")).readFileSync(dok.archivPfad!).toString().startsWith("%PDF-1.4 Lexware"), "das PDF von Lexware ist eingefroren");
    // Täglicher Abgleich: bezahlt → Projekt startet
    const geld = await import("../src/lib/ablauf/geld");
    assert.match(await geld.lexwareAbgleich(), /0 bezahlt/);
    status = "paid";
    assert.match(await geld.lexwareAbgleich(), /1 bezahlt/);
    const [bezahlt] = await db.select().from(schema.rechnungen).where(eq(schema.rechnungen.id, r.id));
    assert.equal(bezahlt.status, "bezahlt");
    assert.ok((await db.select().from(schema.projekte).where(eq(schema.projekte.angebotId, a.id))).length === 1, "Projekt angelegt");
  } finally {
    globalThis.fetch = vorher;
    delete process.env.LEXWARE_API_KEY;
  }
});

test("Qonto: Lastschrift für den Monatsbeitrag nur nach Freigabe, Kunde unterschreibt das Mandat über Qonto", async () => {
  const vorher = globalThis.fetch;
  const aufrufe: { url: string; body: Record<string, unknown> }[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
    aufrufe.push({ url, body: init.body ? JSON.parse(String(init.body)) : {} });
    if (url.endsWith("/v2/clients")) return Response.json({ client: { id: "kunde-1" } });
    if (url.endsWith("/v2/sepa/direct_debit_subscriptions")) return Response.json({ direct_debit_subscription: { id: "abo-1", sign_url: "https://pay.qonto.example/sign" } });
    return new Response("unerwartet", { status: 500 });
  }) as typeof fetch;
  Object.assign(process.env, { QONTO_ACCESS_TOKEN: "qt_test", QONTO_KONTO_ID: "konto-1" });
  try {
    const { id } = await akquise.legeBetriebAn({ name: "Qonto Test GmbH", gewerk: "SHK", score: 60, scoreGrund: "Test", website: "qonto.example", email: "chef@qonto.example" }, "Test", "Test");
    const [p] = await db.insert(schema.projekte).values({ betriebId: id!, paket: "KOMPAKT", portalToken: "qonto-token-1234567890", status: "live" }).returning();
    const eintrag = await post.inPostausgang({ betriebId: id, projektId: p.id, kanal: "lastschrift", zweck: "lastschrift_start", empfaenger: "chef@qonto.example", betreff: "Lastschrift einrichten", text: "Monatsbeitrag 60,00 € netto (71,40 € brutto) per SEPA-Lastschrift über Qonto.", meta: { projektId: p.id, monatlichBrutto: 7140, ersterEinzug: "2027-03-01T00:00:00Z" } });
    await abarbeiten();
    assert.equal(aufrufe.length, 0, "vor der Freigabe nichts bei Qonto");
    await post.freigeben(eintrag, "Maximilian Steiner");
    await abarbeiten();
    const abo = aufrufe.find((x) => x.url.endsWith("/direct_debit_subscriptions"))!.body.direct_debit_subscription as Record<string, unknown>;
    assert.deepEqual(abo.amount, { value: "71.40", currency: "EUR" });
    assert.equal(abo.schedule_type, "monthly");
    assert.equal(abo.notify_client, true, "Qonto schickt Mandats-Link und kündigt Einzüge an");
    assert.equal(abo.client_id, "kunde-1");
    const [neu] = await db.select().from(schema.projekte).where(eq(schema.projekte.id, p.id));
    assert.equal(neu.qontoAboId, "abo-1");
  } finally {
    globalThis.fetch = vorher;
    delete process.env.QONTO_ACCESS_TOKEN;
    delete process.env.QONTO_KONTO_ID;
  }
});

test("Mail ohne gültige Adresse lässt sich nicht freigeben", async () => {
  const { id } = await akquise.legeBetriebAn({ name: "Ohne Mail GmbH", gewerk: "SHK", score: 50, scoreGrund: "Test", website: "ohne-mail.example" }, "Test", "Test");
  const e = await post.inPostausgang({ betriebId: id, kanal: "mail", zweck: "test", empfaenger: "(E-Mail-Adresse fehlt)", betreff: "x", text: "x" });
  await assert.rejects(() => post.freigeben(e, "Maximilian Steiner"), /E-Mail-Adresse/);
});

test("Rechnung über 10.000 € braucht zwei verschiedene Personen", async () => {
  const { id } = await akquise.legeBetriebAn({ name: "Groß GmbH", gewerk: "Elektro", score: 80, scoreGrund: "Test", website: "gross.example", email: "chef@gross.example" }, "Test", "Test");
  const [a] = await db.insert(schema.angebote).values({ betriebId: id!, paket: "PROFESSIONAL", einmalig: 2_000_000, monatlich: 59000, status: "versendet" }).returning();
  await verkauf.unterschriftEingegangen(a.id, "Test");
  await abarbeiten();
  const alle = await db.select().from(schema.postausgang).where(eq(schema.postausgang.betriebId, id!));
  const r = alle.find((x) => x.zweck === "rechnung")!;
  assert.equal(r.noetigeFreigaben, 2);
  assert.equal(await post.freigeben(r.id, "Maximilian Steiner"), "weitere_freigabe_noetig");
  await assert.rejects(() => post.freigeben(r.id, "Maximilian Steiner"), /zweite Freigabe/);
  assert.equal(await post.freigeben(r.id, "Daniel Lück"), "freigegeben");
});

test("Backup und Probe-Rücksicherung", async () => {
  const b = await betrieb.backup();
  assert.match(b, /levarex-/);
  const r = await betrieb.ruecksicherung();
  assert.match(r, /Betriebe wiederhergestellt/);
});

test("Microsoft 365: Anmeldung und Versand über Graph mit HTML und Anhang", async () => {
  const { sendeMail, aktiverMailDienst } = await import("../src/lib/adapters/mail");
  const { mailHtml } = await import("../src/lib/docs/mailvorlage");
  const vorher = globalThis.fetch;
  const aufrufe: { url: string; body: string; auth?: string }[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    aufrufe.push({ url, body: String(init.body), auth: (init.headers as Record<string, string>).Authorization });
    if (url.includes("login.microsoftonline.com")) return new Response(JSON.stringify({ access_token: "ms-token" }), { status: 200 });
    return new Response(null, { status: 202 });
  }) as typeof fetch;
  Object.assign(process.env, { MS_TENANT_ID: "tenant-1", MS_CLIENT_ID: "client-1", MS_CLIENT_SECRET: "geheim", MS_ABSENDER: "hallo@levarex.example", MAIL_ANTWORT_AN: "team@levarex.example" });
  try {
    assert.equal(aktiverMailDienst(), "microsoft");
    const r = await sendeMail({ an: "kunde@example.com", betreff: "Ihr Angebot", text: "Hallo", html: mailHtml({ betreff: "Ihr Angebot", text: "Hallo" }), anhaenge: [{ name: "Angebot.pdf", inhalt: Buffer.from("PDF") }] });
    assert.match(r, /Microsoft 365/);
    assert.equal(aufrufe[0].url, "https://login.microsoftonline.com/tenant-1/oauth2/v2.0/token");
    assert.match(aufrufe[0].body, /grant_type=client_credentials/);
    assert.equal(aufrufe[1].url, "https://graph.microsoft.com/v1.0/users/hallo%40levarex.example/sendMail");
    assert.equal(aufrufe[1].auth, "Bearer ms-token");
    const m = JSON.parse(aufrufe[1].body).message;
    assert.equal(m.body.contentType, "HTML");
    assert.match(m.body.content, /levarex-logo-mail\.png/);
    assert.equal(m.toRecipients[0].emailAddress.address, "kunde@example.com");
    assert.equal(m.replyTo[0].emailAddress.address, "team@levarex.example");
    assert.equal(m.attachments[0].contentBytes, Buffer.from("PDF").toString("base64"));
    assert.equal(JSON.parse(aufrufe[1].body).saveToSentItems, true);
  } finally {
    globalThis.fetch = vorher;
    for (const k of ["MS_TENANT_ID", "MS_CLIENT_ID", "MS_CLIENT_SECRET", "MS_ABSENDER", "MAIL_ANTWORT_AN"]) delete process.env[k];
  }
});

test("Google Workspace: signierte Anmeldung und Versand über die Gmail-API", async () => {
  const crypto = await import("node:crypto");
  const { sendeMail, aktiverMailDienst } = await import("../src/lib/adapters/mail");
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const vorher = globalThis.fetch;
  const aufrufe: { url: string; body: string }[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    aufrufe.push({ url, body: String(init.body) });
    if (url.startsWith("https://oauth2.googleapis.com/token")) return new Response(JSON.stringify({ access_token: "g-token" }), { status: 200 });
    return new Response(JSON.stringify({ id: "gmail-42" }), { status: 200 });
  }) as typeof fetch;
  Object.assign(process.env, { GOOGLE_CLIENT_EMAIL: "levarex@projekt.iam.gserviceaccount.com", GOOGLE_PRIVATE_KEY: privateKey.export({ type: "pkcs8", format: "pem" }).toString().replace(/\n/g, "\\n"), GOOGLE_ABSENDER: "hallo@levarex.example" });
  try {
    assert.equal(aktiverMailDienst(), "google");
    const r = await sendeMail({ an: "kunde@example.com", betreff: "Rechnung", text: "Nur Text", html: "<p>HTML-Fassung</p>", anhaenge: [{ name: "Rechnung.pdf", inhalt: Buffer.from("PDF") }] });
    assert.match(r, /gmail-42/);
    // Anmeldung: JWT mit gültiger Signatur, Bereich nur gmail.send, im Namen des Absenders
    const jwt = new URLSearchParams(aufrufe[0].body).get("assertion")!;
    const [k, i, sig] = jwt.split(".");
    assert.ok(crypto.createVerify("RSA-SHA256").update(`${k}.${i}`).verify(publicKey, Buffer.from(sig, "base64url")));
    const inhalt = JSON.parse(Buffer.from(i, "base64url").toString());
    assert.equal(inhalt.scope, "https://www.googleapis.com/auth/gmail.send");
    assert.equal(inhalt.sub, "hallo@levarex.example");
    // Versand: fertige MIME-Nachricht mit Text, HTML und Anhang
    assert.equal(aufrufe[1].url, "https://gmail.googleapis.com/gmail/v1/users/hallo%40levarex.example/messages/send");
    const mime = Buffer.from(JSON.parse(aufrufe[1].body).raw, "base64url").toString();
    assert.match(mime, /To: kunde@example.com/);
    assert.match(mime, /text\/plain/);
    assert.match(mime, /text\/html/);
    assert.match(mime, /filename=Rechnung.pdf/);
  } finally {
    globalThis.fetch = vorher;
    for (const k of ["GOOGLE_CLIENT_EMAIL", "GOOGLE_PRIVATE_KEY", "GOOGLE_ABSENDER"]) delete process.env[k];
  }
});

test("Mail-Design: Text wird maskiert, Links klickbar, Pflichtangaben im Fuß", async () => {
  const { mailHtml } = await import("../src/lib/docs/mailvorlage");
  const html = mailHtml({ betreff: "Test <b>", text: "Hallo <script>alert(1)</script>\n\nPortal: https://os.levarex.example/portal/k/abc." });
  assert.ok(!html.includes("<script>"), "kein Skript");
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /<a href="https:\/\/os.levarex.example\/portal\/k\/abc"/);
  assert.match(html, /Handelsregister|Amtsgericht|Geschäftsführ/);
  assert.ok(!/<svg|<style|class=/.test(html), "nur Inline-Styles, keine SVG (Gmail, Outlook)");
});

test("Nachrichten: WhatsApp, Telefon, Mail landen beim Betrieb; Antwort nur als Entwurf über die Freigabe", async () => {
  const n = await import("../src/lib/ablauf/nachrichten");
  const { id } = await akquise.legeBetriebAn({ name: "Kanal Elektro GmbH", gewerk: "Elektro", score: 70, scoreGrund: "Test", telefon: "0721 123456", email: "info@kanal-elektro.example" }, "Test", "Test");
  // WhatsApp von der bekannten Nummer (andere Schreibweise) → zugeordnet, Aufgabe, Entwurf
  const w = await n.nachrichtEingang({ kanal: "whatsapp", absender: "+49 721 123456", inhalt: "Können Sie nächste Woche vorbeikommen?", externeId: "wamid.1" }, "Test");
  assert.equal(w.betriebId, id);
  const doppelt = await n.nachrichtEingang({ kanal: "whatsapp", absender: "+49721123456", inhalt: "Können Sie nächste Woche vorbeikommen?", externeId: "wamid.1" }, "Test");
  assert.equal(doppelt.id, w.id);
  assert.equal(doppelt.neu, false, "Webhook zweimal → nur einmal gespeichert");
  await abarbeiten();
  const aufgaben = await db.select().from(schema.aktivitaeten).where(eq(schema.aktivitaeten.betriebId, id!));
  assert.ok(aufgaben.some((a) => a.titel.startsWith("WhatsApp beantworten")));
  const entwurf = (await db.select().from(schema.postausgang).where(eq(schema.postausgang.betriebId, id!))).find((e) => e.zweck === "antwort")!;
  assert.equal(entwurf.kanal, "whatsapp");
  assert.equal(entwurf.status, "zur_freigabe", "Bot schreibt nur Entwürfe");
  assert.notEqual(entwurf.qkStatus, "blockiert", entwurf.hinweise.join(" | "));
  await post.freigeben(entwurf.id, "Daniel Lück");
  await abarbeiten();
  const sim = await db.select().from(schema.simulatorPost).where(eq(schema.simulatorPost.kanal, "whatsapp"));
  assert.equal(sim.at(-1)!.an, "+49721123456");
  const verlauf = await db.select().from(schema.nachrichten).where(eq(schema.nachrichten.betriebId, id!));
  assert.ok(verlauf.some((x) => x.richtung === "aus" && x.kanal === "whatsapp"), "Antwort steht im Verlauf");
  assert.equal(verlauf.find((x) => x.id === w.id)!.status, "erledigt");

  // Telefon: Rückruf-Aufgabe für heute, kein Entwurf
  await n.nachrichtEingang({ kanal: "telefon", absender: "0721/123456", inhalt: "Verpasster Anruf", dauerSek: 0, externeId: "call-1" }, "Test");
  assert.ok((await db.select().from(schema.aktivitaeten).where(eq(schema.aktivitaeten.betriebId, id!))).some((a) => a.titel.startsWith("Rückruf")));

  // WhatsApp an jemanden, der nicht geschrieben hat: Qualitätskontrolle blockiert (kein Erstkontakt, 24-Stunden-Regel)
  const kalt = await post.inPostausgang({ betriebId: id, kanal: "whatsapp", zweck: "test", empfaenger: "+49 170 9999999", betreff: "x", text: "Guten Tag, kurze Frage zu Ihrer Website." });
  await abarbeiten();
  const k = await post.eintrag(kalt);
  assert.equal(k.qkStatus, "blockiert");
  assert.ok(k.hinweise.some((h) => /24 Stunden/.test(h)));

  // Unbekannter Absender: kein Entwurf, erst nach Zuordnung
  const u = await n.nachrichtEingang({ kanal: "mail", absender: "fremd@example.com", betreff: "Anfrage", inhalt: "Was kostet eine Website?" }, "Test");
  assert.equal(u.betriebId, null);
  assert.equal((await n.unbekannteNachrichten()).length, 1);
  await n.nachrichtZuordnen(u.id, id!, "Daniel Lück");
  await abarbeiten();
  const mailEntwurf = (await db.select().from(schema.postausgang).where(eq(schema.postausgang.betriebId, id!))).find((e) => e.zweck === "antwort" && e.kanal === "mail")!;
  assert.equal(mailEntwurf.empfaenger, "fremd@example.com");
  assert.match(mailEntwurf.betreff, /^AW: Anfrage/);

  // Datenschutz: Auskunft enthält Nachrichten
  const ds = await import("../src/lib/ablauf/datenschutz");
  const auskunft = await ds.datenauskunft(id!, "Test");
  assert.ok(auskunft.nachrichten.length >= 4);
  await assert.rejects(() => n.nachrichtEingang({ kanal: "fax", absender: "x", inhalt: "y" }, "Test"), /Unbekannter Kanal/);
});

test("Verträge: Rahmenvertrag und Leistungsscheine, Unterschrift auf dem Tablet, danach im Portal", async () => {
  const fs = await import("node:fs");
  const bild = `data:image/png;base64,${fs.readFileSync(new URL("./unterschrift-muster.b64", import.meta.url), "utf8").trim()}`;
  const vt = await import("../src/lib/ablauf/vertraege");
  const { id } = await akquise.legeBetriebAn({ name: "Tablet Elektro GmbH", gewerk: "Elektro", score: 70, scoreGrund: "Test", website: "tablet.example", email: "chef@tablet.example", strasse: "Weg 2", plz: "76297", ort: "Stutensee" }, "Test", "Test");
  const { angebotId } = await verkauf.erstelleAngebot({ betriebId: id!, auswahl: { paket: "PROFESSIONAL", module: ["personal"], zusaetze: ["foto"] }, wer: "Daniel Lück" });
  const doks = await vt.vertragsunterlagen(angebotId);
  // Rahmenvertrag + Webauftritt (Erstellung, Betrieb) + Personal (Erstellung, Betrieb) + Fotoshooting (nur Erstellung)
  assert.deepEqual(doks.map((d) => d.art), ["rahmenvertrag", "leistungsschein_erstellung", "leistungsschein_betrieb", "leistungsschein_erstellung", "leistungsschein_betrieb", "leistungsschein_erstellung"]);
  assert.equal((await vt.vertragsunterlagen(angebotId)).length, 6, "nicht doppelt");
  const ls = doks[1].daten as { punkte: string[]; preis: number; kalkulation: { stunden: number } };
  assert.equal(ls.punkte.length, 5);
  assert.equal(ls.preis, 299000);
  assert.equal(ls.kalkulation.stunden, 8, "Kalkulation je Leistung dokumentiert");

  const eingabe = { angebotId, kunde: { name: "Paul Tablet", funktion: "Inhaber", unternehmer: true }, bilder: Object.fromEntries(doks.map((d) => [d.id, bild])), levarex: { name: "Daniel Lück", bild }, wer: "Daniel Lück" };
  // Ohne jede einzelne Unterschrift geht nichts
  await assert.rejects(() => vt.vertragUnterschreiben({ ...eingabe, bilder: { [doks[0].id]: bild } }), /Unterschrift fehlt: Leistungsschein/);
  await assert.rejects(() => vt.vertragUnterschreiben({ ...eingabe, kunde: { ...eingabe.kunde, unternehmer: false } }), /§ 14 BGB/);
  await vt.vertragUnterschreiben(eingabe);
  const [a] = await db.select().from(schema.angebote).where(eq(schema.angebote.id, angebotId));
  assert.equal(a.status, "unterschrieben");
  assert.equal((await db.select().from(schema.unterschriften).where(eq(schema.unterschriften.angebotId, angebotId))).length, 12, "je Dokument Kunde und Levarex");
  // Die nicht versendete Angebots-Mail ist überholt, die Auftragsbestätigung bringt alle Verträge mit
  const post = await db.select().from(schema.postausgang).where(eq(schema.postausgang.betriebId, id!));
  assert.equal(post.find((p) => p.zweck === "angebot")!.status, "abgelehnt");
  const ab = post.find((p) => p.zweck === "auftragsbestaetigung")!;
  for (const d of doks) assert.ok(ab.anhaenge.includes(d.id), `Anhang ${d.titel}`);
  await abarbeiten();
  const [abNeu] = await db.select().from(schema.postausgang).where(eq(schema.postausgang.id, ab.id));
  assert.notEqual(abNeu.qkStatus, "blockiert", abNeu.hinweise.join(" | "));
  assert.ok(abNeu.hinweise.some((h) => h.includes("Entwurf")), "Hinweis: Vertragstexte noch Entwurf");
  // PDF mit eingebetteter Unterschrift lässt sich sauber erzeugen
  const { dokumentPdf } = await import("../src/lib/docs/render");
  const [rv] = await db.select().from(schema.dokumente).where(eq(schema.dokumente.id, doks[0].id));
  assert.ok((await dokumentPdf(rv)).length > 5000);
  // Nach Freigabe liegen die Verträge im Kundenportal
  await post_freigeben(ab.id);
  const portal = await import("../src/lib/kundenportal");
  const sicht = await portal.portalDaten(id!);
  assert.ok(sicht.dokumente.some((d) => d.art === "rahmenvertrag"));
  assert.equal(sicht.dokumente.filter((d) => d.art.startsWith("leistungsschein")).length, 5);
  // Zweimal unterschreiben geht nicht
  await assert.rejects(() => vt.vertragUnterschreiben(eingabe), /Status/);
});

async function post_freigeben(id: number) {
  await post.freigeben(id, "Daniel Lück");
  await abarbeiten();
}
