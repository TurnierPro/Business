import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Sicherheits- und Datenschutz-Tests: jeder Fund aus dem Penetrationstest bekommt hier einen Test, damit er nie zurückkommt.
process.env.DATABASE_URL = "memory://";
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "stelax-sicher-"));

const { getDb, schema } = await import("../src/lib/db");
const s = await import("../src/lib/sicherheit");
const { eq } = await import("drizzle-orm");
let db: Awaited<ReturnType<typeof getDb>>;
before(async () => {
  db = await getDb();
});

test("SSRF: interne Adressen werden nie abgerufen", async () => {
  for (const ip of ["127.0.0.1", "10.0.0.5", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"]) assert.ok(s.istInterneAdresse(ip), ip);
  for (const ip of ["8.8.8.8", "217.160.0.10", "2a01:4f8::1"]) assert.ok(!s.istInterneAdresse(ip), ip);
  await assert.rejects(() => s.sicheresFetch("http://127.0.0.1:3000/api/gesundheit"), /Standard-Ports|Interne/);
  await assert.rejects(() => s.sicheresFetch("http://169.254.169.254/latest/meta-data"), /Interne Adresse/);
  await assert.rejects(() => s.sicheresFetch("http://localhost/"), /Interne Adresse/);
  await assert.rejects(() => s.sicheresFetch("file:///etc/passwd"), /Nur http/);
});

test("Weiterleitungen nur auf interne Pfade (kein Open Redirect)", () => {
  assert.equal(s.internerPfad("/leads/3"), "/leads/3");
  for (const boese of ["https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", "", " /leads"]) assert.equal(s.internerPfad(boese), "/", boese);
});

test("Uploads: echter Dateityp zählt, nicht der Name", async () => {
  const png = new File([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])], "foto.png");
  const pdf = new File([Buffer.from("%PDF-1.7 ...")], "beleg.pdf");
  const html = new File([Buffer.from("<script>alert(1)</script>")], "foto.png", { type: "image/png" });
  assert.equal((await s.pruefeDatei(png, ["bild"])).endung, "png");
  assert.equal((await s.pruefeDatei(pdf, ["bild", "pdf"])).endung, "pdf");
  await assert.rejects(() => s.pruefeDatei(html, ["bild"]), /Dateityp/);
  await assert.rejects(() => s.pruefeDatei(pdf, ["bild"]), /Dateityp/);
  await assert.rejects(() => s.pruefeDatei(new File([Buffer.alloc(2 * 1024 * 1024)], "x.png"), ["bild"], 1), /zu groß/);
});

test("Mengenbegrenzung: Sperre nach zu vielen Versuchen", async () => {
  const g = { max: 3, minuten: 15 };
  for (let i = 0; i < 3; i++) {
    assert.ok(await s.erlaubt("login", "konto:test@x", g));
    await s.versuchMerken("login", "konto:test@x");
  }
  assert.ok(!(await s.erlaubt("login", "konto:test@x", g)), "vierter Versuch gesperrt");
  assert.ok(await s.erlaubt("login", "konto:anders@x", g), "andere Konten nicht betroffen");
  await s.versucheLoeschen("login", "konto:test@x");
  assert.ok(await s.erlaubt("login", "konto:test@x", g), "nach Erfolg zurückgesetzt");
  assert.equal(s.clientIp(new Headers({ "x-forwarded-for": "203.0.113.77, 10.0.0.1" })), "203.0.113.0", "IP gekürzt gespeichert");
});

test("Formular der Kunden-Website: höchstens 10 Anfragen je Netz und Stunde", async () => {
  const [b] = await db.insert(schema.betriebe).values({ name: "Spam-Ziel GmbH" }).returning();
  const [seite] = await db.insert(schema.seiten).values({ slug: "spam-ziel", betriebId: b.id, art: "kunde" }).returning();
  const { anfrageAnnehmen } = await import("../src/lib/anfragen");
  const status: number[] = [];
  for (let i = 0; i < 12; i++) {
    const f = new FormData();
    f.set("name", "Spam"); f.set("telefon", "1"); f.set("nachricht", `Nachricht ${i}`);
    status.push((await anfrageAnnehmen(new Request("http://x", { method: "POST", body: f, headers: { "x-forwarded-for": "198.51.100.9" } }), seite, "/danke")).status);
  }
  assert.equal(status.filter((x) => x === 303).length, 10);
  assert.equal(status.at(-1), 429);
});

test("Zwei-Faktor: jeder Code nur einmal, Geheimnis verschlüsselt", async () => {
  const totp = await import("../src/lib/totp");
  const { verschluessele, entschluessele } = await import("../src/lib/geheim");
  const geheim = totp.neuesGeheimnis();
  const t = 1_800_000_000_000;
  const schritt = totp.pruefeMitSchritt(geheim, totp.code(geheim, t), t);
  assert.equal(schritt, Math.floor(t / 30000));
  assert.equal(totp.pruefeMitSchritt(geheim, "000000", t) === schritt, false);
  const v = verschluessele(geheim);
  assert.ok(!v.includes(geheim), "nicht im Klartext");
  assert.equal(entschluessele(v), geheim);
  assert.throws(() => entschluessele(v.slice(0, -2) + "AA"), "Manipulation fällt auf");
});

