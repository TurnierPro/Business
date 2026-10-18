import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "../db";
import { einreihen } from "../jobs/warteschlange";
import { protokolliere } from "../protokoll";
import { sendeMail } from "../adapters/mail";
import { sendeBrief } from "../adapters/post";
import { dokumentPdf } from "../docs/render";
import { pruefeText } from "../adapters/ki";
import { sperrSchluessel } from "./gemeinsam";
import { nachVersand } from "./folgen";

// Der Postausgang ist die einzige Tür nach draußen.
// Regel 1: Versendet wird nur, was den Status „freigegeben“ hat und genug Freigaben trägt.
// Regel 2: Betriebe auf der Sperrliste bekommen nie wieder etwas, auch nicht nach Freigabe.

export type NeuerEintrag = {
  betriebId?: number | null;
  projektId?: number | null;
  kanal: "mail" | "brief" | "livegang";
  zweck: string;
  empfaenger: string;
  betreff: string;
  text: string;
  anhaenge?: number[];
  noetigeFreigaben?: number;
  hinweise?: string[];
  erlaubteZahlen?: string[];
  meta?: Record<string, unknown>;
};

export async function istGesperrt(betriebId: number | null | undefined): Promise<boolean> {
  if (!betriebId) return false;
  const db = await getDb();
  const [b] = await db.select().from(schema.betriebe).where(eq(schema.betriebe.id, betriebId));
  if (!b) return false;
  if (b.status === "gesperrt") return true;
  const [s] = await db.select().from(schema.sperrliste).where(eq(schema.sperrliste.schluessel, sperrSchluessel(b.name, b.website)));
  return !!s;
}

export async function inPostausgang(e: NeuerEintrag): Promise<number> {
  if (await istGesperrt(e.betriebId)) throw new Error("Betrieb steht auf der Sperrliste. Es wird nichts erstellt.");
  const db = await getDb();
  const hinweise = [...(e.hinweise ?? []), ...(e.kanal !== "livegang" ? pruefeText(e.text, e.erlaubteZahlen) : [])];
  const [neu] = await db
    .insert(schema.postausgang)
    .values({
      betriebId: e.betriebId ?? null,
      projektId: e.projektId ?? null,
      kanal: e.kanal,
      zweck: e.zweck,
      empfaenger: e.empfaenger,
      betreff: e.betreff,
      text: e.text,
      anhaenge: e.anhaenge ?? [],
      noetigeFreigaben: e.noetigeFreigaben ?? 1,
      hinweise,
      meta: e.meta ?? {},
    })
    .returning({ id: schema.postausgang.id });
  await protokolliere("Stelax OS", `Zur Freigabe: ${e.betreff}`, e.betriebId);
  return neu.id;
}

export async function eintrag(id: number) {
  const db = await getDb();
  const [e] = await db.select().from(schema.postausgang).where(eq(schema.postausgang.id, id));
  if (!e) throw new Error(`Eintrag ${id} nicht gefunden`);
  return e;
}

export async function bearbeiten(id: number, betreff: string, text: string, wer: string): Promise<void> {
  const e = await eintrag(id);
  if (e.status !== "zur_freigabe") throw new Error("Nur Einträge, die auf Freigabe warten, können bearbeitet werden.");
  const db = await getDb();
  // Wer bearbeitet, setzt bisherige Freigaben zurück: Freigegeben wird immer der aktuelle Text.
  await db.update(schema.postausgang).set({ betreff, text, freigaben: [], hinweise: pruefeText(text, (e.meta.erlaubteZahlen as string[]) ?? []) }).where(eq(schema.postausgang.id, id));
  if (e.kanal === "brief" && e.anhaenge[0]) {
    const [d] = await db.select().from(schema.dokumente).where(eq(schema.dokumente.id, e.anhaenge[0]));
    if (d) await db.update(schema.dokumente).set({ daten: { ...(d.daten as object), betreff, text } }).where(eq(schema.dokumente.id, d.id));
  }
  await protokolliere(wer, `Bearbeitet: ${betreff}`, e.betriebId);
}

