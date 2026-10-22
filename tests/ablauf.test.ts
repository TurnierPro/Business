import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Spielt den kompletten Ablauf mit Simulatoren durch: Lead → Brief → Termin → Angebot → Zahlung → Livegang.
process.env.DATABASE_URL = "memory://";
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "nexova-test-"));
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

  // Annahme im Portal → Anzahlung über Stripe (Simulator): keine eigene Rechnung, Stripe-Rechnung bezahlt
  const angebotId = Number(angebotMail.meta.angebotId);
  await verkauf.unterschriftEingegangen(angebotId, "Simulator");
  await abarbeiten();
  assert.equal((await db.select().from(schema.postausgang).where(eq(schema.postausgang.zweck, "rechnung"))).length, 0, "keine doppelte Rechnung neben Stripe");
  const zahlung = await import("../src/lib/ablauf/zahlung");
  assert.match(await zahlung.anzahlungsLink(angebotId), /zahlung-simulator/);
  const projektId = await verkauf.zahlungEingegangen(angebotId, "Simulator");
  assert.equal(await verkauf.zahlungEingegangen(angebotId, "Simulator"), projektId, "doppelte Zahlungsmeldung legt nichts doppelt an");
  await abarbeiten();
  const kickoff = await offeneFreigabe("kickoff");
  await post.freigeben(kickoff.id, "Max Steiner");

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

  // Livegang freigeben → live; Betreuung wartet als Zahlung auf Freigabe, Kunde wird um Abnahme gebeten
  const live = await offeneFreigabe("livegang");
  await post.freigeben(live.id, "Max Steiner");
  await abarbeiten();
  const [fertig] = await db.select().from(schema.projekte).where(eq(schema.projekte.id, projektId));
  assert.equal(fertig.status, "live");
  assert.equal(fertig.abnahmeStatus, "offen");
  assert.equal(fertig.abnahmeFrist, null, "Frist läuft erst nach Versand der Aufforderung");
  assert.equal((await db.select().from(schema.postausgang).where(eq(schema.postausgang.zweck, "schlusszahlung"))).length, 0, "keine Schlusszahlung vor der Abnahme");
  const betreuung = await offeneFreigabe("betreuung_start");
  const aufforderung = await offeneFreigabe("abnahme_aufforderung");
  await post.freigeben(aufforderung.id, "Max Steiner");
  await abarbeiten();
  const [mitFrist] = await db.select().from(schema.projekte).where(eq(schema.projekte.id, projektId));
  assert.ok(mitFrist.abnahmeFrist && mitFrist.abnahmeFrist > new Date(Date.now() + 13 * 864e5));

  // Abnahme im Portal mit Mängeln → Abnahmeprotokoll und Schlusszahlung zur Freigabe
  const vertrag = await import("../src/lib/ablauf/vertrag");
  await assert.rejects(() => vertrag.abnahmeErklaeren(projektId, { ergebnis: "vorbehalt", name: "Thomas Muster", maengel: "" }), /Mängel/);
  await vertrag.abnahmeErklaeren(projektId, { ergebnis: "vorbehalt", name: "Thomas Muster", maengel: "Telefonnummer im Kopf fehlt" });
  await abarbeiten();
  const protokollMail = await offeneFreigabe("abnahme_bestaetigung");
  await post.freigeben(protokollMail.id, "Max Steiner");
  const schlusszahlung = await offeneFreigabe("schlusszahlung");
  const vorFreigabe = await db.select().from(schema.rechnungen);
  assert.deepEqual(vorFreigabe.map((r) => r.art), ["anzahlung"], "ohne Freigabe wird nichts eingezogen");
  await post.freigeben(schlusszahlung.id, "Max Steiner");
  await post.freigeben(betreuung.id, "Max Steiner");
  const bestaetigung = await offeneFreigabe("auftragsbestaetigung");
  await post.freigeben(bestaetigung.id, "Daniel Lück");
  await abarbeiten();
  const rechnungen = await db.select().from(schema.rechnungen);
  assert.deepEqual(rechnungen.map((r) => [r.art, r.quelle, r.status]), [["anzahlung", "stripe", "bezahlt"], ["schluss", "stripe", "bezahlt"]]);
  const [mitAbo] = await db.select().from(schema.projekte).where(eq(schema.projekte.id, projektId));
  assert.ok(mitAbo.stripeAboId);
  assert.ok((await aufgabe("Angebot nachfassen"))?.erledigtAm, "Nachfassen erledigt sich mit der Annahme");
  const { checkliste } = await import("../src/lib/ablauf/checkliste");
  const punkte = await checkliste(projektId);
  for (const k of ["anzahlung", "kickoff", "inhalte", "gebaut", "livegang", "domain", "abnahme"]) assert.ok(punkte.find((x) => x.schluessel === k)?.erledigtAm, `Checkliste: ${k} abgehakt`);
  assert.ok(punkte.some((x) => x.titel.startsWith("Karriereseite")), "Paket M hat Karriere-Schritte");
  const [angenommen] = await db.select().from(schema.angebote).where(eq(schema.angebote.id, angebotId));
  assert.equal(angenommen.status, "abgeschlossen");
  assert.ok(angenommen.annahme?.agbVersion, "Annahme-Nachweis gespeichert");

  // Nachtrag für Bestandskunden: Status bleibt „Kunde“
  await verkauf.erstelleAngebot({ betriebId: lead.id, auswahl: { paket: "S", module: ["m1"], zusaetze: [] }, wer: "Daniel Lück" });
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
  process.env.MAIL_FROM = "Nexova Consulting <hallo@nexova.example>";
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
  await assert.rejects(() => post.freigeben(e, "Max Steiner"), /Qualitätskontrolle läuft/);
  await abarbeiten();
  const [x] = await db.select().from(schema.postausgang).where(eq(schema.postausgang.id, e));
  assert.equal(x.qkStatus, "hinweise");
  assert.ok(x.hinweise.some((h) => h.includes("50 %")));
  assert.ok(x.hinweise.some((h) => h.includes("garantiert")));
});

