import { eq } from "drizzle-orm";
import { zugangPerPortal } from "@/lib/kundenportal";
import { getDb, schema } from "@/lib/db";
import { protokolliere } from "@/lib/protokoll";
import { clientIp, erlaubt, versuchMerken } from "@/lib/sicherheit";
import { slugAus } from "@/lib/ablauf/gemeinsam";

// Datenexport für den Betrieb (Business Case: „Daten jederzeit exportierbar“, Data Act; Art. 20 DSGVO).
// ?format=csv liefert die Anfragen als Tabelle (Excel), sonst alles als JSON.
const csvFeld = (v: unknown) => {
  const s = String(v ?? "").replace(/\r?\n/g, " ");
  // Formeln in Excel verhindern (CSV-Injection)
  const sicher = /^[=+\-@\t]/.test(s) ? `'${s}` : s;
  return `"${sicher.replace(/"/g, '""')}"`;
};

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const zugang = await zugangPerPortal(token);
  if (!zugang) return new Response("Nicht gefunden", { status: 404 });
  const ip = clientIp(req.headers);
  if (!(await erlaubt("portal-export", ip, { max: 20, minuten: 60 }))) return new Response("Zu viele Abrufe. Bitte später noch einmal.", { status: 429 });
  await versuchMerken("portal-export", ip);
  const b = zugang.betrieb;
  const db = await getDb();
  const anfragen = await db.select().from(schema.anfragen).where(eq(schema.anfragen.betriebId, b.id));
  const format = new URL(req.url).searchParams.get("format");
  await protokolliere(`Kundenportal (${zugang.person ?? b.name})`, `Datenexport heruntergeladen (${format === "csv" ? "Anfragen als CSV" : "alles als JSON"})`, b.id);
  const datei = `levarex-${slugAus(b.name)}-${new Date().toISOString().slice(0, 10)}`;
  const kopf = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
  if (format === "csv") {
    const zeilen = [["Datum", "Name", "Kontakt", "Nachricht", "Seite", "Anhänge"].map(csvFeld).join(";"), ...anfragen.map((a) => [a.am.toISOString(), a.name, a.kontakt, a.nachricht, a.seitenSlug, a.dateien.length].map(csvFeld).join(";"))];
    return new Response("﻿" + zeilen.join("\r\n"), { headers: { ...kopf, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${datei}-anfragen.csv"` } });
  }
  const [tickets, rechnungen, dokumente, beitraege, projekte] = await Promise.all([
    db.select().from(schema.tickets).where(eq(schema.tickets.betriebId, b.id)),
    db.select().from(schema.rechnungen).where(eq(schema.rechnungen.betriebId, b.id)),
    db.select().from(schema.dokumente).where(eq(schema.dokumente.betriebId, b.id)),
    db.select().from(schema.beitraege).where(eq(schema.beitraege.betriebId, b.id)),
    db.select().from(schema.projekte).where(eq(schema.projekte.betriebId, b.id)),
  ]);
  const { sichtbareDokumente } = await import("@/lib/kundenportal");
  const sichtbar = new Set((await sichtbareDokumente(b.id)).map((d) => d.id));
  const daten = {
    erstelltAm: new Date().toISOString(),
    hinweis: "Ihre Daten bei Levarex Consulting. Die Unterlagen als PDF finden Sie im Kundenportal.",
    betrieb: { name: b.name, inhaber: b.inhaber, strasse: b.strasse, plz: b.plz, ort: b.ort, telefon: b.telefon, email: b.email, website: b.website },
    websites: projekte.map((p) => ({ paket: p.paket, domain: p.domain, status: p.status, liveAm: p.liveAm, inhalte: p.inhalte })),
    anfragen: anfragen.map(({ am, name, kontakt, nachricht, seitenSlug, dateien }) => ({ am, name, kontakt, nachricht, seite: seitenSlug, anhaenge: dateien.length })),
    tickets: tickets.map(({ betreff, beschreibung, kategorie, status, loesung, erstelltAm, erledigtAm }) => ({ betreff, beschreibung, kategorie, status, loesung, erstelltAm, erledigtAm })),
    rechnungen: rechnungen.map(({ nummer, art, netto, status, faelligAm, bezahltAm, erstelltAm }) => ({ nummer, art, netto_cent: netto, status, faelligAm, bezahltAm, erstelltAm })),
    unterlagen: dokumente.filter((d) => sichtbar.has(d.id)).map((d) => ({ art: d.art, titel: d.titel, erstelltAm: d.erstelltAm })),
    beitraege: beitraege.filter((x) => !["entwurf", "zur_vorlage"].includes(x.status)).map(({ art, kanaele, text, status, entschiedenAm, veroeffentlichtAm }) => ({ art, kanaele, text, status, entschiedenAm, veroeffentlichtAm })),
  };
  return new Response(JSON.stringify(daten, null, 2), { headers: { ...kopf, "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="${datei}.json"` } });
}