export async function freigeben(id: number, wer: string): Promise<"freigegeben" | "weitere_freigabe_noetig"> {
  const e = await eintrag(id);
  if (e.status !== "zur_freigabe") throw new Error("Dieser Eintrag wartet nicht auf Freigabe.");
  if (e.freigaben.some((f) => f.name === wer)) throw new Error("Du hast diesen Eintrag schon freigegeben. Die zweite Freigabe muss von der anderen Person kommen.");
  if (await istGesperrt(e.betriebId)) throw new Error("Betrieb steht auf der Sperrliste.");
  const freigaben = [...e.freigaben, { name: wer, am: new Date().toISOString() }];
  const fertig = freigaben.length >= e.noetigeFreigaben;
  const db = await getDb();
  await db.update(schema.postausgang).set({ freigaben, status: fertig ? "freigegeben" : "zur_freigabe" }).where(eq(schema.postausgang.id, id));
  await protokolliere(wer, `Freigegeben (${freigaben.length}/${e.noetigeFreigaben}): ${e.betreff}`, e.betriebId);
  if (fertig) await einreihen("versand", { eintragId: id });
  return fertig ? "freigegeben" : "weitere_freigabe_noetig";
}

export async function ablehnen(id: number, grund: string, wer: string): Promise<void> {
  const e = await eintrag(id);
  if (e.status !== "zur_freigabe") throw new Error("Dieser Eintrag wartet nicht auf Freigabe.");
  const db = await getDb();
  await db.update(schema.postausgang).set({ status: "abgelehnt", ablehnGrund: grund || "ohne Grund" }).where(eq(schema.postausgang.id, id));
  await protokolliere(wer, `Abgelehnt: ${e.betreff}`, e.betriebId, grund);
}

/** Der einzige Ort, an dem etwas nach draußen geht. */
export async function versende(id: number): Promise<string> {
  const e = await eintrag(id);
  if (e.status !== "freigegeben") throw new Error(`Versand verweigert: Status ist „${e.status}“, nicht „freigegeben“.`);
  if (e.freigaben.length < e.noetigeFreigaben) throw new Error("Versand verweigert: Es fehlen Freigaben.");
  if (await istGesperrt(e.betriebId)) {
    const db = await getDb();
    await db.update(schema.postausgang).set({ status: "abgelehnt", ablehnGrund: "Sperrliste" }).where(eq(schema.postausgang.id, id));
    throw new Error("Versand verweigert: Betrieb steht auf der Sperrliste.");
  }
  if (e.zweck === "akquise_brief" && process.env.BRIEFDIENST_API_KEY && process.env.AKQUISE_FREIGESCHALTET !== "ja") {
    throw new Error("Versand verweigert: Akquise ist noch nicht freigeschaltet (AKQUISE_FREIGESCHALTET=ja erst nach Notartermin).");
  }
  const db = await getDb();
  const doks = e.anhaenge.length ? await db.select().from(schema.dokumente).where(inArray(schema.dokumente.id, e.anhaenge)) : [];
  let ergebnis = "";
  if (e.kanal === "brief") {
    const d = doks[0];
    if (!d) throw new Error("Brief ohne Dokument");
    ergebnis = await sendeBrief({ an: e.empfaenger, betreff: e.betreff, pdf: await dokumentPdf(d), dateiname: `brief-${e.id}.pdf` });
  } else if (e.kanal === "mail") {
    const anhaenge = await Promise.all(doks.map(async (d) => ({ name: `${d.titel}.pdf`, inhalt: await dokumentPdf(d) })));
    ergebnis = await sendeMail({ an: e.empfaenger, betreff: e.betreff, text: e.text, anhaenge });
  } else {
    ergebnis = "Livegang freigegeben";
  }
  await db.update(schema.postausgang).set({ status: "versendet", versendetAm: new Date(), fehler: null }).where(and(eq(schema.postausgang.id, id), eq(schema.postausgang.status, "freigegeben")));
  await protokolliere("Stelax OS", `Versendet (${e.kanal}): ${e.betreff}`, e.betriebId, ergebnis);
  await nachVersand(e);
  return ergebnis;
}
