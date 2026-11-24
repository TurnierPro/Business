import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Sicherheits- und Datenschutz-Tests: jeder Fund aus dem Penetrationstest bekommt hier einen Test, damit er nie zurückkommt.
process.env.DATABASE_URL = "memory://";
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "levarex-sicher-"));

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
  assert.ok(passwortProblem("levarex-start-2026"));
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
  const id = await ds.panneErfassen({ entdecktAm: new Date(Date.now() - 70 * 3600_000), beschreibung: "Mail mit Angebot an falschen Empfänger" }, "Maximilian Steiner");
  const [p] = await db.select().from(schema.datenpannen).where(eq(schema.datenpannen.id, id));
  assert.ok(ds.restStunden(p.entdecktAm) <= 2 && ds.restStunden(p.entdecktAm) >= 1);
  await ds.panneAktualisieren(id, { risiko: "risiko", gemeldet: true }, "Maximilian Steiner");
  const [p2] = await db.select().from(schema.datenpannen).where(eq(schema.datenpannen.id, id));
  assert.ok(p2.gemeldetAm);
  assert.equal(ds.anfrageFrist(new Date(2026, 0, 31)).getMonth(), 2, "31.01. + 1 Monat: Anfang März (kein 31.02.)");
  await assert.rejects(() => ds.betroffenenanfrageErfassen({ eingangAm: new Date(), art: "quatsch", person: "X" }, "Test"), /Art/);
});

test("Sicherheits-Header und CSP in der Middleware", async () => {
  process.env.BASE_URL = "https://os.levarex.example";
  const { NextRequest } = await import("next/server");
  const { middleware } = await import("../src/middleware");
  const app = middleware(new NextRequest("https://os.levarex.example/login", { headers: { host: "os.levarex.example" } }));
  const csp = app.headers.get("content-security-policy") ?? "";
  assert.match(csp, /script-src 'self' 'nonce-[A-Za-z0-9+/=]+'/);
  assert.match(csp, /frame-ancestors 'self'/);
  assert.match(csp, /object-src 'none'/);
  assert.equal(app.headers.get("x-content-type-options"), "nosniff");
  assert.equal(app.headers.get("x-frame-options"), "SAMEORIGIN");
  const portal = middleware(new NextRequest("https://os.levarex.example/portal/k/abc", { headers: { host: "os.levarex.example" } }));
  assert.equal(portal.headers.get("referrer-policy"), "no-referrer", "Portal-Link geht nie als Referrer raus");
  const kunde = middleware(new NextRequest("https://mueller.example/", { headers: { host: "mueller.example" } }));
  assert.match(kunde.headers.get("content-security-policy") ?? "", /default-src 'none'/, "Kunden-Websites ohne JavaScript");
  const ohne = middleware(new NextRequest("https://os.levarex.example/leads", { headers: { host: "os.levarex.example" } }));
  assert.match(ohne.headers.get("location") ?? "", /\/login$/);
});

test("WhatsApp-Webhook: nur mit gültiger Signatur von Meta, Prüftoken nötig", async () => {
  const crypto = await import("node:crypto");
  process.env.WHATSAPP_APP_SECRET = "app-geheimnis";
  process.env.WHATSAPP_VERIFY_TOKEN = "pruef-123";
  const route = await import("../src/app/api/whatsapp/route");
  const nachricht = JSON.stringify({ entry: [{ changes: [{ value: { contacts: [{ wa_id: "4915112345678", profile: { name: "Fremd" } }], messages: [{ id: "wamid.sig", from: "4915112345678", timestamp: "1760000000", type: "text", text: { body: "Hallo" } }] } }] }] });
  const anfrage = (sig: string | null) => new Request("https://os.levarex.example/api/whatsapp", { method: "POST", body: nachricht, headers: sig ? { "x-hub-signature-256": sig } : {} });
  assert.equal((await route.POST(anfrage(null))).status, 401);
  assert.equal((await route.POST(anfrage("sha256=" + "0".repeat(64)))).status, 401, "gefälschte Signatur");
  const falsch = crypto.createHmac("sha256", "anderes-geheimnis").update(nachricht).digest("hex");
  assert.equal((await route.POST(anfrage(`sha256=${falsch}`))).status, 401);
  assert.equal((await db.select().from(schema.nachrichten)).length, 0, "nichts gespeichert");
  const echt = crypto.createHmac("sha256", "app-geheimnis").update(nachricht).digest("hex");
  assert.equal((await route.POST(anfrage(`sha256=${echt}`))).status, 200);
  const [n] = await db.select().from(schema.nachrichten);
  assert.equal(n.absender, "+4915112345678");
  assert.equal(n.status, "unbekannt");
  // Einrichtung durch Meta: falsches Prüftoken → 403
  assert.equal((await route.GET(new Request("https://x/api/whatsapp?hub.mode=subscribe&hub.verify_token=falsch&hub.challenge=abc"))).status, 403);
  const ok = await route.GET(new Request("https://x/api/whatsapp?hub.mode=subscribe&hub.verify_token=pruef-123&hub.challenge=abc"));
  assert.equal(await ok.text(), "abc");
  delete process.env.WHATSAPP_APP_SECRET;
  assert.equal((await route.POST(anfrage(`sha256=${echt}`))).status, 401, "ohne Geheimnis nie offen");
});

