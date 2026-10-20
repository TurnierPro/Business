import { eq } from "drizzle-orm";
import { getDb, schema } from "./db";
import { protokolliere } from "./protokoll";
import { AENDERUNGS_MINUTEN, NICHT_ENTHALTEN, PAKETE, type Paket, type PaketKey } from "./pakete";
import { MODULE, ZUSAETZE, type Katalog, type Modul, type Zusatz } from "./katalog";
import { ZIEL_STUNDEN } from "./ablauf/zeiten";

// Stammdaten: Werkseinstellung aus dem Code, darüber die Änderungen aus der Datenbank.
// katalogLaden() baut den Katalog bei jedem Aufruf neu auf (die Tabelle ist winzig), damit alle Teile
// des Servers dieselben Preise sehen.

export type PaketDaten = Paket & { nichtEnthalten: string[]; aenderungsMinuten: number; zielStunden: number };

const WERK = structuredClone({ PAKETE, MODULE, ZUSAETZE, NICHT_ENTHALTEN, AENDERUNGS_MINUTEN, ZIEL_STUNDEN });

export async function katalogLaden(): Promise<Katalog> {
  const db = await getDb();
  const zeilen = await db.select().from(schema.katalogEintraege);
  const ueber = (art: string, key: string) => zeilen.find((z) => z.art === art && z.key === `${art}:${key}`)?.daten;
  for (const key of Object.keys(WERK.PAKETE) as PaketKey[]) {
    const d = (ueber("paket", key) ?? {}) as Partial<PaketDaten>;
    const { nichtEnthalten, aenderungsMinuten, zielStunden, ...paket } = d;
    PAKETE[key] = { ...structuredClone(WERK.PAKETE[key]), ...paket };
    NICHT_ENTHALTEN[key] = nichtEnthalten ?? [...WERK.NICHT_ENTHALTEN[key]];
    AENDERUNGS_MINUTEN[key] = aenderungsMinuten ?? WERK.AENDERUNGS_MINUTEN[key];
    ZIEL_STUNDEN[key] = zielStunden ?? WERK.ZIEL_STUNDEN[key];
  }
  // Module und Zusatzleistungen: Werkseinträge (ggf. geändert) plus neu angelegte
  const neu = <T extends { key: string }>(art: string, werk: T[]): T[] => [
    ...werk.map((w) => ({ ...structuredClone(w), ...((ueber(art, w.key) ?? {}) as Partial<T>) })),
    ...zeilen.filter((z) => z.art === art && !werk.some((w) => `${art}:${w.key}` === z.key)).map((z) => z.daten as T),
  ];
  MODULE.splice(0, MODULE.length, ...neu<Modul>("modul", WERK.MODULE).sort((a, b) => a.nr - b.nr));
  ZUSAETZE.splice(0, ZUSAETZE.length, ...neu<Zusatz>("zusatz", WERK.ZUSAETZE));
  return { pakete: structuredClone(PAKETE), module: structuredClone(MODULE), zusaetze: structuredClone(ZUSAETZE) };
}

export function paketDaten(key: PaketKey): PaketDaten {
  return { ...PAKETE[key], nichtEnthalten: NICHT_ENTHALTEN[key], aenderungsMinuten: AENDERUNGS_MINUTEN[key], zielStunden: ZIEL_STUNDEN[key] };
}

const cent = (v: unknown, feld: string, leerErlaubt = false): number | null => {
  const t = String(v ?? "").trim();
  if (!t && leerErlaubt) return null;
  const n = Math.round(Number(t.replace(/\./g, "").replace(",", ".")) * 100);
  if (!Number.isFinite(n) || n < 0 || n > 100_000_000) throw new Error(`${feld}: Betrag ungültig`);
  return n;
};
const ganz = (v: unknown, feld: string, max = 1000) => {
  const n = Number(String(v ?? "").trim() || "0");
  if (!Number.isInteger(n) || n < 0 || n > max) throw new Error(`${feld}: Zahl zwischen 0 und ${max}`);
  return n;
};
const zeilenListe = (v: unknown) => String(v ?? "").split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 40);
const kurz = (v: unknown, feld: string, max = 200) => {
  const t = String(v ?? "").trim();
  if (!t) throw new Error(`${feld} fehlt`);
  if (t.length > max) throw new Error(`${feld}: höchstens ${max} Zeichen`);
  return t;
};

