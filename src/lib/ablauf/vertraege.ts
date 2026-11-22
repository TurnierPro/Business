import crypto from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "../db";
import { protokolliere } from "../protokoll";
import { AENDERUNGS_MINUTEN, PAKETE, type PaketKey } from "../pakete";
import { MODULE } from "../katalog";
import { AENDERUNG_STUNDENSATZ, AGB_VERSION, VERTRAGSWERK_VERSION } from "../recht";
import { ZIEL_STUNDEN, ZIEL_STUNDEN_MODULE } from "./zeiten";
import { anschrift, betrieb, neuesDokument } from "./gemeinsam";
import { datumDe } from "../docs/basis";
import { unterschriftEingegangen } from "./verkauf";
import type { AngebotDaten, LeistungsscheinDaten, RahmenvertragDaten, VertragUnterschrift } from "../docs/vorlagen";

// Vertragswerk: Rahmenvertrag als Deckblatt, je Baustein ein Leistungsschein Erstellung (Einmalpreis)
// und ein Leistungsschein Betrieb (Monatsbeitrag). Unterschrieben wird auf Daniels Tablet beim Termin,
// je Dokument mit eigener Unterschrift. Danach gehen alle Unterlagen über die Freigabe an den Kunden
// und liegen im Kundenportal (dort nur zum Lesen).