test("Passwort-Regeln", async () => {
  const { passwortProblem, pruefePasswort, hashPasswort, pruefeAnmeldung } = await import("../src/lib/auth");
  assert.ok(passwortProblem("kurz"));
  assert.ok(passwortProblem("stelax-start-2026"));
  assert.ok(passwortProblem("111111111111111"));
  assert.equal(passwortProblem("Grüner Hobel fährt nach Durlach"), null);
  const h = hashPasswort("Grüner Hobel fährt nach Durlach");
  assert.ok(pruefePasswort("Grüner Hobel fährt nach Durlach", h));
  assert.ok(!pruefePasswort("falsch", h));
  assert.ok(!pruefePasswort("x", "kaputt"), "kaputter Hash wirft nicht");
  assert.equal(pruefeAnmeldung("egal", undefined), false, "unbekanntes Konto: gleicher Ablauf, keine Anmeldung");
});

test("Backups außerhalb des Servers: verschlüsselt, mit falschem Schlüssel unlesbar", async () => {
  const { verschluesseleBackup, entschluesseleBackup } = await import("../src/lib/ablauf/betrieb");
  const daten = Buffer.from("geheime Kundendaten ".repeat(100));
  const v = verschluesseleBackup(daten, "eine sehr lange Passphrase für Backups 2026");
  assert.ok(!v.includes(Buffer.from("geheime Kundendaten")));
  assert.deepEqual(entschluesseleBackup(v, "eine sehr lange Passphrase für Backups 2026"), daten);
  assert.throws(() => entschluesseleBackup(v, "falsche Passphrase falsche Passphrase"));
});

test("Löschkonzept: Aufräum-Agent löscht nach Frist (Aufnahmen, Simulator-Post, Fehlversuche)", async () => {
  const alt = new Date(Date.now() - 400 * 864e5);
  const [b] = await db.insert(schema.betriebe).values({ name: "Fristen GmbH", status: "kunde" }).returning();
  const audio = path.join(process.env.DATA_DIR!, "alt.webm");
  fs.writeFileSync(audio, "x");
  const [t] = await db.insert(schema.termine).values({ betriebId: b.id, einwilligung: true, audioPfad: audio, erstelltAm: alt }).returning();
  await db.insert(schema.simulatorPost).values({ kanal: "mail", an: "a@b.example", betreff: "alt", text: "alt", am: alt });
  await db.insert(schema.versuche).values({ art: "login", schluessel: "alt", am: alt });
  const { aufraeumen } = await import("../src/lib/ablauf/betrieb");
  await aufraeumen();
  const [t2] = await db.select().from(schema.termine).where(eq(schema.termine.id, t.id));
  assert.equal(t2.audioPfad, null);
  assert.ok(!fs.existsSync(audio));
  assert.equal((await db.select().from(schema.simulatorPost)).length, 0);
  assert.equal((await db.select().from(schema.versuche).where(eq(schema.versuche.schluessel, "alt"))).length, 0);
});

test("Datenpanne: 72-Stunden-Frist, Betroffenenanfrage: ein Monat", async () => {
  const ds = await import("../src/lib/ablauf/datenschutz");
  const id = await ds.panneErfassen({ entdecktAm: new Date(Date.now() - 70 * 3600_000), beschreibung: "Mail mit Angebot an falschen Empfänger" }, "Max Steiner");
  const [p] = await db.select().from(schema.datenpannen).where(eq(schema.datenpannen.id, id));
  assert.ok(ds.restStunden(p.entdecktAm) <= 2 && ds.restStunden(p.entdecktAm) >= 1);
  await ds.panneAktualisieren(id, { risiko: "risiko", gemeldet: true }, "Max Steiner");
  const [p2] = await db.select().from(schema.datenpannen).where(eq(schema.datenpannen.id, id));
  assert.ok(p2.gemeldetAm);
  assert.equal(ds.anfrageFrist(new Date(2026, 0, 31)).getMonth(), 2, "31.01. + 1 Monat: Anfang März (kein 31.02.)");
  await assert.rejects(() => ds.betroffenenanfrageErfassen({ eingangAm: new Date(), art: "quatsch", person: "X" }, "Test"), /Art/);
});

test("Sicherheits-Header und CSP in der Middleware", async () => {
  process.env.BASE_URL = "https://os.stelax.example";
  const { NextRequest } = await import("next/server");
  const { middleware } = await import("../src/middleware");
  const app = middleware(new NextRequest("https://os.stelax.example/login", { headers: { host: "os.stelax.example" } }));
  const csp = app.headers.get("content-security-policy") ?? "";
  assert.match(csp, /script-src 'self' 'nonce-[A-Za-z0-9+/=]+'/);
  assert.match(csp, /frame-ancestors 'self'/);
  assert.match(csp, /object-src 'none'/);
  assert.equal(app.headers.get("x-content-type-options"), "nosniff");
  assert.equal(app.headers.get("x-frame-options"), "SAMEORIGIN");
  const portal = middleware(new NextRequest("https://os.stelax.example/portal/k/abc", { headers: { host: "os.stelax.example" } }));
  assert.equal(portal.headers.get("referrer-policy"), "no-referrer", "Portal-Link geht nie als Referrer raus");
  const kunde = middleware(new NextRequest("https://mueller.example/", { headers: { host: "mueller.example" } }));
  assert.match(kunde.headers.get("content-security-policy") ?? "", /default-src 'none'/, "Kunden-Websites ohne JavaScript");
  const ohne = middleware(new NextRequest("https://os.stelax.example/leads", { headers: { host: "os.stelax.example" } }));
  assert.match(ohne.headers.get("location") ?? "", /\/login$/);
});
