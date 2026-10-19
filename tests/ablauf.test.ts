import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Spielt den kompletten Ablauf mit Simulatoren durch: Lead → Brief → Termin → Angebot → Zahlung → Livegang.
process.env.DATABASE_URL = "memory://";
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "stelax-test-"));
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
  form.set("domain", "sanitaer-muster.example");
  form.set("stellen", "Anlagenmechaniker SHK (m/w/d)\nAzubi SHK (m/w/d)");
  await lieferung.inhalteEinreichen(p.portalToken, form);
  await abarbeiten();
  const [gebaut] = await db.select().from(schema.projekte).where(eq(schema.projekte.id, projektId));
  assert.equal(gebaut.status, "bereit", JSON.stringify(gebaut.pruefung));

  // Livegang freigeben → live; Schlusszahlung und Betreuung warten als Zahlung auf Freigabe
  const live = await offeneFreigabe("livegang");
  await post.freigeben(live.id, "Max Steiner");
  await abarbeiten();
  const [fertig] = await db.select().from(schema.projekte).where(eq(schema.projekte.id, projektId));
  assert.equal(fertig.status, "live");
  const schlusszahlung = await offeneFreigabe("schlusszahlung");
  const betreuung = await offeneFreigabe("betreuung_start");
  const vorFreigabe = await db.select().from(schema.rechnungen);
  assert.deepEqual(vorFreigabe.map((r) => r.art), ["anzahlung"], "ohne Freigabe wird nichts eingezogen");
  await post.freigeben(schlusszahlung.id, "Max Steiner");
  await post.freigeben(betreuung.id, "Max Steiner");
  await abarbeiten();
  const rechnungen = await db.select().from(schema.rechnungen);
  assert.deepEqual(rechnungen.map((r) => [r.art, r.quelle, r.status]), [["anzahlung", "stripe", "bezahlt"], ["schluss", "stripe", "bezahlt"]]);
  const [mitAbo] = await db.select().from(schema.projekte).where(eq(schema.projekte.id, projektId));
  assert.ok(mitAbo.stripeAboId);

  // Kundenportal: alles abgehakt, beide Stripe-Rechnungen sichtbar, interne Dokumente nie
  const portal = await import("../src/lib/kundenportal");
  const sicht = await portal.portalDaten(lead.id);
  assert.ok(sicht.schritte.every((x) => x.erledigt), JSON.stringify(sicht.schritte.map((x) => [x.titel, x.erledigt])));
  assert.equal(sicht.rechnungen.length, 2);
  assert.deepEqual(sicht.dokumente.map((d) => d.art).sort(), ["angebot", "protokoll"]);
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
  process.env.MAIL_FROM = "Stelax Consulting <hallo@stelax.example>";
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

test("Finanz-Agenten: Zahlungserinnerung und Betreuungsrechnung", async () => {
  const agenten = await import("../src/lib/ablauf/finanzagenten");
  // Weg ohne Stripe: eigene Rechnung, die offen bleibt
  process.env.ZAHLUNGSWEG = "ueberweisung";
  const { id } = await akquise.legeBetriebAn({ name: "Überweiser GmbH", gewerk: "Maler", score: 60, scoreGrund: "Test", website: "ueberweiser.example", email: "chef@ueberweiser.example" }, "Test", "Test");
  const [a] = await db.insert(schema.angebote).values({ betriebId: id!, paket: "S", einmalig: 349000, monatlich: 14900, status: "versendet" }).returning();
  await verkauf.unterschriftEingegangen(a.id, "Test");
  delete process.env.ZAHLUNGSWEG;
  const spaeter = new Date(Date.now() + 20 * 864e5);
  const r1 = await agenten.zahlungserinnerungen(spaeter);
  assert.match(r1, /[1-9]\d* Zahlungserinnerungen/);
  assert.match(await agenten.zahlungserinnerungen(spaeter), /^0 /, "keine doppelte Erinnerung");
  const r2 = await agenten.betreuungsrechnungen(new Date(Date.now() + 40 * 864e5));
  assert.match(r2, /^0 Betreuungsrechnungen/, "Stripe-Abo rechnet selbst ab");
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
  assert.match(b, /stelax-/);
  const r = await betrieb.ruecksicherung();
  assert.match(r, /Betriebe wiederhergestellt/);
});
