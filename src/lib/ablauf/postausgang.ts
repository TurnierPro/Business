import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "../db";
import { einreihen } from "../jobs/warteschlange";
import { protokolliere } from "../protokoll";
import { sendeMail } from "../adapters/mail";
import { sendeBrief } from "../adapters/post";
import { dokumentPdf } from "../docs/render";
import { archivieren } from "../docs/archiv";
import { pruefeText, schreibe, jsonAus } from "../adapters/ki";
import { pruefeSeite } from "../sites/qualitaet";
import { sperrSchluessel } from "./gemeinsam";
import { nachVersand } from "./folgen";
import { mailSignatur } from "../recht";

// Der Postausgang ist die einzige Tür nach draußen.
// Regel 1: Versendet wird nur, was den Status „freigegeben“ hat und genug Freigaben trägt.
// Regel 2: Betriebe auf der Sperrliste bekommen nie wieder etwas, auch nicht nach Freigabe.

export type NeuerEintrag = {
  betriebId?: number | null;
  projektId?: number | null;
  kanal: "mail" | "brief" | "livegang" | "zahlung";
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
      hinweise: e.hinweise ?? [],
      meta: { ...(e.meta ?? {}), vorab: e.hinweise ?? [], erlaubteZahlen: e.erlaubteZahlen ?? [] },
    })
    .returning({ id: schema.postausgang.id });
  await protokolliere("Stelax OS", `Erstellt, Qualitätskontrolle läuft: ${e.betreff}`, e.betriebId);
  await einreihen("qualitaetskontrolle", { eintragId: neu.id });
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
  await db.update(schema.postausgang).set({ betreff, text, freigaben: [], qkStatus: "ausstehend", qkAm: null }).where(eq(schema.postausgang.id, id));
  if (e.kanal === "brief" && e.anhaenge[0]) {
    const [d] = await db.select().from(schema.dokumente).where(eq(schema.dokumente.id, e.anhaenge[0]));
    if (d) await db.update(schema.dokumente).set({ daten: { ...(d.daten as object), betreff, text } }).where(eq(schema.dokumente.id, d.id));
  }
  await protokolliere(wer, `Bearbeitet: ${betreff}`, e.betriebId);
  await einreihen("qualitaetskontrolle", { eintragId: id });
}

const MAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Qualitätskontrolle: läuft nach jedem Erstellen und jeder Änderung, bevor ihr freigeben könnt.
 * Regeln (Adresse, Anhänge, Zahlen, Stimme, Website-Prüfung) und, wenn eingerichtet, ein KI-Prüfer.
 * Ergebnis: bestanden, hinweise (freigeben möglich, bitte lesen) oder blockiert (erst beheben).
 */