test("Nachrichten-API: nur mit Schlüssel und Recht „nachrichten“", async () => {
  const api = await import("../src/lib/api");
  const route = await import("../src/app/api/v1/nachrichten/route");
  const ohneRecht = await api.schluesselErzeugen("Nur lesen", ["lesen"], "Test");
  const mitRecht = await api.schluesselErzeugen("n8n Postfach", ["nachrichten"], "Test");
  const anfrage = (s?: string) => new Request("https://x/api/v1/nachrichten", { method: "POST", headers: { "Content-Type": "application/json", ...(s ? { Authorization: `Bearer ${s}` } : {}) }, body: JSON.stringify({ kanal: "telefon", absender: "+49 30 1234567", inhalt: "Verpasster Anruf", externeId: "call-api-1" }) });
  assert.equal((await route.POST(anfrage())).status, 401);
  assert.equal((await route.POST(anfrage(ohneRecht))).status, 403);
  assert.equal((await route.POST(anfrage(mitRecht))).status, 201);
  assert.equal((await route.POST(anfrage(mitRecht))).status, 200, "zweimal eingeliefert → nicht doppelt");
});

test("Unterschrift auf dem Tablet: nur echte PNG-Bilder, kein eingeschleustes HTML oder SVG", async () => {
  const fs = await import("node:fs");
  const { unterschriftsbildOk } = await import("../src/lib/ablauf/vertraege");
  const echt = `data:image/png;base64,${fs.readFileSync(new URL("./unterschrift-muster.b64", import.meta.url), "utf8").trim()}`;
  assert.equal(unterschriftsbildOk(echt), true);
  assert.equal(unterschriftsbildOk("data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+"), false, "SVG kann Skript enthalten");
  assert.equal(unterschriftsbildOk('data:image/png;base64,AAAA" onerror="alert(1)'), false, "Ausbruch aus dem src-Attribut");
  assert.equal(unterschriftsbildOk(`data:image/png;base64,${Buffer.from("<html>".repeat(100)).toString("base64")}`), false, "kein echtes PNG");
  assert.equal(unterschriftsbildOk(`data:image/png;base64,${"A".repeat(500_000)}`), false, "zu groß");
  assert.equal(unterschriftsbildOk(""), false);
});

test("Kundenportal: Betrieb A sieht nie Unterlagen von Betrieb B (Trennung ohne Row-Level Security)", async () => {
  const kp = await import("../src/lib/kundenportal");
  const route = await import("../src/app/portal/k/[token]/dokument/[id]/route");
  const neuerBetrieb = async (name: string) => {
    const [b] = await db.insert(schema.betriebe).values({ name, gewerk: "SHK", email: `${name.toLowerCase()}@trennung.example` }).returning();
    await kp.portalLink(b.id);
    const [mitToken] = await db.select().from(schema.betriebe).where(eq(schema.betriebe.id, b.id));
    const [dok] = await db.insert(schema.dokumente).values({ betriebId: b.id, art: "angebot", titel: `Angebot ${name}`, daten: { nummer: "A-1" } }).returning();
    // Verschickt (nur Verschicktes ist im Portal sichtbar)
    await db.insert(schema.postausgang).values({ betriebId: b.id, kanal: "mail", zweck: "angebot", empfaenger: "x@y.de", betreff: "x", text: "x", anhaenge: [dok.id], status: "versendet", versendetAm: new Date() });
    return { id: b.id, token: mitToken.portalToken!, dok: dok.id };
  };
  const a = await neuerBetrieb("Alpha");
  const b = await neuerBetrieb("Beta");
  assert.equal(await kp.darfDokumentSehen(a.id, a.dok), true);
  assert.equal(await kp.darfDokumentSehen(a.id, b.dok), false, "fremdes Dokument");
  assert.equal(await kp.darfDokumentSehen(b.id, a.dok), false);
  const abruf = (token: string, id: number) => route.GET(new Request("https://x"), { params: Promise.resolve({ token, id: String(id) }) });
  assert.equal((await abruf(a.token, b.dok)).status, 404, "Link von A, Dokument von B");
  assert.equal((await abruf("x".repeat(32), a.dok)).status, 404, "erfundener Link");
  const sichtA = await kp.portalDaten(a.id);
  assert.ok(sichtA.dokumente.every((d) => d.betriebId === a.id));
  // Persönlicher Zugang: funktioniert, nach dem Sperren nicht mehr, und nur für den eigenen Betrieb
  const zid = await kp.zugangAnlegen({ betriebId: a.id, name: "Petra Büro", email: "petra@alpha.example" }, "Test");
  const [z] = await db.select().from(schema.portalZugaenge).where(eq(schema.portalZugaenge.id, zid));
  assert.equal((await kp.zugangPerPortal(z.token))?.betrieb.id, a.id);
  assert.equal((await kp.zugangPerPortal(z.token))?.person, "Petra Büro");
  assert.equal((await abruf(z.token, b.dok)).status, 404);
  await kp.zugangSperren(zid, "Test");
  assert.equal(await kp.zugangPerPortal(z.token), null, "gesperrt");
});

