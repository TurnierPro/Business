import { test, before } from "node:test";
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

  // Unterschrift → Rechnung → Zahlung → Projekt
  const angebotId = Number(angebotMail.meta.angebotId);
  await verkauf.unterschriftEingegangen(angebotId, "Simulator");
  const rechnung = await offeneFreigabe("rechnung");
  await post.freigeben(rechnung.id, "Max Steiner");
  await abarbeiten();
  const projektId = await verkauf.zahlungEingegangen(angebotId, "Simulator");
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

  // Livegang freigeben → live, Schlussrechnung im Postausgang
  const live = await offeneFreigabe("livegang");
  await post.freigeben(live.id, "Max Steiner");
  await abarbeiten();
  const [fertig] = await db.select().from(schema.projekte).where(eq(schema.projekte.id, projektId));
  assert.equal(fertig.status, "live");
  await offeneFreigabe("schlussrechnung");

  const rechnungen = await db.select().from(schema.rechnungen);
  assert.deepEqual(rechnungen.map((r) => r.lfdNr), [1, 2]);
});

test("Mail ohne gültige Adresse lässt sich nicht freigeben", async () => {
  const { id } = await akquise.legeBetriebAn({ name: "Ohne Mail GmbH", gewerk: "SHK", score: 50, scoreGrund: "Test", website: "ohne-mail.example" }, "Test", "Test");
  const e = await post.inPostausgang({ betriebId: id, kanal: "mail", zweck: "test", empfaenger: "(E-Mail-Adresse fehlt)", betreff: "x", text: "x" });
  await assert.rejects(() => post.freigeben(e, "Max Steiner"), /E-Mail-Adresse/);
});

test("Rechnung über 10.000 € braucht zwei verschiedene Personen", async () => {
  const { id } = await akquise.legeBetriebAn({ name: "Groß GmbH", gewerk: "Elektro", score: 80, scoreGrund: "Test", website: "gross.example", email: "chef@gross.example" }, "Test", "Test");
  const [a] = await db.insert(schema.angebote).values({ betriebId: id!, paket: "L", einmalig: 2_000_000, monatlich: 59000, status: "versendet" }).returning();
  await verkauf.unterschriftEingegangen(a.id, "Test");
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