export async function qualitaetskontrolle(id: number): Promise<string> {
  const e = await eintrag(id);
  if (e.status !== "zur_freigabe") return "Nicht mehr offen";
  const db = await getDb();
  const hinweise: string[] = [...((e.meta.vorab as string[]) ?? [])];
  const blocker: string[] = [];

  if (await istGesperrt(e.betriebId)) blocker.push("Betrieb steht auf der Sperrliste.");
  if (e.kanal === "mail" && !MAIL.test(e.empfaenger.trim())) blocker.push("Keine gültige E-Mail-Adresse beim Empfänger.");
  const nurIntern = e.kanal === "livegang" || e.kanal === "zahlung";
  if (!nurIntern) hinweise.push(...pruefeText(e.text, (e.meta.erlaubteZahlen as string[]) ?? []));
  if (e.text.trim().length < 20 && !nurIntern) blocker.push("Der Text ist leer oder zu kurz.");
  if (e.kanal === "zahlung") {
    const [b] = e.betriebId ? await db.select().from(schema.betriebe).where(eq(schema.betriebe.id, e.betriebId)) : [];
    if (!b?.stripeKundeId || !b?.stripeZahlart) blocker.push("Keine gespeicherte Zahlungsart bei Stripe. Kunde muss zuerst die Anzahlung online bezahlt haben.");
    if (e.zweck === "schlusszahlung" && !(Number(e.meta.netto) > 0)) blocker.push("Betrag fehlt.");
    if (!process.env.STRIPE_SECRET_KEY) hinweise.push("Stripe läuft im Simulator: Es wird kein echtes Geld bewegt.");
  }

  const doks = e.anhaenge.length ? await db.select().from(schema.dokumente).where(inArray(schema.dokumente.id, e.anhaenge)) : [];
  if (doks.length !== e.anhaenge.length) blocker.push("Ein Anhang fehlt.");
  for (const d of doks) {
    try {
      const pdf = await dokumentPdf(d);
      if (pdf.length < 1000) blocker.push(`${d.titel}: PDF ist leer.`);
    } catch (err) {
      blocker.push(`${d.titel}: PDF lässt sich nicht erzeugen (${err instanceof Error ? err.message : err}).`);
    }
    const an = (d.daten as { an?: { strasse?: string | null; plz?: string | null } }).an;
    if (e.kanal === "brief" && (!an?.strasse || !an?.plz)) blocker.push("Anschrift im Brief unvollständig.");
  }
  if (e.kanal === "livegang" && typeof e.meta.slug === "string") {
    const fehler = pruefeSeite(e.meta.slug).filter((x) => !x.ok);
    for (const f of fehler) blocker.push(`Website-Prüfung „${f.name}“: ${f.detail}`);
  }

  // KI-Prüfer (zweites Paar Augen), nur wenn Claude eingerichtet ist
  if (!nurIntern) {
    const ki = await schreibe({
      zweck: "qualitaetskontrolle",
      modell: "schnell",
      betriebId: e.betriebId,
      aufgabe:
        "Du bist die Qualitätskontrolle von Stelax. Prüfe den Text auf: Verstöße gegen die Stelax-Stimme, erfundene Fakten oder Zahlen, falsche Anrede, Tippfehler, unklare nächste Schritte, rechtlich heikle Aussagen (Garantien, Druck). Antworte nur mit einem JSON-Array von höchstens 5 kurzen deutschen Sätzen. Leeres Array, wenn alles in Ordnung ist.",
      daten: { kanal: e.kanal, zweck: e.zweck, empfaenger: e.empfaenger, betreff: e.betreff, text: e.text, erlaubteZahlen: e.meta.erlaubteZahlen ?? [] },
      ersatz: "[]",
    });
    hinweise.push(...jsonAus<string[]>(ki.text, []).filter((x) => typeof x === "string").map((x) => `KI-Prüfer: ${x}`));
  }

  const alle = [...blocker.map((b) => `Blockiert: ${b}`), ...hinweise];
  const qkStatus = blocker.length ? "blockiert" : hinweise.length ? "hinweise" : "bestanden";
  await db.update(schema.postausgang).set({ hinweise: [...new Set(alle)], qkStatus, qkAm: new Date() }).where(eq(schema.postausgang.id, id));
  await protokolliere("Qualitätskontrolle", `${qkStatus === "bestanden" ? "Bestanden" : qkStatus === "hinweise" ? `${hinweise.length} Hinweise` : "Blockiert"}: ${e.betreff}`, e.betriebId);
  return qkStatus;
}

export async function freigeben(id: number, wer: string): Promise<"freigegeben" | "weitere_freigabe_noetig"> {
  const e = await eintrag(id);
  if (e.status !== "zur_freigabe") throw new Error("Dieser Eintrag wartet nicht auf Freigabe.");
  if (e.freigaben.some((f) => f.name === wer)) throw new Error("Du hast diesen Eintrag schon freigegeben. Die zweite Freigabe muss von der anderen Person kommen.");
  if (await istGesperrt(e.betriebId)) throw new Error("Betrieb steht auf der Sperrliste.");
  if (e.kanal === "mail" && !MAIL.test(e.empfaenger.trim())) {
    throw new Error("Keine gültige E-Mail-Adresse beim Empfänger. Bitte unter „Text ändern“ eintragen.");
  }
  if (e.qkStatus === "ausstehend") throw new Error("Die Qualitätskontrolle läuft noch. In ein paar Sekunden neu laden.");
  if (e.qkStatus === "blockiert") throw new Error("Die Qualitätskontrolle hat Fehler gefunden. Erst beheben, dann freigeben.");
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
    ergebnis = await sendeBrief({ an: e.empfaenger, betreff: e.betreff, pdf: await archivieren(d), dateiname: `brief-${e.id}.pdf` });
  } else if (e.kanal === "mail") {
    // Genau die versendeten PDFs werden eingefroren und liegen danach unverändert im Kundenportal
    const anhaenge = await Promise.all(doks.map(async (d) => ({ name: `${d.titel}.pdf`, inhalt: await archivieren(d) })));
    // Pflichtangaben nach § 35a GmbHG hängen an jeder Mail
    ergebnis = await sendeMail({ an: e.empfaenger, betreff: e.betreff, text: e.text + mailSignatur(), anhaenge });
  } else if (e.kanal === "zahlung") {
    const { fuehreZahlungAus } = await import("./zahlung");
    ergebnis = await fuehreZahlungAus(e);
  } else {
    ergebnis = "Livegang freigegeben";
  }
  await db.update(schema.postausgang).set({ status: "versendet", versendetAm: new Date(), fehler: null }).where(and(eq(schema.postausgang.id, id), eq(schema.postausgang.status, "freigegeben")));
  await protokolliere("Stelax OS", `Versendet (${e.kanal}): ${e.betreff}`, e.betriebId, ergebnis);
  await nachVersand(e);
  return ergebnis;
}