test("Getrennte Adressen: unter der Portal-Adresse nur das Portal, unter der OS-Adresse kein Portal", async () => {
  process.env.BASE_URL = "https://os.levarex.example";
  process.env.PORTAL_URL = "https://portal.levarex.example";
  try {
    const { NextRequest } = await import("next/server");
    const { middleware } = await import("../src/middleware");
    const anfrage = (url: string, cookie?: string) => middleware(new NextRequest(url, { headers: { host: new URL(url).host, ...(cookie ? { cookie } : {}) } }));
    assert.equal(anfrage("https://portal.levarex.example/leads", "lvx_os=abc").status, 404, "kein OS unter der Portal-Adresse, auch nicht mit OS-Cookie");
    assert.equal(anfrage("https://portal.levarex.example/api/v1/betriebe").status, 404);
    assert.match(anfrage("https://portal.levarex.example/").headers.get("location") ?? "", /\/portal$/);
    assert.notEqual(anfrage("https://portal.levarex.example/portal/k/abcdefghijklmnopqrstuvwxyz").status, 404);
    assert.equal(anfrage("https://os.levarex.example/portal/k/abc").headers.get("location"), "https://portal.levarex.example/portal/k/abc", "Portal nur unter eigener Adresse");
    assert.match(anfrage("https://os.levarex.example/leads").headers.get("location") ?? "", /\/login$/, "OS braucht Anmeldung");
    const portalCsp = anfrage("https://portal.levarex.example/portal/k/abcdefghijklmnopqrstuvwxyz").headers.get("content-security-policy") ?? "";
    assert.match(portalCsp, /frame-ancestors 'self' https:\/\/os\.levarex\.example(;|$)/, "Portal nur in Levarex OS einbettbar");
    assert.doesNotMatch(portalCsp, /frame-ancestors[^;]*\*/, "kein Platzhalter");
    const osCsp = anfrage("https://os.levarex.example/login").headers.get("content-security-policy") ?? "";
    assert.match(osCsp, /frame-ancestors 'self'(;|$)/, "OS selbst bleibt nur für sich einbettbar");
  } finally {
    delete process.env.PORTAL_URL;
  }
});