test("Finanz-Agenten: Mahnstufen und Betreuungsrechnung", async () => {
  const agenten = await import("../src/lib/ablauf/finanzagenten");
  // Weg ohne Stripe: eigene Rechnung, die offen bleibt
  process.env.ZAHLUNGSWEG = "ueberweisung";
  const { id } = await akquise.legeBetriebAn({ name: "Überweiser GmbH", gewerk: "Maler", score: 60, scoreGrund: "Test", website: "ueberweiser.example", email: "chef@ueberweiser.example" }, "Test", "Test");
  const [a] = await db.insert(schema.angebote).values({ betriebId: id!, paket: "S", einmalig: 349000, monatlich: 14900, status: "versendet" }).returning();
  await verkauf.unterschriftEingegangen(a.id, "Test");
  delete process.env.ZAHLUNGSWEG;
  const [r] = await db.select().from(schema.rechnungen).where(eq(schema.rechnungen.betriebId, id!));
  assert.ok(r.faelligAm, "Rechnung hat ein Fälligkeitsdatum");
  const tag = (n: number) => new Date(r.faelligAm!.getTime() + n * 864e5);
  assert.match(await agenten.zahlungserinnerungen(tag(1)), /^0 /, "vor Ablauf von 3 Tagen nichts");
  assert.match(await agenten.zahlungserinnerungen(tag(4)), /^1 /);
  assert.match(await agenten.zahlungserinnerungen(tag(4)), /^0 /, "keine doppelte Erinnerung");
  const erinnerung = await offeneFreigabe("zahlungserinnerung");
  await post.qualitaetskontrolle(erinnerung.id);
  await post.freigeben(erinnerung.id, "Max Steiner");
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
  const r2 = await agenten.betreuungsrechnungen(new Date(Date.now() + 40 * 864e5));
  assert.match(r2, /^0 Betreuungsrechnungen/, "ohne Livegang keine Betreuungsrechnung");
});

