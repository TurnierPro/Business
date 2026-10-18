import fs from "node:fs";
import path from "node:path";
import { and, asc, eq, gte, lt } from "drizzle-orm";
import { getDb, schema } from "./db";
import { datenOrdner } from "./pfade";
import { einreihen } from "./jobs/warteschlange";
import { protokolliere } from "./protokoll";
import { liesBeleg, jsonAus } from "./adapters/ki";
import { UST } from "./pakete";

// Finanzen: Ausgaben mit Belegen, Einnahmen aus den Rechnungen, Auswertung je Monat, Quartal, Jahr.
// Das ist eure Steuerungsübersicht, keine Buchhaltung: Bilanz und Jahresabschluss macht der Steuerberater.

// Planwerte je Monat aus dem Business Case (Fixkosten 3.900 €), in Cent.
export const KATEGORIEN: { key: string; name: string; planMonat: number }[] = [
  { key: "steuerberater", name: "Steuerberater", planMonat: 50000 },
  { key: "software", name: "Software, Hetzner, KI", planMonat: 55000 },
  { key: "rechtstexte", name: "Rechtstexte", planMonat: 5000 },
  { key: "versicherungen", name: "Versicherungen", planMonat: 25000 },
  { key: "marketing", name: "Marketing und Briefe", planMonat: 80000 },
  { key: "firmenwagen", name: "Firmenwagen", planMonat: 65000 },
  { key: "fahrten", name: "Fahrten", planMonat: 25000 },
  { key: "mobilfunk", name: "Mobilfunk", planMonat: 8000 },
  { key: "hardware_ruecklage", name: "Hardware-Rücklage", planMonat: 15000 },
  { key: "buero", name: "Büro", planMonat: 22000 },
  { key: "sonstiges", name: "IHK, Bank, Sonstiges", planMonat: 40000 },
  { key: "gehaelter", name: "Gehälter", planMonat: 0 },
  { key: "projektkosten", name: "Projektkosten (Fotograf, Lizenzen)", planMonat: 0 },
  { key: "hardware", name: "Hardware-Anschaffung", planMonat: 0 },
  { key: "gruendung", name: "Gründung und Beratung", planMonat: 0 },
];

export const kategorieName = (key: string) => KATEGORIEN.find((k) => k.key === key)?.name ?? key;

export const STEUERSATZ = 0.315; // Gewinnsteuern laut Business Case, monatlich zurücklegen

export type Zeitraum = { key: string; name: string; von: Date; bis: Date; art: "monat" | "quartal" | "jahr"; monate: string[] };

const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

export function zeitraum(key?: string): Zeitraum {
  const jetzt = new Date();
  const k = key ?? `${jetzt.getFullYear()}-Q${Math.floor(jetzt.getMonth() / 3) + 1}`;
  const m = k.match(/^(\d{4})(?:-(Q[1-4]|\d{2}))?$/);
  if (!m) return zeitraum();
  const jahr = Number(m[1]);
  const monatsliste = (von: number, anzahl: number) => Array.from({ length: anzahl }, (_, i) => `${jahr}-${String(von + i + 1).padStart(2, "0")}`);
  if (!m[2]) return { key: k, name: `Jahr ${jahr}`, art: "jahr", von: new Date(jahr, 0, 1), bis: new Date(jahr + 1, 0, 1), monate: monatsliste(0, 12) };
  if (m[2].startsWith("Q")) {
    const q = Number(m[2][1]);
    return { key: k, name: `${q}. Quartal ${jahr}`, art: "quartal", von: new Date(jahr, (q - 1) * 3, 1), bis: new Date(jahr, q * 3, 1), monate: monatsliste((q - 1) * 3, 3) };
  }
  const mo = Number(m[2]) - 1;
  return { key: k, name: `${MONATE[mo]} ${jahr}`, art: "monat", von: new Date(jahr, mo, 1), bis: new Date(jahr, mo + 1, 1), monate: monatsliste(mo, 1) };
}