async function schreiben(art: string, key: string, daten: Record<string, unknown>, wer: string) {
  const db = await getDb();
  const id = `${art}:${key}`;
  await db.insert(schema.katalogEintraege).values({ key: id, art, daten, geaendertVon: wer }).onConflictDoUpdate({ target: schema.katalogEintraege.key, set: { daten, geaendertVon: wer, geaendertAm: new Date() } });
  await protokolliere(wer, `Stammdaten geändert: ${art} ${key}`);
  await katalogLaden();
}

export async function paketSpeichern(key: string, f: Record<string, unknown>, wer: string) {
  if (!(key in WERK.PAKETE)) throw new Error("Unbekanntes Paket");
  await schreiben("paket", key, {
    name: kurz(f.name, "Name", 80),
    einmalig: cent(f.einmalig, "Einmalig"),
    monatlich: cent(f.monatlich, "Monatlich"),
    wochen: ganz(f.wochen, "Wochen bis Livegang", 52),
    inklusiveModule: ganz(f.inklusiveModule, "Enthaltene Module", 10),
    inhalt: zeilenListe(f.inhalt),
    nichtEnthalten: zeilenListe(f.nichtEnthalten),
    aenderungsMinuten: ganz(f.aenderungsMinuten, "Änderungsminuten", 600),
    zielStunden: ganz(f.zielStunden, "Ziel-Stunden", 500),
    aktiv: f.aktiv === "ja",
  }, wer);
}

export async function modulSpeichern(key: string | null, f: Record<string, unknown>, wer: string) {
  const vorhanden = MODULE.find((m) => m.key === key);
  const k = vorhanden?.key ?? `m${Math.max(0, ...MODULE.map((m) => m.nr)) + 1}`;
  const nr = vorhanden?.nr ?? Math.max(0, ...MODULE.map((m) => m.nr)) + 1;
  await schreiben("modul", k, {
    key: k,
    nr,
    name: kurz(f.name, "Name", 80),
    text: kurz(f.text, "Beschreibung", 300),
    einmalig: cent(f.einmalig, "Einmalig", true),
    monatlich: cent(f.monatlich, "Monatlich") ?? 0,
    stufe: f.stufe === "2" ? 2 : 1,
    hinweis: String(f.hinweis ?? "").trim() || undefined,
    nurFuer: String(f.nurFuer ?? "").trim() || undefined,
    ...(vorhanden?.kombi ? { kombi: vorhanden.kombi } : {}),
    aktiv: f.aktiv === "ja",
  }, wer);
  return k;
}

export async function zusatzSpeichern(key: string | null, f: Record<string, unknown>, wer: string) {
  const vorhanden = ZUSAETZE.find((z) => z.key === key);
  const name = kurz(f.name, "Name", 80);
  const k = vorhanden?.key ?? `z_${Date.now().toString(36)}`;
  await schreiben("zusatz", k, { key: k, name, einmalig: cent(f.einmalig, "Einmalig") ?? 0, monatlich: cent(f.monatlich, "Monatlich") ?? 0, aktiv: f.aktiv === "ja" }, wer);
  return k;
}

/** Änderung verwerfen: zurück zur Werkseinstellung (neu angelegte Einträge werden entfernt). */
export async function zuruecksetzen(art: string, key: string, wer: string) {
  const db = await getDb();
  await db.delete(schema.katalogEintraege).where(eq(schema.katalogEintraege.key, `${art}:${key}`));
  await protokolliere(wer, `Stammdaten zurückgesetzt: ${art} ${key}`);
  await katalogLaden();
}

export async function geaendert(): Promise<Set<string>> {
  const db = await getDb();
  return new Set((await db.select({ key: schema.katalogEintraege.key }).from(schema.katalogEintraege)).map((z) => z.key));
}