test("Schnittstelle für n8n: Rechte, Mengenbegrenzung, Protokoll, kein Versand ohne Freigabe", async () => {
  const api = await import("../src/lib/api");
  const lesen = await api.schluesselErzeugen("n8n lesen", ["lesen"], "Test");
  const entwurf = await api.schluesselErzeugen("n8n entwürfe", ["entwuerfe"], "Test");
  const entwuerfe = await import("../src/app/api/v1/entwuerfe/route");
  const anfrage = (s: string, body: unknown) => new Request("https://x/api/v1/entwuerfe", { method: "POST", headers: { Authorization: `Bearer ${s}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const mail = { empfaenger: "kunde@example.com", betreff: "Rückfrage", text: "Guten Tag, wir melden uns morgen mit dem Termin." };
  assert.equal((await entwuerfe.POST(anfrage(lesen, mail))).status, 403, "Recht fehlt");
  const r = await entwuerfe.POST(anfrage(entwurf, mail));
  assert.equal(r.status, 201);
  const { id } = (await r.json()) as { id: number };
  const [e] = await db.select().from(schema.postausgang).where(eq(schema.postausgang.id, id));
  assert.equal(e.status, "zur_freigabe", "Entwurf, nicht versendet");
  assert.ok(!Object.keys(api.RECHTE).some((k) => /send|versand/i.test(k)), "kein Recht zum Versenden");
  // Jeder Zugriff wird protokolliert
  const prot = await db.select().from(schema.apiProtokoll);
  assert.ok(prot.some((x) => x.ergebnis === "403") && prot.some((x) => x.ergebnis === "erlaubt" && x.pfad === "/api/v1/entwuerfe"));
  // Mengenbegrenzung je Schlüssel
  const betriebe = await import("../src/app/api/v1/betriebe/route");
  let letzte = 0;
  for (let i = 0; i <= api.API_GRENZE_JE_MINUTE; i++) letzte = (await betriebe.GET(new Request("https://x/api/v1/betriebe", { headers: { Authorization: `Bearer ${lesen}` } }))).status;
  assert.equal(letzte, 429);
  // OpenAPI-Beschreibung für n8n
  const oa = await import("../src/app/api/v1/openapi.json/route");
  const spec = (await oa.GET().json()) as { paths: Record<string, unknown> };
  assert.ok(spec.paths["/entwuerfe"] && spec.paths["/nachrichten"] && spec.paths["/dokumente/{id}"]);
});

test("Webhooks: nur https, signiert, nur IDs, keine internen Adressen (SSRF)", async () => {
  const crypto = await import("node:crypto");
  const wh = await import("../src/lib/webhooks");
  await assert.rejects(() => wh.webhookAnlegen({ name: "x", url: "http://n8n.example/hook", ereignisse: ["betrieb.neu"] }, "Test"), /https/);
  await assert.rejects(() => wh.webhookAnlegen({ name: "x", url: "https://n8n.example/hook", ereignisse: ["gibt.es.nicht"] }, "Test"), /Ereignis/);
  const { id, geheimnis } = await wh.webhookAnlegen({ name: "n8n intern", url: "https://127.0.0.1/hook", ereignisse: ["betrieb.neu"] }, "Test");
  const [w] = await db.select().from(schema.webhooks).where(eq(schema.webhooks.id, id));
  assert.notEqual(w.geheimnis, geheimnis, "Geheimnis verschlüsselt gespeichert");
  await wh.ereignis("betrieb.neu", { betriebId: 42, quelle: "Test" });
  const jobs = (await db.select().from(schema.jobs).where(eq(schema.jobs.art, "webhook"))).filter((j) => Number((j.daten as { webhookId: number }).webhookId) === id);
  assert.equal(jobs.length, 1);
  assert.deepEqual((jobs[0].daten as { daten: unknown }).daten, { betriebId: 42, quelle: "Test" }, "nur IDs");
  await assert.rejects(() => wh.webhookZustellen(jobs[0].daten as never), /intern|erlaubt|nicht/i, "interne Adresse wird nie aufgerufen");
  // Signatur wie in der Doku: sha256=HMAC(geheimnis, zeit.body)
  const soll = `sha256=${crypto.createHmac("sha256", "g").update("123.{}").digest("hex")}`;
  assert.equal(wh.signatur("g", "123", "{}"), soll);
});

test("Heikle Schritte (Livegang, Rollen, Schlüssel): nur Technik-Leitung mit frischem Code, kein Wiederverwenden", async () => {
  const totp = await import("../src/lib/totp");
  const { verschluessele } = await import("../src/lib/geheim");
  const { technikMitCode } = await import("../src/lib/zweiter-faktor");
  const { TECHNIK, VERTRIEB } = await import("../src/lib/ablauf/crm");
  const geheim = totp.neuesGeheimnis();
  await db.delete(schema.benutzer).where(eq(schema.benutzer.name, TECHNIK));
  await db.insert(schema.benutzer).values({ email: "technik@levarex.test", name: TECHNIK, rolle: "admin", passwortHash: "x", totpAktiv: false, totpGeheim: verschluessele(geheim) });
  await assert.rejects(() => technikMitCode(TECHNIK, totp.code(geheim), "Test"), /Authenticator-App/, "ohne eingerichtete App nicht");
  await db.update(schema.benutzer).set({ totpAktiv: true }).where(eq(schema.benutzer.name, TECHNIK));
  await assert.rejects(() => technikMitCode(VERTRIEB, totp.code(geheim), "Test"), /nur/, "andere Person nicht, auch mit Code");
  await assert.rejects(() => technikMitCode(TECHNIK, "000000", "Test"), /Code falsch/);
  const code = totp.code(geheim);
  await technikMitCode(TECHNIK, code, "Test");
  await assert.rejects(() => technikMitCode(TECHNIK, code, "Test"), /schon benutzt/, "derselbe Code kein zweites Mal");
  // Livegang im Postausgang: nur die Technik-Leitung
  const post = await import("../src/lib/ablauf/postausgang");
  const id = await post.inPostausgang({ kanal: "livegang", zweck: "livegang", empfaenger: "beispiel.example", betreff: "Livegang Test", text: "Test" });
  await db.update(schema.postausgang).set({ qkStatus: "ok" }).where(eq(schema.postausgang.id, id));
  await assert.rejects(() => post.freigeben(id, VERTRIEB), /Livegang gibt nur/);
});

test("Sicherung bei IONOS: Signatur nach AWS-Beispiel, nur verschlüsselt, Dateinamen geprüft", async () => {
  const o = await import("../src/lib/adapters/objektspeicher");
  // Offizielles Beispiel „GET Object“ aus der AWS-Doku zu Signature Version 4
  const auth = o.signiereV4({
    methode: "GET",
    pfad: "/test.txt",
    kopf: { host: "examplebucket.s3.amazonaws.com", range: "bytes=0-9", "x-amz-content-sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", "x-amz-date": "20130524T000000Z" },
    payloadHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    region: "us-east-1",
    zugriff: "AKIAIOSFODNN7EXAMPLE",
    geheim: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
  });
  assert.match(auth, /Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41$/);
  await assert.rejects(() => o.hochladen("../../etc/passwd", Buffer.from("x")), /Ungültiger Dateiname/);
  // Backup-Lauf im Simulator: nur .enc-Dateien, Datenbank und Dateien, ohne Klartext
  process.env.BACKUP_SCHLUESSEL = "eine sehr lange Passphrase für Backups 2026 Test";
  try {
    const { backup, entschluesseleBackup } = await import("../src/lib/ablauf/betrieb");
    await backup();
    const liste = await o.auflisten();
    assert.ok(liste.some((x) => /^levarex-dateien-.*\.tar\.gz\.enc$/.test(x.name)), "Dateien gesichert");
    assert.ok(liste.every((x) => x.name.endsWith(".enc")), "nur verschlüsselt");
    const db = liste.find((x) => !x.name.startsWith("levarex-dateien-"))!;
    const roh = await o.herunterladen(db.name);
    assert.equal(roh.subarray(0, 4).toString(), "LVX1");
    assert.ok(entschluesseleBackup(roh, process.env.BACKUP_SCHLUESSEL).length > 100);
  } finally {
    delete process.env.BACKUP_SCHLUESSEL;
  }
});

test("Start-Passwort: Übungs-Passwort nur auf dem eigenen Rechner, nie auf einem Server", async () => {
  const { startPasswortUnsicher, lokalerStart } = await import("../src/lib/auth");
  const env = process.env as Record<string, string | undefined>;
  const vorher = { NODE_ENV: env.NODE_ENV, BASE_URL: env.BASE_URL, PW: env.LEVAREX_START_PASSWORT };
  try {
    env.NODE_ENV = "production";
    delete env.LEVAREX_START_PASSWORT;
    delete env.BASE_URL;
    assert.equal(lokalerStart(), true);
    assert.equal(startPasswortUnsicher(), false, "Mac ohne Adresse: Übungs-Passwort erlaubt");
    env.BASE_URL = "http://localhost:3000";
    assert.equal(startPasswortUnsicher(), false);
    for (const server of ["https://os.levarex-consulting.de", "http://203.0.113.5:3000", "http://localhost.boese.example"]) {
      env.BASE_URL = server;
      assert.equal(startPasswortUnsicher(), true, `${server}: eigenes Start-Passwort nötig`);
    }
  } finally {
    env.NODE_ENV = vorher.NODE_ENV;
    if (vorher.BASE_URL === undefined) delete env.BASE_URL; else env.BASE_URL = vorher.BASE_URL;
    if (vorher.PW !== undefined) env.LEVAREX_START_PASSWORT = vorher.PW;
  }
});

test("Zwei-Faktor ist Pflicht auf dem Server, auf dem eigenen Rechner nur ein Hinweis", async () => {
  const { zweiFaktorPflichtFehlt } = await import("../src/lib/auth");
  const env = process.env as Record<string, string | undefined>;
  const vorher = env.BASE_URL;
  try {
    env.BASE_URL = "https://os.levarex-consulting.de";
    assert.equal(zweiFaktorPflichtFehlt({ totpAktiv: false }), true, "Server ohne App: gesperrt bis zur Einrichtung");
    assert.equal(zweiFaktorPflichtFehlt({ totpAktiv: true }), false);
    env.BASE_URL = "http://localhost:3000";
    assert.equal(zweiFaktorPflichtFehlt({ totpAktiv: false }), false, "lokal: nur Hinweis");
  } finally {
    if (vorher === undefined) delete env.BASE_URL; else env.BASE_URL = vorher;
  }
});

test("Demo-Pakete: ZIP nur mit Website-Dateien, keine Pfade nach außen, im Portal nur nach Freigabe und abgeschottet", async () => {
  const demos = await import("../src/lib/demos");
  const { zipSchreiben } = await import("../src/lib/zip");
  const kp = await import("../src/lib/kundenportal");
  const route = await import("../src/app/portal/k/[token]/demo/[id]/[[...pfad]]/route");
  const [b] = await db.insert(schema.betriebe).values({ name: "Demo Sicher GmbH", gewerk: "SHK", email: "chef@demo-sicher.example" }).returning();
  const [anderer] = await db.insert(schema.betriebe).values({ name: "Fremd GmbH", gewerk: "SHK", email: "chef@fremd.example" }).returning();
  const datei = (dateien: { name: string; inhalt: string }[]) => new File([new Uint8Array(zipSchreiben(dateien.map((d) => ({ name: d.name, daten: Buffer.from(d.inhalt) }))))], "demo.zip", { type: "application/zip" });
  const laden = (f: File) => demos.demoHochladen({ betriebId: b.id, titel: "Test", datei: f, wer: "Test" });
  // Zip-Slip: Pfade nach oben oder absolut werden abgelehnt
  await assert.rejects(() => laden(datei([{ name: "index.html", inhalt: "<p>x</p>" }, { name: "../../boese.html", inhalt: "x" }])), /Unzulässiger Pfad/);
  await assert.rejects(() => laden(datei([{ name: "index.html", inhalt: "<p>x</p>" }, { name: "/etc/passwd.txt", inhalt: "x" }])), /Unzulässiger Pfad/);
  // Nur Website-Dateien: kein Programm, kein Serverskript
  await assert.rejects(() => laden(datei([{ name: "index.html", inhalt: "<p>x</p>" }, { name: "start.sh", inhalt: "rm -rf /" }])), /Dateityp nicht erlaubt/);
  await assert.rejects(() => laden(datei([{ name: "seite.html", inhalt: "<p>x</p>" }])), /index.html/);
  // Kein ZIP (z. B. umbenanntes HTML) wird schon vom Dateityp abgewiesen
  await assert.rejects(() => demos.demoHochladen({ betriebId: b.id, titel: "x", datei: new File(["<html>"], "demo.zip"), wer: "Test" }), /Dateityp nicht erlaubt/);
  // Gültig, mit gemeinsamem Oberordner und Mac-Beifang
  const id = await laden(datei([{ name: "bauer/index.html", inhalt: "<h1>Demo</h1>" }, { name: "bauer/assets/app.css", inhalt: "h1{}" }, { name: "__MACOSX/bauer/._index.html", inhalt: "x" }]));
  assert.ok(demos.demoDatei(id, ["index.html"]));
  assert.ok(demos.demoDatei(id, ["assets", "app.css"]));
  assert.equal(demos.demoDatei(id, ["..", "..", "pfade.ts"]), null, "kein Ausbruch beim Abruf");
  assert.equal(demos.demoDatei(id, ["%2e%2e", "x.html"]), null, "auch nicht kodiert");
  // Im Portal: erst nach Freigabe und Versand sichtbar, nur für den eigenen Betrieb
  const token = (await kp.portalLink(b.id)).split("/").pop()!;
  const tokenFremd = (await kp.portalLink(anderer.id)).split("/").pop()!;
  const abruf = (t: string, pfad: string[]) => route.GET(new Request("https://x"), { params: Promise.resolve({ token: t, id: String(id), pfad }) });
  assert.equal((await abruf(token, ["index.html"])).status, 404, "Entwurf ist nicht im Portal");
  const eintragId = await demos.demoFreigabeAnfordern(id, "Test");
  assert.equal((await abruf(token, ["index.html"])).status, 404, "wartet auf Freigabe: noch nicht sichtbar");
  const [e] = await db.select().from(schema.postausgang).where(eq(schema.postausgang.id, eintragId));
  assert.equal(e.zweck, "demo_portal");
  assert.equal(e.status, "zur_freigabe", "geht nur über den Postausgang raus");
  await (await import("../src/lib/ablauf/folgen")).nachVersand({ ...e, status: "versendet" });
  const ok = await abruf(token, ["index.html"]);
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get("content-security-policy") ?? "", /^sandbox allow-scripts/, "abgeschottet: eigene Herkunft, keine Cookies");
  assert.match(ok.headers.get("content-security-policy") ?? "", /connect-src 'none'/);
  assert.equal(ok.headers.get("x-robots-tag"), "noindex, nofollow");
  assert.equal((await abruf(tokenFremd, ["index.html"])).status, 404, "fremder Portal-Link sieht die Demo nicht");
  await demos.demoZurueckziehen(id, "Test");
  assert.equal((await abruf(token, ["index.html"])).status, 404, "zurückgezogen: nicht mehr sichtbar");
  // Middleware setzt dieselbe abgeschottete Regel
  const { NextRequest } = await import("next/server");
  const { middleware } = await import("../src/middleware");
  const m = middleware(new NextRequest(`https://os.levarex.example/portal/k/${token}/demo/${id}/index.html`, { headers: { host: "os.levarex.example" } }));
  assert.match(m.headers.get("content-security-policy") ?? "", /^sandbox /);
  // Interne Ansicht nur mit signiertem Schlüssel aus der Kundenakte
  const intern = await import("../src/app/demo-ansicht/[schluessel]/[[...pfad]]/route");
  const { linkSchluessel } = await import("../src/lib/geheim");
  const ansicht = (sch: string) => intern.GET(new Request("https://x"), { params: Promise.resolve({ schluessel: sch, pfad: ["index.html"] }) });
  assert.equal((await ansicht(linkSchluessel("demo-intern", id))).status, 200);
  assert.equal((await ansicht(`${id}-0000000000000000`)).status, 404, "erratener Schlüssel");
  assert.equal((await ansicht(linkSchluessel("angebot", id))).status, 404, "Schlüssel für etwas anderes gilt nicht");
  await demos.demoLoeschen(id, "Test");
  assert.equal(demos.demoDatei(id, ["index.html"]), null, "Dateien gelöscht");
});

test("Portal: Beitragsfotos nur für den eigenen Betrieb und erst nach der Vorlage; Schnittstelle legt nur Entwürfe an", async () => {
  const bt = await import("../src/lib/beitraege");
  const kp = await import("../src/lib/kundenportal");
  const route = await import("../src/app/portal/k/[token]/beitrag/[id]/route");
  const [b] = await db.insert(schema.betriebe).values({ name: "Foto Sicher GmbH", gewerk: "SHK", email: "chef@foto-sicher.example" }).returning();
  const [fremd] = await db.insert(schema.betriebe).values({ name: "Foto Fremd GmbH", gewerk: "SHK", email: "chef@foto-fremd.example" }).returning();
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  // Kein Bild, das keins ist (z. B. HTML mit .png-Endung)
  await assert.rejects(() => bt.beitragAnlegen({ betriebId: b.id, art: "beitrag", kanaele: ["instagram"], text: "x", bild: new File(["<script>alert(1)</script>"], "x.png", { type: "image/png" }) }, "Test"), /Dateityp/);
  assert.equal((await bt.beitraegeVon(b.id)).length, 0, "abgelehnter Upload hinterlässt keinen Entwurf");
  const id = await bt.beitragAnlegen({ betriebId: b.id, art: "beitrag", kanaele: ["instagram"], text: "Mit Foto", bild: new File([new Uint8Array(png)], "foto.png", { type: "image/png" }) }, "Test");
  const token = (await kp.portalLink(b.id)).split("/").pop()!;
  const tokenFremd = (await kp.portalLink(fremd.id)).split("/").pop()!;
  const holen = (t: string) => route.GET(new Request("http://localhost/"), { params: Promise.resolve({ token: t, id: String(id) }) });
  assert.equal((await holen(token)).status, 404, "Entwurf: noch nicht sichtbar");
  await db.update(schema.beitraege).set({ status: "beim_kunden" }).where(eq(schema.beitraege.id, id));
  const ok = await holen(token);
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("Content-Type"), "image/png");
  assert.equal(ok.headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal((await holen(tokenFremd)).status, 404, "fremder Betrieb");
  // Schnittstelle: ohne Recht abgelehnt
  const api = await import("../src/lib/api");
  const schluessel = await api.schluesselErzeugen("Test ohne Beiträge", ["lesen"], "Test");
  const r = await (await import("../src/app/api/v1/beitraege/route")).POST(new Request("http://localhost/api/v1/beitraege", { method: "POST", headers: { Authorization: `Bearer ${schluessel}`, "Content-Type": "application/json" }, body: JSON.stringify({ betriebId: b.id, kanaele: ["instagram"], text: "x" }) }));
  assert.equal(r.status, 403);
});

test("Dateien im Kundenportal: nur echte Fotos/PDFs, nur der eigene Betrieb, Dateien von Levarex erst nach Freigabe", async () => {
  const dt = await import("../src/lib/dateien");
  const kp = await import("../src/lib/kundenportal");
  const route = await import("../src/app/portal/k/[token]/datei/[id]/route");
  const [b] = await db.insert(schema.betriebe).values({ name: "Datei Sicher GmbH", gewerk: "SHK", email: "chef@datei-sicher.example" }).returning();
  const [fremd] = await db.insert(schema.betriebe).values({ name: "Datei Fremd GmbH", gewerk: "SHK", email: "chef@datei-fremd.example" }).returning();
  const png = new Uint8Array(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"));
  // HTML als .pdf getarnt: abgelehnt, nichts gespeichert
  await assert.rejects(() => dt.dateiVomKunden(b.id, [new File(["<script>alert(1)</script>"], "rechnung.pdf", { type: "application/pdf" })], "", "Test"), /gehen nicht/);
  assert.equal((await dt.dateienVon(b.id)).length, 0);
  // Gefährlicher Dateiname wird bereinigt
  const [vom] = await dt.dateiVomKunden(b.id, [new File([png], "../../etc/<x>.png", { type: "image/png" })], "Logo", "Test");
  const gespeichert = (await dt.dateienVon(b.id)).find((d) => d.id === vom)!;
  assert.ok(!gespeichert.name.includes("/") && !gespeichert.name.includes("<"), gespeichert.name);
  assert.match(gespeichert.pfad, /^datei-\d+\.png$/);
  const an = await dt.dateiAnKunden(b.id, new File([png], "entwurf.png", { type: "image/png" }), "Ihr Entwurf", "Test");
  const token = (await kp.portalLink(b.id)).split("/").pop()!;
  const tokenFremd = (await kp.portalLink(fremd.id)).split("/").pop()!;
  const holen = (t: string, id: number) => route.GET(new Request("http://localhost/"), { params: Promise.resolve({ token: t, id: String(id) }) });
  assert.equal((await holen(token, vom)).status, 200, "eigene Datei");
  assert.equal((await holen(tokenFremd, vom)).status, 404, "fremder Betrieb");
  assert.equal((await holen(token, an)).status, 404, "Datei von Levarex vor der Freigabe");
  const r = await holen(token, vom);
  assert.equal(r.headers.get("X-Content-Type-Options"), "nosniff");
  assert.match(r.headers.get("Content-Security-Policy") ?? "", /sandbox/);
  // Freigabe: Hinweis-Mail in den Postausgang, nach Versand sichtbar
  const eintrag = await dt.dateiFreigeben(an, "Test");
  const [m] = await db.select().from(schema.postausgang).where(eq(schema.postausgang.id, eintrag));
  assert.equal(m.zweck, "datei_portal");
  await dt.dateiImPortal(an);
  assert.equal((await holen(token, an)).status, 200);
  // Löschen entfernt die Datei
  await dt.dateiLoeschen(vom, "Test");
  assert.equal((await holen(token, vom)).status, 404);
});

test("Testbetrieb: Mails nur an interne Adressen, keine Briefe; Versand verweigert auch ohne Prüfung", async () => {
  const post = await import("../src/lib/ablauf/postausgang");
  const env = process.env as Record<string, string | undefined>;
  const vorher = { t: env.TESTPHASE, d: env.TESTPHASE_DOMAINS };
  try {
    env.TESTPHASE = "ja";
    delete env.TESTPHASE_DOMAINS;
    assert.equal(post.testbetriebVerbietet({ kanal: "mail", empfaenger: "m.steiner@levarex-consulting.de" }), null);
    assert.match(post.testbetriebVerbietet({ kanal: "mail", empfaenger: "chef@kunde.example" }) ?? "", /interne Adressen/);
    assert.match(post.testbetriebVerbietet({ kanal: "mail", empfaenger: "x@levarex-consulting.de.evil.example" }) ?? "", /interne Adressen/, "keine Domain-Tricks");
    assert.match(post.testbetriebVerbietet({ kanal: "brief", empfaenger: "Musterweg 1" }) ?? "", /Briefe/);
    env.TESTPHASE_DOMAINS = "levarex-consulting.de, @gmx.net";
    assert.equal(post.testbetriebVerbietet({ kanal: "mail", empfaenger: "test@GMX.net" }), null);
    // Auch ein (z. B. von Hand) freigegebener Eintrag an eine fremde Adresse geht nicht raus
    const [b] = await db.insert(schema.betriebe).values({ name: "Testbetrieb Sicher GmbH", gewerk: "SHK" }).returning();
    const [e] = await db.insert(schema.postausgang).values({ betriebId: b.id, kanal: "mail", zweck: "test", empfaenger: "chef@kunde.example", betreff: "Test", text: "Test", status: "freigegeben", freigaben: [{ name: "Test", am: new Date().toISOString() }] }).returning();
    await assert.rejects(() => post.versende(e.id), /Testbetrieb/);
    env.TESTPHASE = "";
    assert.equal(post.testbetriebVerbietet({ kanal: "mail", empfaenger: "chef@kunde.example" }), null, "ohne Testbetrieb keine Einschränkung");
  } finally {
    if (vorher.t === undefined) delete env.TESTPHASE; else env.TESTPHASE = vorher.t;
    if (vorher.d === undefined) delete env.TESTPHASE_DOMAINS; else env.TESTPHASE_DOMAINS = vorher.d;
  }
});

test("Eigenes Postfach: Passwort verschlüsselt, interne Server verboten, Absender = wer unterschreibt, Ablage in „Gesendet“", async () => {
  const pf = await import("../src/lib/postfach");
  const mail = await import("../src/lib/adapters/mail");
  const net = await import("node:net");
  const [mx] = await db.insert(schema.benutzer).values({ email: "mx-test@levarex-consulting.de", name: "Maxi Test", passwortHash: "x" }).returning();
  const [dl] = await db.insert(schema.benutzer).values({ email: "dl-test@levarex-consulting.de", name: "Dana Test", passwortHash: "x" }).returning();
  // Ungültige oder interne Server und Ports werden abgelehnt
  const basis = { host: "mx.example.org", port: 587, benutzer: "", passwort: "geheim-123", absender: "m.steiner@levarex-consulting.de", name: "" };
  await assert.rejects(() => pf.postfachSpeichern(mx.id, { ...basis, host: "localhost" }, "Test"), /gültiger Servername/);
  await assert.rejects(() => pf.postfachSpeichern(mx.id, { ...basis, host: "127.0.0.1" }, "Test"), /gültiger Servername/);
  await assert.rejects(() => pf.postfachSpeichern(mx.id, { ...basis, port: 25 }, "Test", { hostPruefen: false, verbindungTesten: false }), /587/);
  await assert.rejects(() => pf.postfachSpeichern(mx.id, { ...basis, absender: "kein-mail" }, "Test", { hostPruefen: false, verbindungTesten: false }), /Absender/);
  // Speichern: Passwort steht nicht im Klartext in der Datenbank
  await pf.postfachSpeichern(mx.id, basis, "Test", { hostPruefen: false, verbindungTesten: false });
  await pf.postfachSpeichern(dl.id, { ...basis, absender: "d.lueck@levarex-consulting.de", passwort: "anderes-456" }, "Test", { hostPruefen: false, verbindungTesten: false });
  const [roh] = await db.select().from(schema.benutzer).where(eq(schema.benutzer.id, mx.id));
  assert.ok(roh.postfach && !JSON.stringify(roh.postfach).includes("geheim-123"), "Passwort verschlüsselt");
  assert.equal(pf.kontoAus(roh.postfach)!.passwort, "geheim-123");
  assert.equal(roh.postfach!.benutzer, "m.steiner@levarex-consulting.de", "Benutzername = Absender, wenn leer");
  // Leeres Passwort beim Ändern behält das alte
  await pf.postfachSpeichern(mx.id, { ...basis, passwort: "", name: "Maxi T." }, "Test", { hostPruefen: false, verbindungTesten: false });
  const [neu] = await db.select().from(schema.benutzer).where(eq(schema.benutzer.id, mx.id));
  assert.equal(pf.kontoAus(neu.postfach)!.passwort, "geheim-123");
  // Absender: wer unterschreibt, sonst wer freigibt
  assert.equal((await pf.absenderFuer({ text: "Hallo\n\nMit freundlichen Grüßen\nDana Test\nLevarex Consulting", freigaben: [{ name: "Maxi Test" }] }))?.konto.absender, "d.lueck@levarex-consulting.de");
  assert.equal((await pf.absenderFuer({ text: "Hallo\n\nGruß\nIhr Team", freigaben: [{ name: "Maxi Test" }] }))?.konto.absender, "m.steiner@levarex-consulting.de");
  assert.equal(await pf.absenderFuer({ text: "Hallo\n\nGruß\nIhr Team", freigaben: [{ name: "Jemand anderes" }] }), null, "ohne Postfach: allgemeiner Absender");
  // Versand über das Konto: eine MIME-Fassung geht raus und wird abgelegt
  let gesendet: { von: string; an: string[]; mime: string } | null = null;
  let abgelegt = "";
  mail.setzeTestPostfach(async (_k, umschlag, mime) => ((gesendet = { von: umschlag.from, an: umschlag.to, mime: mime.toString() }), "<id@test>"), async (_k, mime) => ((abgelegt = mime.toString()), "Sent"));
  try {
    const r = await mail.sendeMail({ an: "kunde@levarex-consulting.de", betreff: "Test", text: "Hallo", anhaenge: [] }, pf.kontoAus(neu.postfach));
    assert.match(r, /Versendet von m\.steiner@levarex-consulting\.de.*„Sent“/);
    assert.equal(gesendet!.von, "m.steiner@levarex-consulting.de");
    assert.equal(abgelegt, gesendet!.mime, "dieselbe Mail liegt in „Gesendet“");
    assert.match(gesendet!.mime, /From: "?Maxi T\."? <m\.steiner@levarex-consulting\.de>/);
  } finally {
    mail.setzeTestPostfach(null, null);
  }
  // Ordner „Gesendet“ erkennen
  assert.equal(pf.gesendetOrdner(['* LIST (\\HasNoChildren) "." "INBOX"', '* LIST (\\HasNoChildren \\Sent) "." "Sent"']), "Sent");
  assert.equal(pf.gesendetOrdner(['* LIST (\\HasNoChildren) "." "INBOX.Gesendet"']), "INBOX.Gesendet");
  // IMAP gegen einen kleinen nachgebauten Server: Anmelden, Ordner finden, Mail ablegen
  const befehle: string[] = [];
  let erhalten = "";
  const server = net.createServer((s) => {
    s.write("* OK bereit\r\n");
    let puffer = "";
    let literal = 0;
    let literalTag = "";
    s.on("data", (d) => {
      puffer += d.toString();
      for (;;) {
        if (literal) {
          if (puffer.length < literal + 2) return;
          erhalten = puffer.slice(0, literal);
          puffer = puffer.slice(literal + 2);
          literal = 0;
          s.write(`${literalTag} OK APPEND fertig\r\n`);
          continue;
        }
        const i = puffer.indexOf("\r\n");
        if (i < 0) return;
        const z = puffer.slice(0, i);
        puffer = puffer.slice(i + 2);
        const [tag, cmd] = z.split(" ");
        befehle.push(cmd);
        if (cmd === "LOGIN") s.write(z.includes('"geheim-123"') ? `${tag} OK angemeldet\r\n` : `${tag} NO falsch\r\n`);
        else if (cmd === "LIST") s.write(`* LIST (\\HasNoChildren) "." "INBOX"\r\n* LIST (\\HasNoChildren \\Sent) "." "Gesendete Objekte"\r\n${tag} OK LIST\r\n`);
        else if (cmd === "APPEND") {
          literal = Number(/\{(\d+)\}$/.exec(z)![1]);
          literalTag = tag;
          s.write("+ weiter\r\n");
        } else if (cmd === "LOGOUT") s.end(`* BYE\r\n${tag} OK\r\n`);
      }
    });
  });
  await new Promise<void>((ja) => server.listen(0, "127.0.0.1", () => ja()));
  try {
    const port = (server.address() as { port: number }).port;
    const k = { ...pf.kontoAus(neu.postfach)!, imapHost: "127.0.0.1", imapPort: port };
    const ordner = await pf.imGesendetAblegen(k, Buffer.from("Subject: Test\r\n\r\nHallo"), { unsicherFuerTest: true });
    assert.equal(ordner, "Gesendete Objekte");
    assert.deepEqual(befehle, ["LOGIN", "LIST", "APPEND", "LOGOUT"]);
    assert.equal(erhalten, "Subject: Test\r\n\r\nHallo");
    await assert.rejects(() => pf.imGesendetAblegen({ ...k, passwort: "falsch" }, Buffer.from("x"), { unsicherFuerTest: true }), /falsch/);
  } finally {
    server.close();
  }
});