export function nachbar(z: Zeitraum, richtung: 1 | -1): string {
  const j = z.von.getFullYear();
  if (z.art === "jahr") return String(j + richtung);
  if (z.art === "quartal") {
    const q = Math.floor(z.von.getMonth() / 3) + 1 + richtung;
    return q < 1 ? `${j - 1}-Q4` : q > 4 ? `${j + 1}-Q1` : `${j}-Q${q}`;
  }
  const d = new Date(j, z.von.getMonth() + richtung, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const monatKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
export const monatName = (key: string) => `${MONATE[Number(key.slice(5)) - 1].slice(0, 3)} ${key.slice(2, 4)}`;

export async function auswertung(z: Zeitraum) {
  const db = await getDb();
  const [rechnungen, ausgaben, offen] = await Promise.all([
    db.select({ r: schema.rechnungen, kunde: schema.betriebe.name }).from(schema.rechnungen).innerJoin(schema.betriebe, eq(schema.rechnungen.betriebId, schema.betriebe.id)).where(and(gte(schema.rechnungen.erstelltAm, z.von), lt(schema.rechnungen.erstelltAm, z.bis))).orderBy(asc(schema.rechnungen.erstelltAm)),
    db.select().from(schema.ausgaben).where(and(gte(schema.ausgaben.datum, z.von), lt(schema.ausgaben.datum, z.bis))).orderBy(asc(schema.ausgaben.datum)),
    db.select({ r: schema.rechnungen, kunde: schema.betriebe.name }).from(schema.rechnungen).innerJoin(schema.betriebe, eq(schema.rechnungen.betriebId, schema.betriebe.id)).where(eq(schema.rechnungen.status, "offen")),
  ]);
  // Ist-Versteuerung: Umsatzsteuer fällig, wenn das Geld da ist.
  const bezahltImZeitraum = await db.select().from(schema.rechnungen).where(and(gte(schema.rechnungen.bezahltAm, z.von), lt(schema.rechnungen.bezahltAm, z.bis)));

  const umsatz = rechnungen.reduce((s, x) => s + x.r.netto, 0);
  const kosten = ausgaben.reduce((s, a) => s + a.netto, 0);
  const ergebnis = umsatz - kosten;
  const ustEinnahmen = bezahltImZeitraum.reduce((s, r) => s + Math.round(r.netto * UST), 0);
  const vorsteuer = ausgaben.filter((a) => a.bezahlt).reduce((s, a) => s + a.ust, 0);
  const proMonat = z.monate.map((m) => ({
    monat: m,
    umsatz: rechnungen.filter((x) => monatKey(x.r.erstelltAm) === m).reduce((s, x) => s + x.r.netto, 0),
    ausgaben: ausgaben.filter((a) => monatKey(a.datum) === m).reduce((s, a) => s + a.netto, 0),
  }));
  const proKategorie = KATEGORIEN.map((k) => ({
    ...k,
    ist: ausgaben.filter((a) => a.kategorie === k.key).reduce((s, a) => s + a.netto, 0),
    plan: k.planMonat * z.monate.length,
  })).filter((k) => k.ist || k.plan);

  return {
    rechnungen,
    ausgaben,
    offen,
    umsatz,
    kosten,
    ergebnis,
    offeneForderungen: offen.reduce((s, x) => s + Math.round(x.r.netto * (1 + UST)), 0),
    ustEinnahmen,
    vorsteuer,
    ustZahllast: ustEinnahmen - vorsteuer,
    steuerruecklage: Math.max(0, Math.round(ergebnis * STEUERSATZ)),
    proMonat,
    proKategorie,
    zuPruefen: ausgaben.filter((a) => a.status === "pruefen").length,
  };
}

export type Auswertung = Awaited<ReturnType<typeof auswertung>>;

/** Betrag „1.234,56“ oder „1234.56“ in Cent. */
export function inCent(text: string): number {
  const t = text.trim().replace(/\s|€/g, "");
  const normal = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  const n = Math.round(Number(normal) * 100);
  if (!Number.isFinite(n)) throw new Error(`„${text}“ ist kein Betrag.`);
  return n;
}

async function belegSpeichern(datei: File | null): Promise<{ pfad: string; name: string } | null> {
  if (!datei || datei.size === 0) return null;
  if (!/^(image\/|application\/pdf)/.test(datei.type)) throw new Error("Beleg bitte als Foto oder PDF.");
  const jahr = new Date().getFullYear();
  const name = `${Date.now()}-${datei.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-60)}`;
  const pfad = path.join(datenOrdner("belege", String(jahr)), name);
  fs.writeFileSync(pfad, Buffer.from(await datei.arrayBuffer()));
  return { pfad, name: datei.name };
}

export async function ausgabeSpeichern(f: FormData, wer: string, id?: number): Promise<number> {
  const db = await getDb();
  const beleg = await belegSpeichern(f.get("beleg") as File | null);
  const nurBeleg = f.get("nurBeleg") === "ja";
  if (nurBeleg) {
    if (!beleg) throw new Error("Bitte einen Beleg auswählen.");
    const [neu] = await db
      .insert(schema.ausgaben)
      .values({ datum: new Date(), lieferant: "Beleg prüfen", kategorie: "sonstiges", netto: 0, ust: 0, ustSatz: 19, belegPfad: beleg.pfad, belegName: beleg.name, status: "pruefen", erfasstVon: wer })
      .returning({ id: schema.ausgaben.id });
    await protokolliere(wer, "Beleg hochgeladen", null, beleg.name);
    await einreihen("beleg", { ausgabeId: neu.id });
    return neu.id;
  }
  const satz = Number(f.get("ustSatz") ?? 19);
  const brutto = inCent(String(f.get("brutto") ?? "0"));
  const netto = Math.round(brutto / (1 + satz / 100));
  const werte = {
    datum: new Date(String(f.get("datum"))),
    lieferant: String(f.get("lieferant") ?? "").trim(),
    beschreibung: String(f.get("beschreibung") ?? "").trim() || null,
    kategorie: String(f.get("kategorie") ?? "sonstiges"),
    netto,
    ustSatz: satz,
    ust: brutto - netto,
    bezahlt: f.get("bezahlt") === "ja",
    status: "erfasst",
    ...(beleg ? { belegPfad: beleg.pfad, belegName: beleg.name } : {}),
  };
  if (!werte.lieferant) throw new Error("Bitte den Lieferanten eintragen.");
  if (Number.isNaN(werte.datum.getTime())) throw new Error("Bitte ein Datum eintragen.");
  if (id) {
    await db.update(schema.ausgaben).set(werte).where(eq(schema.ausgaben.id, id));
    await protokolliere(wer, `Ausgabe geändert: ${werte.lieferant}`);
    return id;
  }
  const [neu] = await db.insert(schema.ausgaben).values({ ...werte, erfasstVon: wer }).returning({ id: schema.ausgaben.id });
  await protokolliere(wer, `Ausgabe erfasst: ${werte.lieferant}`);
  return neu.id;
}

/** Beleg mit KI auslesen und die Felder vorbelegen. Ohne KI bleibt die Ausgabe auf „prüfen“. */
export async function belegLesen(ausgabeId: number): Promise<string> {
  const db = await getDb();
  const [a] = await db.select().from(schema.ausgaben).where(eq(schema.ausgaben.id, ausgabeId));
  if (!a?.belegPfad) return "Kein Beleg";
  const antwort = await liesBeleg(
    a.belegPfad,
    `Lies diesen Beleg aus. Antworte nur mit JSON: {"lieferant": string, "datum": "JJJJ-MM-TT", "brutto": Zahl in Euro, "ustSatz": 19|7|0, "beschreibung": string, "kategorie": einer von ${KATEGORIEN.map((k) => `"${k.key}"`).join(", ")}}`,
  );
  if (!antwort) return "Simulator: Beleg bitte von Hand prüfen";
  const d = jsonAus<{ lieferant?: string; datum?: string; brutto?: number; ustSatz?: number; beschreibung?: string; kategorie?: string }>(antwort, {});
  const satz = [0, 7, 19].includes(Number(d.ustSatz)) ? Number(d.ustSatz) : 19;
  const brutto = Math.round(Number(d.brutto ?? 0) * 100);
  const netto = Math.round(brutto / (1 + satz / 100));
  const datum = d.datum ? new Date(d.datum) : a.datum;
  await db
    .update(schema.ausgaben)
    .set({
      lieferant: d.lieferant || a.lieferant,
      datum: Number.isNaN(datum.getTime()) ? a.datum : datum,
      netto,
      ust: brutto - netto,
      ustSatz: satz,
      beschreibung: d.beschreibung ?? null,
      kategorie: KATEGORIEN.some((k) => k.key === d.kategorie) ? d.kategorie! : "sonstiges",
    })
    .where(eq(schema.ausgaben.id, ausgabeId));
  return `Beleg gelesen: ${d.lieferant ?? "?"}`;
}

export async function rechnungBezahlt(id: number, wer: string): Promise<void> {
  const db = await getDb();
  const [r] = await db.update(schema.rechnungen).set({ status: "bezahlt", bezahltAm: new Date() }).where(eq(schema.rechnungen.id, id)).returning();
  await protokolliere(wer, `Rechnung ${r.nummer} als bezahlt markiert`, r.betriebId);
}

const csvZelle = (v: unknown) => {
  const s = String(v ?? "");
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const betrag = (cent: number) => (cent / 100).toFixed(2).replace(".", ",");
const tag = (d: Date) => d.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" });

/** CSV für den Steuerberater (Excel-tauglich: Semikolon, deutsche Zahlen, UTF-8 mit BOM). */
export function csv(a: Auswertung, art: "ausgaben" | "einnahmen"): string {
  const zeilen =
    art === "ausgaben"
      ? [
          ["Datum", "Lieferant", "Beschreibung", "Kategorie", "Netto", "USt-Satz", "USt", "Brutto", "Bezahlt", "Beleg"],
          ...a.ausgaben.map((x) => [tag(x.datum), x.lieferant, x.beschreibung, kategorieName(x.kategorie), betrag(x.netto), `${x.ustSatz} %`, betrag(x.ust), betrag(x.netto + x.ust), x.bezahlt ? "ja" : "nein", x.belegName ?? ""]),
        ]
      : [
          ["Rechnungsdatum", "Nummer", "Kunde", "Art", "Netto", "USt", "Brutto", "Status", "Bezahlt am"],
          ...a.rechnungen.map(({ r, kunde }) => [tag(r.erstelltAm), r.nummer, kunde, r.art === "anzahlung" ? "Anzahlung" : "Schlussrechnung", betrag(r.netto), betrag(Math.round(r.netto * UST)), betrag(Math.round(r.netto * (1 + UST))), r.status, r.bezahltAm ? tag(r.bezahltAm) : ""]),
        ];
  return "﻿" + zeilen.map((z) => z.map(csvZelle).join(";")).join("\r\n");
}