export const VERTRAGSARTEN = ["rahmenvertrag", "leistungsschein_erstellung", "leistungsschein_betrieb", "av_vertrag", "pilotvereinbarung"] as const;
const MAX_BILD = 400_000; // Zeichen der data-URL (etwa 300 KB)
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const nr = (jahr: number, id: number) => `${jahr}-${String(id).padStart(4, "0")}`;
// Felder, die nach der Unterschrift dazukommen dürfen (Unterschriften, Widerruf, Ersetzung), zählen nicht zur Prüfsumme
const NACHTRAEGE = new Set(["unterschriften", "widerrufenAm", "widerrufenVon", "ersetztAm", "ersetztDurch"]);
/** JSON mit sortierten Feldern: gleiche Daten ergeben immer dieselbe Zeichenkette (auch nach dem Speichern in JSONB). */
function kanonisch(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(kanonisch).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).filter((k) => (v as Record<string, unknown>)[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${kanonisch((v as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(v ?? null);
}
export const pruefsumme = (daten: Record<string, unknown>) =>
  crypto.createHash("sha256").update(kanonisch(Object.fromEntries(Object.entries(daten).filter(([k]) => !NACHTRAEGE.has(k))))).digest("hex");

/** Nur echte PNG-Bilder als data-URL, nicht zu groß. Schutz vor eingeschleustem HTML oder Skript im Unterschriftsfeld. */
export function unterschriftsbildOk(bild: unknown): bild is string {
  if (typeof bild !== "string" || bild.length > MAX_BILD) return false;
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(bild);
  if (!m) return false;
  const roh = Buffer.from(m[1], "base64");
  return roh.length > 200 && roh.subarray(0, 8).equals(PNG);
}

/** Vertragsdokumente zu einem Angebot (legt sie an, falls es sie noch nicht gibt). */
export async function vertragsunterlagen(angebotId: number) {
  const db = await getDb();
  const [a] = await db.select().from(schema.angebote).where(eq(schema.angebote.id, angebotId));
  if (!a) throw new Error("Angebot nicht gefunden");
  const vorhanden = (await db.select().from(schema.dokumente).where(and(eq(schema.dokumente.betriebId, a.betriebId), inArray(schema.dokumente.art, [...VERTRAGSARTEN])))).filter(
    (d) => (d.daten as { angebotId?: number }).angebotId === angebotId,
  );
  if (vorhanden.length) {
    // Angebot nach dem Anlegen geändert und noch nichts unterschrieben: Unterlagen neu aufbauen, sonst passt der Vertrag nicht zur Rechnung
    const rahmen = vorhanden.find((d) => d.art === "rahmenvertrag")?.daten as { einmalig?: number; monatlich?: number; positionen?: unknown } | undefined;
    const passt = rahmen && rahmen.einmalig === a.einmalig && rahmen.monatlich === a.monatlich && JSON.stringify(rahmen.positionen) === JSON.stringify(a.positionen);
    const unterschrieben = vorhanden.some((d) => ((d.daten as { unterschriften?: unknown[] }).unterschriften ?? []).length > 0);
    if (passt || unterschrieben) return sortiert(vorhanden);
    await db.delete(schema.dokumente).where(inArray(schema.dokumente.id, vorhanden.map((d) => d.id)));
    await protokolliere("Levarex OS", "Vertragsunterlagen neu angelegt (Angebot wurde geändert)", a.betriebId);
  }

  const b = await betrieb(a.betriebId);
  const jahr = a.erstelltAm.getFullYear();
  const angebotNummer = `A-${nr(jahr, a.id)}`;
  const rahmenNummer = `RV-${nr(jahr, a.id)}`;
  // Eingefrorene Texte aus dem Angebots-PDF (Problem, fünf Punkte je Baustein)
  const angebotDok = (await db.select().from(schema.dokumente).where(and(eq(schema.dokumente.betriebId, a.betriebId), eq(schema.dokumente.art, "angebot")))).find(
    (d) => (d.daten as AngebotDaten).nummer === angebotNummer,
  );
  const ad = (angebotDok?.daten ?? {}) as Partial<AngebotDaten>;
  const paket = PAKETE[a.paket as PaketKey];
  const basis = { an: anschrift(b), angebotNummer, datum: datumDe(), vertragswerk: VERTRAGSWERK_VERSION, agbVersion: AGB_VERSION, angebotId };

  // Bausteine mit Leistungsschein: alle Positionen außer Prozess-Check und Anrechnung
  const positionen = a.positionen.filter((p) => !/^Prozess-Check|^Anrechnung/.test(p.text));
  const scheine: Omit<LeistungsscheinDaten, "nummer" | "rahmenNummer" | keyof typeof basis>[] = [];
  positionen.forEach((pos, i) => {
    const istWeb = i === 0;
    const info = istWeb
      ? { problem: ad.paketProblem ?? paket?.problem, punkte: ad.paketInhalt ?? paket?.inhalt ?? [] }
      : (ad.bausteine ?? []).find((x) => pos.text.startsWith(x.name)) ?? { problem: undefined, punkte: [pos.text] };
    const name = pos.text.replace(/ \(Pilotpreis\)$/, "");
    const modulKey = a.module.find((k) => name.toLowerCase().startsWith(k.slice(0, 5)));
    const stunden = istWeb ? (ZIEL_STUNDEN[a.paket] ?? 0) : modulKey ? (ZIEL_STUNDEN_MODULE[modulKey] ?? 0) : 0;
    if (pos.einmalig > 0)
      scheine.push({ art: "erstellung", baustein: name, problem: info.problem, punkte: info.punkte, preis: pos.einmalig, wochen: istWeb ? (ad.wochen ?? paket?.wochen) : undefined, kalkulation: { stunden, stundensatz: AENDERUNG_STUNDENSATZ } });
    if (pos.monatlich > 0)
      scheine.push({ art: "betrieb", baustein: name, problem: info.problem, punkte: info.punkte, preis: pos.monatlich, aenderungsMinuten: istWeb ? AENDERUNGS_MINUTEN[a.paket as PaketKey] : undefined });
  });

  const scheinNummern = scheine.map((s, i) => ({ nummer: `LS-${nr(jahr, a.id)}-${String(i + 1).padStart(2, "0")}`, titel: `Leistungsschein ${s.art === "erstellung" ? "Erstellung" : "Betrieb"}: ${s.baustein}` }));
  const rahmen: RahmenvertragDaten & { angebotId: number } = { ...basis, nummer: rahmenNummer, positionen: a.positionen, einmalig: a.einmalig, monatlich: a.monatlich, scheine: scheinNummern };
  await neuesDokument({ betriebId: b.id, art: "rahmenvertrag", titel: `Rahmenvertrag ${rahmenNummer}`, daten: rahmen });
  for (const [i, s] of scheine.entries()) {
    await neuesDokument({ betriebId: b.id, art: `leistungsschein_${s.art}`, titel: scheinNummern[i].titel, daten: { ...basis, ...s, nummer: scheinNummern[i].nummer, rahmenNummer } });
  }
  // AV-Vertrag: Über die Website kommen Anfragen mit personenbezogenen Daten ins Portal, also immer (Rahmenvertrag § 7)
  const { DIENSTLEISTER } = await import("../datenschutz-doku");
  const unterauftrag = DIENSTLEISTER.filter((x) => x.av && (x.aktivWenn === "immer" || !!process.env[x.aktivWenn])).map(({ name, wofuer, sitz }) => ({ name, wofuer, sitz }));
  const kundenmanagement = a.module.includes("kundenmanagement");
  await neuesDokument({ betriebId: b.id, art: "av_vertrag", titel: `AV-Vertrag AV-${nr(jahr, a.id)}`, daten: { ...basis, nummer: `AV-${nr(jahr, a.id)}`, rahmenNummer, bausteine: positionen.map((x) => x.text.replace(/ \(Pilotpreis\)$/, "")), kundenmanagement, unterauftrag } });
  // Pilotpreis Kundenmanagement: eigene Vereinbarung (Referenz, Messung, Nachzahlung bei früher Kündigung)
  const pilotPos = a.positionen.find((x) => / \(Pilotpreis\)$/.test(x.text));
  const km = MODULE.find((m) => m.key === "kundenmanagement");
  if (pilotPos && km) await neuesDokument({ betriebId: b.id, art: "pilotvereinbarung", titel: `Pilotvereinbarung PV-${nr(jahr, a.id)}`, daten: { ...basis, nummer: `PV-${nr(jahr, a.id)}`, rahmenNummer, regulaer: km.einmalig, pilot: pilotPos.einmalig } });
  await protokolliere("Levarex OS", `Vertragsunterlagen ${rahmenNummer} angelegt (${scheine.length} Leistungsscheine, AV-Vertrag${pilotPos ? ", Pilotvereinbarung" : ""})`, b.id);
  return vertragsunterlagen(angebotId);
}

function sortiert<T extends { art: string; id: number }>(d: T[]): T[] {
  return [...d].sort((x, y) => (x.art === "rahmenvertrag" ? -1 : y.art === "rahmenvertrag" ? 1 : x.id - y.id));
}

export type UnterschriftEingabe = {
  angebotId: number;
  kunde: { name: string; funktion?: string; unternehmer: boolean };
  bilder: Record<number, string>; // Dokument-ID → Unterschrift des Kunden
  levarex: { name: string; bild: string };
  wer: string; // angemeldeter Benutzer, der das Tablet bedient
  // SEPA-Lastschriftmandat für die Monatsbeiträge, freiwillig im selben Termin (sonst später im Kundenportal)
  mandat?: { kontoinhaber: string; iban: string; bic?: string; bild: string } | null;
};

/** Unterschriften vom Tablet speichern, in die Verträge übernehmen und den Auftrag auslösen. */
export async function vertragUnterschreiben(e: UnterschriftEingabe): Promise<{ dokumente: number[] }> {
  const db = await getDb();
  const [a] = await db.select().from(schema.angebote).where(eq(schema.angebote.id, e.angebotId));
  if (!a) throw new Error("Angebot nicht gefunden");
  if (!["entwurf", "versendet"].includes(a.status)) throw new Error(`Angebot hat Status „${a.status}“ und kann nicht mehr unterschrieben werden.`);
  const name = e.kunde.name.trim();
  if (name.length < 3) throw new Error("Bitte den vollständigen Namen der Person eintragen, die unterschreibt.");
  if (!e.kunde.unternehmer) throw new Error("Bitte bestätigen, dass der Auftrag für den Betrieb erteilt wird (§ 14 BGB).");
  if (!e.levarex.name.trim() || !unterschriftsbildOk(e.levarex.bild)) throw new Error("Unterschrift für Levarex fehlt.");
  const doks = await vertragsunterlagen(e.angebotId);
  const fehlt = doks.filter((d) => !unterschriftsbildOk(e.bilder[d.id]));
  if (fehlt.length) throw new Error(`Unterschrift fehlt: ${fehlt.map((d) => d.titel).join(", ")}`);
  // Mandat vorab prüfen, damit nichts halb gespeichert wird
  const { mandatPruefen, mandatErteilen } = await import("./mandat");
  const mandat = e.mandat && a.monatlich > 0 ? { ...e.mandat, name } : null;
  if (mandat) mandatPruefen(mandat);

  const am = new Date();
  for (const d of doks) {
    const daten = d.daten as Record<string, unknown>;
    const summe = pruefsumme(daten);
    const unterschriften: VertragUnterschrift[] = [
      { rolle: "kunde", name, funktion: e.kunde.funktion?.trim() || null, bild: e.bilder[d.id], am: am.toISOString() },
      { rolle: "levarex", name: e.levarex.name.trim(), funktion: "Geschäftsführer", bild: e.levarex.bild, am: am.toISOString() },
    ];
    await db.insert(schema.unterschriften).values(
      unterschriften.map((u) => ({ betriebId: a.betriebId, angebotId: a.id, dokumentId: d.id, rolle: u.rolle, name: u.name, funktion: u.funktion ?? null, bild: u.bild, pruefsumme: summe, erfasstVon: e.wer, am })),
    );
    await db.update(schema.dokumente).set({ daten: { ...daten, unterschriften } }).where(eq(schema.dokumente.id, d.id));
  }
  // Noch nicht versendete Angebots-Mail ist überholt: die Unterlagen gehen mit der Auftragsbestätigung raus
  const offen = (await db.select().from(schema.postausgang).where(and(eq(schema.postausgang.betriebId, a.betriebId), eq(schema.postausgang.zweck, "angebot"), eq(schema.postausgang.status, "zur_freigabe")))).filter(
    (p) => Number(p.meta.angebotId) === a.id,
  );
  for (const p of offen) await db.update(schema.postausgang).set({ status: "abgelehnt", ablehnGrund: "Vor Ort unterschrieben; Unterlagen gehen mit der Auftragsbestätigung raus" }).where(eq(schema.postausgang.id, p.id));
  const angebotDok = offen.flatMap((p) => p.anhaenge);

  await protokolliere(e.wer, `Verträge unterschrieben auf dem Tablet: ${name} (${doks.length} Dokumente)`, a.betriebId);
  const mandatId = mandat ? await mandatErteilen({ ...mandat, betriebId: a.betriebId, angebotId: a.id, wer: `${e.wer} (Tablet)` }) : null;
  const unterlagen = [...doks.map((d) => d.id), ...(mandatId ? [mandatId] : [])];
  await unterschriftEingegangen(a.id, `${name} (Unterschrift auf dem Tablet, erfasst von ${e.wer})`, { name, am: am.toISOString(), agbVersion: AGB_VERSION, unternehmer: true }, [...angebotDok, ...unterlagen]);
  return { dokumente: unterlagen };
}