test("Ohne Stripe: Abnahme durch Fristablauf, Schlussrechnung zieht Anzahlung ab", async () => {
  process.env.ZAHLUNGSWEG = "ueberweisung";
  try {
    const vertrag = await import("../src/lib/ablauf/vertrag");
    const { id } = await akquise.legeBetriebAn({ name: "Frist GmbH", gewerk: "SHK", score: 60, scoreGrund: "Test", website: "frist.example", email: "chef@frist.example" }, "Test", "Test");
    const [a] = await db.insert(schema.angebote).values({ betriebId: id!, paket: "S", einmalig: 349000, monatlich: 14900, status: "angezahlt" }).returning();
    await db.insert(schema.rechnungen).values({ nummer: "2026-9001", lfdNr: 9001, jahr: 2026, betriebId: id!, angebotId: a.id, art: "anzahlung", netto: 174500, status: "bezahlt" });
    const [p] = await db.insert(schema.projekte).values({ betriebId: id!, angebotId: a.id, paket: "S", portalToken: "frist-token-1234567890", status: "live", liveAm: new Date(), abnahmeStatus: "offen", abnahmeFrist: new Date(Date.now() - 864e5) }).returning();
    assert.match(await vertrag.abnahmefiktion(), /^1 /);
    const [nach] = await db.select().from(schema.projekte).where(eq(schema.projekte.id, p.id));
    assert.equal(nach.abnahmeStatus, "fiktion");
    const [schluss] = (await db.select().from(schema.rechnungen).where(eq(schema.rechnungen.betriebId, id!))).filter((x) => x.art === "schluss");
    assert.equal(schluss.netto, 349000 - 174500);
    const [dok] = (await db.select().from(schema.dokumente).where(eq(schema.dokumente.betriebId, id!))).filter((d) => d.art === "rechnung");
    const daten = dok.daten as { positionen: { netto: number; text: string }[]; zahlbarBis: string; leistung: string };
    assert.deepEqual(daten.positionen.map((x) => x.netto), [349000, -174500]);
    assert.match(daten.positionen[1].text, /2026-9001/);
    assert.match(daten.zahlbarBis, /^\d\d\.\d\d\.\d{4}$/);
    assert.match(daten.leistung, /Abnahme/);
    const { dokumentHtml } = await import("../src/lib/docs/render");
    assert.match(dokumentHtml(dok), /zahlbar|bis zum/);
    assert.match(await vertrag.abnahmefiktion(), /^0 /, "nicht doppelt");

    // Kündigung: 12 Monate Mindestlaufzeit ab Betreuungsstart
    await db.update(schema.projekte).set({ aboAb: new Date("2027-02-10T10:00:00Z") }).where(eq(schema.projekte.id, p.id));
    const ende = await vertrag.kuendigungErfassen(p.id, "Test", new Date("2027-05-03T10:00:00Z"));
    assert.equal(ende.toISOString().slice(0, 7), "2028-02");
    assert.match(await vertrag.vertragsende(new Date("2028-03-01T10:00:00Z")), /^1 /);
  } finally {
    delete process.env.ZAHLUNGSWEG;
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
  const [p] = await db.insert(schema.projekte).values({ betriebId: id!, paket: "S", portalToken: "umzug-token-1234567890" }).returning();
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

  // Livegang: statt Abnahme kommt zuerst die Anleitung
  const live = (await db.select().from(schema.postausgang).where(eq(schema.postausgang.projektId, p.id))).find((e) => e.zweck === "livegang")!;
  await post.freigeben(live.id, "Max Steiner");
  await abarbeiten();
  const zwecke = async () => (await db.select().from(schema.postausgang).where(eq(schema.postausgang.projektId, p.id))).map((e) => e.zweck);
  assert.ok((await zwecke()).includes("umzug_anleitung"));
  assert.ok(!(await zwecke()).includes("abnahme_aufforderung"), "Abnahme erst nach der Umstellung");
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

  // Kunde stellt um → Agent merkt es, Kündigungshinweis und Abnahme
  assert.match(await umzug.umstellungPruefen(), /^0 /);
  process.env.DNS_SIMULATOR_UMGESTELLT = "ja";
  try {
    assert.match(await umzug.umstellungPruefen(), /^1 /);
  } finally {
    delete process.env.DNS_SIMULATOR_UMGESTELLT;
  }
  assert.ok((await zwecke()).includes("umzug_fertig"));
  assert.ok((await zwecke()).includes("abnahme_aufforderung"));
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
  assert.equal((await route.GET(anfrage("GET", undefined, "nxv_falsch"))).status, 401);

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
  const [kp] = await db.insert(schema.projekte).values({ betriebId: pinsel.id, paket: "S", portalToken: "ticket-token-1234567890", status: "live" }).returning();
  const tid = await tickets.ticketAnlegen({ betriebId: pinsel.id, betreff: "Neue Öffnungszeiten", beschreibung: "Ab November Mo–Fr 7–16 Uhr", quelle: "portal" }, "Kunde (Portal)");
  await tickets.ticketZeit(tid, 20, "Öffnungszeiten geändert", "Max Steiner");
  await tickets.ticketZeit(tid, 20, "Handy-Ansicht geprüft", "Max Steiner");
  const k = await tickets.kontingent(pinsel.id);
  assert.deepEqual([k.enthalten, k.verbraucht, k.ueber], [30, 40, 10]);
  await tickets.ticketAntworten(tid, "Die neuen Öffnungszeiten stehen jetzt auf Ihrer Website.", true, "Max Steiner");
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
  const vorher = PAKETE.S.einmalig;
  const { id } = await akquise.legeBetriebAn({ name: "Katalog GmbH", gewerk: "SHK", score: 60, scoreGrund: "Test", website: "katalog.example", email: "a@katalog.example" }, "Test", "Test");
  const alt = await verkauf.erstelleAngebot({ betriebId: id!, auswahl: { paket: "S", module: [], zusaetze: [] }, wer: "Test" });
  await kdb.paketSpeichern("S", { name: "S – Anfragen Plus", einmalig: "3.990,00", monatlich: "159,00", wochen: "4", inklusiveModule: "0", inhalt: "Website\nGoogle-Profil", nichtEnthalten: "Shop", aenderungsMinuten: "45", zielStunden: "10", aktiv: "ja" }, "Max Steiner");
  assert.equal(PAKETE.S.einmalig, 399000);
  assert.equal(berechne({ paket: "S", module: [], zusaetze: [] }).einmalig, 399000);
  await assert.rejects(() => kdb.paketSpeichern("S", { name: "", einmalig: "1", monatlich: "1" }, "Max"), /Name/);
  await assert.rejects(() => kdb.paketSpeichern("S", { name: "X", einmalig: "-5", monatlich: "1" }, "Max"), /Betrag/);
  // Neues Modul und Kombi-Regel aus den Daten
  const neu = await kdb.modulSpeichern(null, { name: "Bewertungs-Erinnerung", text: "Bittet zufriedene Kunden um eine Bewertung", einmalig: "290", monatlich: "19", stufe: "1", aktiv: "ja" }, "Max Steiner");
  const r = berechne({ paket: "M", module: ["m1", "m2", neu], zusaetze: [] });
  assert.ok(r.positionen.some((x) => x.text.includes("Bewertungs-Erinnerung") && x.einmalig === 29000));
  assert.ok(r.positionen.some((x) => x.text.includes("Modul 2") && x.einmalig === 49000), "Kombi-Preis Modul 2 mit Modul 1");
  // Neues Angebot hat neuen Inhalt, altes behält den eingefrorenen
  const n = await verkauf.erstelleAngebot({ betriebId: id!, auswahl: { paket: "S", module: [], zusaetze: [] }, wer: "Test" });
  const doks = await db.select().from(schema.dokumente).where(eq(schema.dokumente.betriebId, id!));
  const daten = (nr: string) => doks.find((d) => (d.daten as { nummer?: string }).nummer === nr)!.daten as { einmalig: number; paketName: string; paketInhalt: string[] };
  assert.equal(daten(n.nummer).paketName, "S – Anfragen Plus");
  assert.equal(daten(alt.nummer).einmalig, vorher);
  assert.notEqual(daten(alt.nummer).paketName, "S – Anfragen Plus");
  await kdb.zuruecksetzen("paket", "S", "Max Steiner");
  await kdb.zuruecksetzen("modul", neu, "Max Steiner");
  assert.equal(PAKETE.S.einmalig, vorher, "Werkseinstellung wiederhergestellt");

  const soll = await import("../src/lib/soll");
  const werte = await soll.sollwerte();
  assert.equal(werte.length, 24);
  assert.equal(await soll.sollSpeichern([{ monat: "2027-03", umsatz: 2_000_000, auftraege: 5 }], "Max Steiner"), 1);
  assert.equal((await soll.sollwerte()).find((x) => x.monat === "2027-03")?.umsatz, 2_000_000);
  await assert.rejects(() => soll.sollSpeichern([{ monat: "2030-01", umsatz: 1, auftraege: 1 }], "Max"), /Planzeitraum/);
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
  const neu = await kp.portalLinkErneuern(id!, "Max Steiner");
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
  await u.speichern(key, { status: "erledigt", notiz: "vom Anwalt", datei: new File([Buffer.from("pdf")], "agb.pdf") }, "Max Steiner");
  assert.equal((await u.stand()).get(key)?.status, "erledigt");
  assert.equal((await u.datei(key))?.name, "agb.pdf");
  await assert.rejects(() => u.speichern(key, { status: "kaputt", notiz: "", datei: null }, "Max Steiner"), /Status/);
  await assert.rejects(() => u.speichern("gibt-es-nicht", { status: "offen", notiz: "", datei: null }, "Max Steiner"), /Unbekannte/);
});

test("Angebot vor Ort: Paket L mit Modulen und Zusatzleistung", async () => {
  const { berechne } = await import("../src/lib/katalog");
  const r = berechne({ paket: "L", module: ["m1", "m2", "m3", "m7"], zusaetze: ["foto", "prozesscheck"] });
  // L 8.900 + 3 Module inklusive + Modul 7 (490) + Foto (790); Prozess-Check ist in L enthalten
  assert.equal(r.einmalig, 890000 + 49000 + 79000);
  assert.equal(r.monatlich, 59000 + 2900);
  const s = berechne({ paket: "S", module: ["m1", "m2", "m5"], zusaetze: [] });
  assert.equal(s.einmalig, 349000 + 99000 + 49000 + 99000, "Modul 2 günstiger mit Modul 1");
  assert.ok(s.hinweise.some((h) => h.includes("Prozess-Check")));

  const { id } = await akquise.legeBetriebAn({ name: "Vor Ort GmbH", gewerk: "SHK", score: 70, scoreGrund: "Test", website: "vorort.example", email: "chef@vorort.example", strasse: "Weg 1", plz: "76131", ort: "Karlsruhe" }, "Test", "Test");
  const { eintragId } = await verkauf.erstelleAngebot({ betriebId: id!, auswahl: { paket: "M", module: ["m3"], zusaetze: ["foto"] }, wer: "Daniel Lück" });
  await abarbeiten();
  const [e] = await db.select().from(schema.postausgang).where(eq(schema.postausgang.id, eintragId));
  assert.notEqual(e.qkStatus, "blockiert", e.hinweise.join(" | "));
  const [a] = await db.select().from(schema.angebote).where(eq(schema.angebote.id, Number(e.meta.angebotId)));
  assert.equal(a.einmalig, 490000 + 29000 + 79000);
  assert.equal(a.positionen.length, 3);
});

test("Stripe-Webhook: echte Signatur nötig, Zahlung wird verbucht", async () => {
  const Stripe = (await import("stripe")).default;
  process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  try {
    const { id } = await akquise.legeBetriebAn({ name: "Webhook GmbH", gewerk: "SHK", score: 70, scoreGrund: "Test", website: "webhook.example", email: "chef@webhook.example" }, "Test", "Test");
    const [a] = await db.insert(schema.angebote).values({ betriebId: id!, paket: "S", einmalig: 349000, monatlich: 14900, status: "unterschrieben" }).returning();
    const zahlung = await import("../src/lib/ablauf/zahlung");
    const nutzlast = JSON.stringify({ id: "evt_1", object: "event", type: "checkout.session.completed", data: { object: { id: "cs_1", object: "checkout.session", payment_status: "paid", metadata: { angebotId: String(a.id) }, customer: "cus_1", payment_intent: null, invoice: null } } });
    await assert.rejects(() => zahlung.stripeEreignis(nutzlast, "t=1,v1=falsch"));
    const signatur = new Stripe("sk_test_dummy").webhooks.generateTestHeaderString({ payload: nutzlast, secret: "whsec_test" });
    assert.match(await zahlung.stripeEreignis(nutzlast, signatur), /Anzahlung verbucht/);
    const [b] = await db.select().from(schema.betriebe).where(eq(schema.betriebe.id, id!));
    assert.equal(b.stripeKundeId, "cus_1");
  } finally {
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
  }
});

test("Mail ohne gültige Adresse lässt sich nicht freigeben", async () => {
  const { id } = await akquise.legeBetriebAn({ name: "Ohne Mail GmbH", gewerk: "SHK", score: 50, scoreGrund: "Test", website: "ohne-mail.example" }, "Test", "Test");
  const e = await post.inPostausgang({ betriebId: id, kanal: "mail", zweck: "test", empfaenger: "(E-Mail-Adresse fehlt)", betreff: "x", text: "x" });
  await assert.rejects(() => post.freigeben(e, "Max Steiner"), /E-Mail-Adresse/);
});

test("Rechnung über 10.000 € braucht zwei verschiedene Personen", async () => {
  process.env.ZAHLUNGSWEG = "ueberweisung";
  after(() => { delete process.env.ZAHLUNGSWEG; });
  const { id } = await akquise.legeBetriebAn({ name: "Groß GmbH", gewerk: "Elektro", score: 80, scoreGrund: "Test", website: "gross.example", email: "chef@gross.example" }, "Test", "Test");
  const [a] = await db.insert(schema.angebote).values({ betriebId: id!, paket: "L", einmalig: 2_000_000, monatlich: 59000, status: "versendet" }).returning();
  await verkauf.unterschriftEingegangen(a.id, "Test");
  await abarbeiten();
  const alle = await db.select().from(schema.postausgang).where(eq(schema.postausgang.betriebId, id!));
  const r = alle.find((x) => x.zweck === "rechnung")!;
  assert.equal(r.noetigeFreigaben, 2);
  assert.equal(await post.freigeben(r.id, "Max Steiner"), "weitere_freigabe_noetig");
  await assert.rejects(() => post.freigeben(r.id, "Max Steiner"), /zweite Freigabe/);
  assert.equal(await post.freigeben(r.id, "Daniel Lück"), "freigegeben");
});

test("Backup und Probe-Rücksicherung", async () => {
  const b = await betrieb.backup();
  assert.match(b, /nexova-/);
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
  Object.assign(process.env, { MS_TENANT_ID: "tenant-1", MS_CLIENT_ID: "client-1", MS_CLIENT_SECRET: "geheim", MS_ABSENDER: "hallo@nexova.example", MAIL_ANTWORT_AN: "team@nexova.example" });
  try {
    assert.equal(aktiverMailDienst(), "microsoft");
    const r = await sendeMail({ an: "kunde@example.com", betreff: "Ihr Angebot", text: "Hallo", html: mailHtml({ betreff: "Ihr Angebot", text: "Hallo" }), anhaenge: [{ name: "Angebot.pdf", inhalt: Buffer.from("PDF") }] });
    assert.match(r, /Microsoft 365/);
    assert.equal(aufrufe[0].url, "https://login.microsoftonline.com/tenant-1/oauth2/v2.0/token");
    assert.match(aufrufe[0].body, /grant_type=client_credentials/);
    assert.equal(aufrufe[1].url, "https://graph.microsoft.com/v1.0/users/hallo%40nexova.example/sendMail");
    assert.equal(aufrufe[1].auth, "Bearer ms-token");
    const m = JSON.parse(aufrufe[1].body).message;
    assert.equal(m.body.contentType, "HTML");
    assert.match(m.body.content, /NE.*X.*OVA/s);
    assert.equal(m.toRecipients[0].emailAddress.address, "kunde@example.com");
    assert.equal(m.replyTo[0].emailAddress.address, "team@nexova.example");
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
  Object.assign(process.env, { GOOGLE_CLIENT_EMAIL: "nexova@projekt.iam.gserviceaccount.com", GOOGLE_PRIVATE_KEY: privateKey.export({ type: "pkcs8", format: "pem" }).toString().replace(/\n/g, "\\n"), GOOGLE_ABSENDER: "hallo@nexova.example" });
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
    assert.equal(inhalt.sub, "hallo@nexova.example");
    // Versand: fertige MIME-Nachricht mit Text, HTML und Anhang
    assert.equal(aufrufe[1].url, "https://gmail.googleapis.com/gmail/v1/users/hallo%40nexova.example/messages/send");
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
  const html = mailHtml({ betreff: "Test <b>", text: "Hallo <script>alert(1)</script>\n\nPortal: https://os.nexova.example/portal/k/abc." });
  assert.ok(!html.includes("<script>"), "kein Skript");
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /<a href="https:\/\/os.nexova.example\/portal\/k\/abc"/);
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
