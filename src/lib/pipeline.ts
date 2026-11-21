import { desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "./db";
import { BUSINESS_CASE } from "./plan";

// Verkaufs-Pipeline: Stufen aus dem Ablauf, Wert aus dem letzten Angebot (sonst Ø Kaufpreis aus dem Business Case),
// gewichtet mit einer Abschlusswahrscheinlichkeit je Stufe. „Liegt“ = seit X Tagen keine Aktivität.

export const STUFEN = [
  { key: "neu", name: "Gefunden", wahrscheinlichkeit: 0.03, liegtNach: 7 },
  { key: "interessant", name: "Interessant", wahrscheinlichkeit: 0.08, liegtNach: 3 },
  { key: "angeschrieben", name: "Angeschrieben", wahrscheinlichkeit: 0.12, liegtNach: 14 },
  { key: "termin", name: "Termin", wahrscheinlichkeit: BUSINESS_CASE.ziele.prozessCheckQuote, liegtNach: 7 },
  { key: "angebot", name: "Angebot", wahrscheinlichkeit: 0.6, liegtNach: 7 },
  { key: "kunde", name: "Gewonnen", wahrscheinlichkeit: 1, liegtNach: 9999 },
] as const;

export type Karte = { id: number; name: string; ort: string | null; gewerk: string; wert: number; geschaetzt: boolean; tageOhneAktivitaet: number; liegt: boolean; zustaendig: string | null; tags: string[]; naechsteAufgabe: string | null };

export async function pipeline(jetzt = new Date()) {
  const db = await getDb();
  const betriebe = await db.select().from(schema.betriebe).where(inArray(schema.betriebe.status, STUFEN.map((s) => s.key)));
  const ids = betriebe.map((b) => b.id);
  const angebote = ids.length ? await db.select().from(schema.angebote).where(inArray(schema.angebote.betriebId, ids)).orderBy(desc(schema.angebote.erstelltAm)) : [];
  const aufgaben = ids.length ? await db.select().from(schema.aktivitaeten).where(inArray(schema.aktivitaeten.betriebId, ids)) : [];
  return STUFEN.map((s) => {
    const karten: Karte[] = betriebe
      .filter((b) => b.status === s.key)
      .map((b) => {
        const a = angebote.find((x) => x.betriebId === b.id);
        const tage = Math.floor((jetzt.getTime() - b.letzteAktivitaet.getTime()) / 864e5);
        const offen = aufgaben.filter((x) => x.betriebId === b.id && !x.erledigtAm && x.faelligAm).sort((x, y) => x.faelligAm!.getTime() - y.faelligAm!.getTime())[0];
        return { id: b.id, name: b.name, ort: b.ort, gewerk: b.gewerk, wert: a?.einmalig ?? BUSINESS_CASE.oKaufpreis, geschaetzt: !a, tageOhneAktivitaet: tage, liegt: tage >= s.liegtNach, zustaendig: b.zustaendig, tags: b.tags, naechsteAufgabe: offen ? `${offen.titel} · ${offen.faelligAm!.toLocaleDateString("de-DE")}` : null };
      })
      .sort((x, y) => Number(y.liegt) - Number(x.liegt) || y.wert - x.wert);
    const summe = karten.reduce((x, k) => x + k.wert, 0);
    return { ...s, karten, summe, gewichtet: Math.round(summe * s.wahrscheinlichkeit) };
  });
}

/** Prognose: gewichteter Wert aller offenen Chancen (ohne Gewonnene). */
export function prognose(stufen: Awaited<ReturnType<typeof pipeline>>): number {
  return stufen.filter((s) => s.key !== "kunde").reduce((x, s) => x + s.gewichtet, 0);
}

export async function betriebZuweisen(id: number, zustaendig: string | null, tags: string[]): Promise<void> {
  const db = await getDb();
  await db.update(schema.betriebe).set({ zustaendig, tags: [...new Set(tags.map((t) => t.trim()).filter(Boolean))].slice(0, 20) }).where(eq(schema.betriebe.id, id));
}

/**
 * Betrieb in der Pipeline auf eine andere Stufe ziehen. Regeln:
 * „Gewonnen“ nur durch Unterschrift; „Interessant“ aus „Gefunden“ startet wie der Knopf Check, Demo und Brief;
 * Kunden und gesperrte Betriebe bleiben, wo sie sind. Jede Änderung steht im Protokoll.
 */
export async function stufeWechseln(id: number, ziel: string, wer: string): Promise<void> {
  const erlaubt = ["neu", "interessant", "angeschrieben", "termin", "angebot"];
  if (ziel === "kunde") throw new Error("Zum Kunden wird ein Betrieb mit der Unterschrift, nicht durch Verschieben.");
  if (!erlaubt.includes(ziel)) throw new Error("Unbekannte Stufe");
  const db = await getDb();
  const [b] = await db.select().from(schema.betriebe).where(eq(schema.betriebe.id, id));
  if (!b) throw new Error("Betrieb nicht gefunden");
  if (b.status === ziel) return;
  if (b.status === "kunde") throw new Error("Kunden bleiben Kunden. Für Kündigung oder Ende bitte das Projekt öffnen.");
  if (b.status === "gesperrt") throw new Error("Betrieb steht auf der Sperrliste.");
  const { einstufen } = await import("./ablauf/akquise");
  if (ziel === "interessant" && b.status === "neu") return einstufen(id, true, wer);
  const { setzeStatus } = await import("./ablauf/gemeinsam");
  const { protokolliere } = await import("./protokoll");
  await setzeStatus(id, ziel);
  await protokolliere(wer, `Pipeline: ${STUFEN.find((s) => s.key === b.status)?.name ?? b.status} → ${STUFEN.find((s) => s.key === ziel)?.name}`, id);
}

/** Kundenspalten nach „Angebot“: wo jedes Kundenprojekt gerade steht (nur zum Ansehen, sie wandern von selbst weiter). */
export const KUNDEN_STUFEN = [
  { key: "k_anzahlung", name: "Unterschrieben" },
  { key: "k_inhalte", name: "Inhalte" },
  { key: "k_bau", name: "Bau und Vorschau" },
  { key: "k_abnahme", name: "Abnahme" },
  { key: "k_live", name: "Live" },
] as const;

export async function kundenSpalten() {
  const db = await getDb();
  const kunden = await db.select().from(schema.betriebe).where(eq(schema.betriebe.status, "kunde"));
  const ids = kunden.map((k) => k.id);
  const [projekte, angebote] = ids.length
    ? await Promise.all([
        db.select().from(schema.projekte).where(inArray(schema.projekte.betriebId, ids)).orderBy(desc(schema.projekte.erstelltAm)),
        db.select().from(schema.angebote).where(inArray(schema.angebote.betriebId, ids)).orderBy(desc(schema.angebote.erstelltAm)),
      ])
    : [[], []];
  const spalteVon = (p: (typeof projekte)[number] | undefined) => {
    if (!p) return "k_anzahlung";
    if (p.status === "inhalte") return "k_inhalte";
    if (p.status === "bau" || p.status === "pruefung") return "k_bau";
    if (p.status === "bereit") return p.abnahmeStatus === "offen" || ["abgenommen", "vorbehalt", "fiktion"].includes(p.abnahmeStatus ?? "") ? "k_abnahme" : "k_bau";
    return "k_live";
  };
  return KUNDEN_STUFEN.map((s) => {
    const karten = kunden
      .map((b) => ({ b, p: projekte.find((x) => x.betriebId === b.id), a: angebote.find((x) => x.betriebId === b.id) }))
      .filter((x) => spalteVon(x.p) === s.key)
      .map(({ b, p, a }) => ({
        id: b.id,
        name: b.name,
        ort: b.ort,
        gewerk: b.gewerk,
        wert: a?.einmalig ?? 0,
        geschaetzt: false,
        tageOhneAktivitaet: 0,
        liegt: false,
        zustaendig: b.zustaendig,
        naechsteAufgabe: !p ? "erste Rate offen" : p.status === "pruefung" ? "Prüfung nicht bestanden" : p.abnahmeStatus === "offen" && p.abnahmeFrist ? `Abnahme bis ${p.abnahmeFrist.toLocaleDateString("de-DE")}` : p.liveAm ? `live seit ${p.liveAm.toLocaleDateString("de-DE")}` : null,
        href: p ? `/projekte/${p.id}` : `/leads/${b.id}`,
        monatlich: a?.monatlich ?? 0,
      }));
    return { key: s.key, name: s.name, summe: karten.reduce((x, k) => x + k.wert, 0), karten };
  });
}
