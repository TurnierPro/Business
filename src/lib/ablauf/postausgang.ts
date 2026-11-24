import { TECHNIK } from "./crm";
import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "../db";
import { einreihen } from "../jobs/warteschlange";
import { protokolliere } from "../protokoll";
import { sendeMail } from "../adapters/mail";
import { sendeBrief } from "../adapters/post";
import { sendeWhatsApp, telefonNormal } from "../adapters/whatsapp";
import { qontoEcht } from "../adapters/qonto";
import { dokumentPdf } from "../docs/render";
import { archivieren } from "../docs/archiv";
import { pruefeText, schreibe, jsonAus } from "../adapters/ki";
import { pruefeSeite } from "../sites/qualitaet";
import { sperrSchluessel } from "./gemeinsam";
import { nachVersand } from "./folgen";
import { mailSignatur, VERTRAGSWERK_VERSION } from "../recht";
import { mailHtml } from "../docs/mailvorlage";

// Der Postausgang ist die einzige Tür nach draußen.
// Regel 1: Versendet wird nur, was den Status „freigegeben“ hat und genug Freigaben trägt.
// Regel 2: Betriebe auf der Sperrliste bekommen nie wieder etwas, auch nicht nach Freigabe.

export type NeuerEintrag = {
  betriebId?: number | null;
  projektId?: number | null;
  kanal: "mail" | "brief" | "whatsapp" | "livegang" | "lastschrift";
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
  await protokolliere("Levarex OS", `Erstellt, Qualitätskontrolle läuft: ${e.betreff}`, e.betriebId);
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

/** Protokoll im Anhang von Hand ausfüllen (z. B. ohne KI-Auswertung). Setzt Freigaben zurück und prüft neu. */
export async function protokollAusfuellen(id: number, dokumentId: number, o: { ziele: string[]; probleme: string[] }, wer: string): Promise<void> {
  const e = await eintrag(id);
  if (e.status !== "zur_freigabe" || !e.anhaenge.includes(dokumentId)) throw new Error("Nur Anhänge von Einträgen, die auf Freigabe warten.");
  const ziele = o.ziele.map((x) => x.trim()).filter(Boolean).slice(0, 10);
  const probleme = o.probleme.map((x) => x.trim()).filter(Boolean).slice(0, 10);
  if (!ziele.length || !probleme.length) throw new Error("Bitte mindestens ein Ziel und ein Problem eintragen (je Zeile eins).");
  const db = await getDb();
  const [d] = await db.select().from(schema.dokumente).where(eq(schema.dokumente.id, dokumentId));
  if (d?.art !== "protokoll") throw new Error("Kein Protokoll");
  const { unvollstaendig: _u, ...rest } = d.daten as Record<string, unknown>;
  await db.update(schema.dokumente).set({ daten: { ...rest, ziele, probleme } }).where(eq(schema.dokumente.id, d.id));
  await db.update(schema.postausgang).set({ freigaben: [], qkStatus: "ausstehend", qkAm: null }).where(eq(schema.postausgang.id, id));
  await protokolliere(wer, "Protokoll von Hand ergänzt", e.betriebId);
  await einreihen("qualitaetskontrolle", { eintragId: id });
}

/** Anhang aus einem wartenden Eintrag nehmen (z. B. unvollständiges Protokoll). Das Angebot selbst bleibt immer dran. */
export async function anhangEntfernen(id: number, dokumentId: number, wer: string): Promise<void> {
  const e = await eintrag(id);
  if (e.status !== "zur_freigabe") throw new Error("Nur bei Einträgen, die auf Freigabe warten.");
  const db = await getDb();
  const [d] = await db.select().from(schema.dokumente).where(eq(schema.dokumente.id, dokumentId));
  if (!d || !e.anhaenge.includes(dokumentId)) throw new Error("Dieser Anhang gehört nicht zu diesem Eintrag.");
  if (d.art !== "protokoll") throw new Error("Nur das Gesprächsprotokoll lässt sich weglassen; alle anderen Unterlagen gehören fest dazu.");
  await db.update(schema.postausgang).set({ anhaenge: e.anhaenge.filter((x) => x !== dokumentId), freigaben: [], qkStatus: "ausstehend", qkAm: null, text: e.zweck === "angebot" ? e.text.replace("das Protokoll mit Maßnahmenplan und das Angebot", "das Angebot") : e.text }).where(eq(schema.postausgang.id, id));
  await protokolliere(wer, `Anhang entfernt: ${d.titel}`, e.betriebId);
  await einreihen("qualitaetskontrolle", { eintragId: id });
}

// ---------- Testbetrieb (TESTPHASE=ja) ----------
// Für den Ende-zu-Ende-Test auf dem echten Server: Mails gehen nur an interne Adressen (Standard @levarex-consulting.de,
// weitere mit TESTPHASE_DOMAINS, kommagetrennt). Briefe und WhatsApp gehen gar nicht raus. Platzhalter in den
// Pflichtangaben (IBAN) sind dann nur ein Hinweis. Vor dem ersten echten Kunden TESTPHASE entfernen.
export const testbetrieb = () => process.env.TESTPHASE === "ja";
export const testDomains = () => (process.env.TESTPHASE_DOMAINS ?? "levarex-consulting.de").split(",").map((d) => d.trim().toLowerCase().replace(/^@/, "")).filter(Boolean);

/** Grund, warum dieser Eintrag im Testbetrieb nicht raus darf, sonst null. */
export function testbetriebVerbietet(e: { kanal: string; empfaenger: string }): string | null {
  if (!testbetrieb()) return null;
  if (e.kanal === "brief" || e.kanal === "whatsapp") return `Testbetrieb: ${e.kanal === "brief" ? "Briefe" : "WhatsApp"} gehen nicht raus.`;
  if (e.kanal === "mail") {
    const domain = e.empfaenger.trim().toLowerCase().split("@")[1] ?? "";
    if (!testDomains().includes(domain)) return `Testbetrieb: Mails nur an interne Adressen (@${testDomains().join(", @")}). Empfänger „${e.empfaenger}“ bitte ändern.`;
  }
  return null;
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
  if (e.kanal === "whatsapp") {
    const { whatsappFensterOffen } = await import("./nachrichten");
    if (!telefonNormal(e.empfaenger)) blocker.push("Keine gültige Handynummer beim Empfänger.");
    else if (!(await whatsappFensterOffen(e.empfaenger))) blocker.push("WhatsApp nur als Antwort: Der Kunde hat in den letzten 24 Stunden nicht geschrieben. Bitte per E-Mail antworten.");
    if (e.text.length > 4000) blocker.push("Zu lang für WhatsApp (höchstens 4000 Zeichen).");
  }
  const nurIntern = e.kanal === "livegang" || e.kanal === "lastschrift";
  if (!nurIntern) hinweise.push(...pruefeText(e.text, (e.meta.erlaubteZahlen as string[]) ?? []));
  if (e.text.trim().length < 20 && !nurIntern) blocker.push("Der Text ist leer oder zu kurz.");
  if (e.kanal === "lastschrift") {
    if (e.zweck === "lastschrift_start" && !MAIL.test(e.empfaenger.trim())) blocker.push("Keine gültige E-Mail-Adresse: Qonto schickt dem Kunden den Link zum SEPA-Mandat per E-Mail.");
    if (e.zweck === "lastschrift_start" && !(Number(e.meta.monatlichBrutto) > 0)) blocker.push("Betrag fehlt.");
    if (!qontoEcht()) hinweise.push("Qonto läuft im Simulator: Es wird kein echtes Geld eingezogen.");
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
    if (["rahmenvertrag", "leistungsschein_erstellung", "leistungsschein_betrieb", "av_vertrag", "pilotvereinbarung"].includes(d.art)) {
      const u = (d.daten as { unterschriften?: { rolle: string }[] }).unterschriften ?? [];
      if (!u.some((x) => x.rolle === "kunde") || !u.some((x) => x.rolle === "levarex")) blocker.push(`${d.titel}: Unterschrift fehlt.`);
      if (VERTRAGSWERK_VERSION.startsWith("Entwurf")) hinweise.push("Vertragstexte sind noch ein Entwurf (Dok. 21 fehlt). Vor dem ersten echten Kunden vom Anwalt prüfen lassen.");
    }
    if (d.art === "sepa_mandat" && !((d.daten as { unterschriften?: { rolle: string }[] }).unterschriften ?? []).some((x) => x.rolle === "kunde")) blocker.push(`${d.titel}: Unterschrift fehlt.`);
    if (d.art === "protokoll" && (d.daten as { unvollstaendig?: boolean }).unvollstaendig) blocker.push(`${d.titel}: Ziele und Probleme fehlen (keine KI-Auswertung). Protokoll ausfüllen oder den Anhang entfernen.`);
    if (d.art === "angebot" && e.kanal === "mail") {
      const an = (d.daten as { an?: { strasse?: string | null; plz?: string | null } }).an;
      if (!an?.strasse || !an?.plz) hinweise.push(`${d.titel}: Anschrift unvollständig. Bitte Straße und PLZ beim Betrieb ergänzen.`);
    }
    const an = (d.daten as { an?: { strasse?: string | null; plz?: string | null } }).an;
    if (e.kanal === "brief" && (!an?.strasse || !an?.plz)) blocker.push("Anschrift im Brief unvollständig.");
  }
  // Platzhalter in Pflichtangaben und Links: auf dem eigenen Rechner nur ein Hinweis, auf dem Server eine Sperre
  if (!nurIntern) {
    const { marke } = await import("../marke");
    const produktiv = (process.env.BASE_URL ?? "").startsWith("https://");
    const platzhalter: string[] = [];
    if (doks.length && /^DE00\s?0000/.test(marke.absender.iban)) platzhalter.push("IBAN im Fuß der PDFs ist noch ein Platzhalter (brand/tokens.json)");
    if (/https?:\/\/(localhost|127\.0\.0\.1)/.test(e.text)) platzhalter.push("Link zeigt auf localhost: BASE_URL ist nicht gesetzt");
    // Im Testbetrieb (nur interne Empfänger) reicht ein Hinweis, sonst sperrt der Platzhalter auf dem Server
    for (const x of platzhalter) (produktiv && !testbetrieb() ? blocker : hinweise).push(`${x}.`);
  }
  const testFehler = testbetriebVerbietet(e);
  if (testFehler) blocker.push(testFehler);
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
        "Du bist die Qualitätskontrolle von Levarex. Prüfe den Text auf: Verstöße gegen die Levarex-Stimme, erfundene Fakten oder Zahlen, falsche Anrede, Tippfehler, unklare nächste Schritte, rechtlich heikle Aussagen (Garantien, Druck). Antworte nur mit einem JSON-Array von höchstens 5 kurzen deutschen Sätzen. Leeres Array, wenn alles in Ordnung ist.",
      daten: { kanal: e.kanal, zweck: e.zweck, empfaenger: e.empfaenger, betreff: e.betreff, text: e.text, erlaubteZahlen: e.meta.erlaubteZahlen ?? [] },
      ersatz: "[]",
    });
    hinweise.push(...jsonAus<string[]>(ki.text, []).filter((x) => typeof x === "string").map((x) => `KI-Prüfer: ${x}`));
  }

  // Doppelte Hinweise (z. B. je Anhang derselbe) nur einmal; gezählt wird die bereinigte Liste
  const alle = [...new Set([...blocker.map((b) => `Blockiert: ${b}`), ...hinweise])];
  const anzahlHinweise = new Set(hinweise).size;
  const qkStatus = blocker.length ? "blockiert" : hinweise.length ? "hinweise" : "bestanden";
  await db.update(schema.postausgang).set({ hinweise: [...new Set(alle)], qkStatus, qkAm: new Date() }).where(eq(schema.postausgang.id, id));
  await protokolliere("Qualitätskontrolle", `${qkStatus === "bestanden" ? "Bestanden" : qkStatus === "hinweise" ? `${anzahlHinweise} ${anzahlHinweise === 1 ? "Hinweis" : "Hinweise"}` : "Blockiert"}: ${e.betreff}`, e.betriebId);
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
  if (e.kanal === "whatsapp" && !telefonNormal(e.empfaenger)) throw new Error("Keine gültige Handynummer beim Empfänger.");
  // Livegang: Festlegung "nur durch Maximilian mit zweitem Faktor" (Code prüft die Aktion vorher)
  if (e.kanal === "livegang" && wer !== TECHNIK) throw new Error(`Den Livegang gibt nur ${TECHNIK} frei.`);
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
  // Folgen der Ablehnung: Beiträge werden wieder bearbeitbar
  if (e.zweck === "beitraege_vorlage" && Array.isArray(e.meta.beitragIds)) {
    await db.update(schema.beitraege).set({ status: "entwurf", eintragId: null }).where(and(inArray(schema.beitraege.id, (e.meta.beitragIds as unknown[]).map(Number)), eq(schema.beitraege.status, "zur_vorlage")));
  }
  // Eine abgelehnte Angebots-Mail lässt das Angebot bewusst im Entwurf: Unterschrieben werden kann es weiter beim Termin auf dem Tablet.
}

/** Der einzige Ort, an dem etwas nach draußen geht. Jeder Fehler wird am Eintrag festgehalten (sichtbar in den Freigaben). */
export async function versende(id: number): Promise<string> {
  try {
    return await versendeIntern(id);
  } catch (err) {
    const db = await getDb();
    await db.update(schema.postausgang).set({ fehler: (err instanceof Error ? err.message : String(err)).slice(0, 500) }).where(and(eq(schema.postausgang.id, id), eq(schema.postausgang.status, "freigegeben")));
    throw err;
  }
}

async function versendeIntern(id: number): Promise<string> {
  const e = await eintrag(id);
  if (e.status !== "freigegeben") throw new Error(`Versand verweigert: Status ist „${e.status}“, nicht „freigegeben“.`);
  // Zweite Sicherung neben der Qualitätskontrolle: im Testbetrieb nie an fremde Empfänger
  const testFehler = testbetriebVerbietet(e);
  if (testFehler) throw new Error(`Versand verweigert: ${testFehler}`);
  if (e.freigaben.length < e.noetigeFreigaben) throw new Error("Versand verweigert: Es fehlen Freigaben.");
  if (await istGesperrt(e.betriebId)) {
    const db = await getDb();
    await db.update(schema.postausgang).set({ status: "abgelehnt", ablehnGrund: "Sperrliste" }).where(eq(schema.postausgang.id, id));
    await protokolliere("Levarex OS", `Nicht versendet (Sperrliste): ${e.betreff}`, e.betriebId);
    return "Nicht versendet: Betrieb steht auf der Sperrliste"; // kein Fehler, damit der Job nicht wiederholt wird
  }
  if (e.zweck === "akquise_brief" && process.env.BRIEFDIENST_API_KEY && process.env.AKQUISE_FREIGESCHALTET !== "ja") {
    throw new Error("Versand verweigert: Akquise ist noch nicht freigeschaltet (AKQUISE_FREIGESCHALTET=ja erst nach Notartermin).");
  }
  const db = await getDb();
  const doks = e.anhaenge.length ? await db.select().from(schema.dokumente).where(inArray(schema.dokumente.id, e.anhaenge)) : [];
  let ergebnis = "";
  let externeId: string | null = null;
  try {
  if (e.kanal === "brief") {
    const d = doks[0];
    if (!d) throw new Error("Brief ohne Dokument");
    ergebnis = await sendeBrief({ an: e.empfaenger, betreff: e.betreff, pdf: await archivieren(d), dateiname: `brief-${e.id}.pdf` });
  } else if (e.kanal === "mail") {
    // Rechnungen: mit Lexware endgültig dort anlegen; Lexware vergibt die Nummer, die in Betreff und Text nachgezogen wird
    const { rechnungNachLexware } = await import("./geld");
    for (const d of doks) {
      const n = await rechnungNachLexware(d);
      if (!n) continue;
      e.betreff = e.betreff.split(n.alt).join(n.neu);
      e.text = e.text.split(n.alt).join(n.neu);
      // Auch die Nummer im Eintrag nachziehen, sonst findet das Kundenportal die Rechnung nicht mehr
      if (e.meta.rechnungsnummer === n.alt) e.meta = { ...e.meta, rechnungsnummer: n.neu };
      await db.update(schema.postausgang).set({ betreff: e.betreff, text: e.text, meta: e.meta }).where(eq(schema.postausgang.id, e.id));
    }
    const frisch = doks.length ? await db.select().from(schema.dokumente).where(inArray(schema.dokumente.id, e.anhaenge)) : [];
    // Genau die versendeten PDFs werden eingefroren und liegen danach unverändert im Kundenportal
    // In der Reihenfolge der Anhänge im Eintrag (Hauptdokument zuerst), nicht in der Reihenfolge der Datenbank
    frisch.sort((x, y) => e.anhaenge.indexOf(x.id) - e.anhaenge.indexOf(y.id));
    const anhaenge = await Promise.all(frisch.map(async (d) => ({ name: `${d.titel}.pdf`, inhalt: await archivieren(d) })));
    // Pflichtangaben nach § 35a GmbHG hängen an jeder Mail
    // Immer zwei Fassungen: Nur-Text (mit Signatur) und HTML im Levarex-Design
    ergebnis = await sendeMail({ an: e.empfaenger, betreff: e.betreff, text: e.text + mailSignatur(), html: mailHtml({ betreff: e.betreff, text: e.text }), anhaenge });
  } else if (e.kanal === "whatsapp") {
    // Das 24-Stunden-Fenster kann sich seit der Qualitätskontrolle geschlossen haben
    const { whatsappFensterOffen } = await import("./nachrichten");
    if (!(await whatsappFensterOffen(e.empfaenger))) throw new Error("Versand verweigert: WhatsApp-Fenster (24 Stunden) ist geschlossen. Bitte per E-Mail antworten.");
    ({ ergebnis, externeId } = await sendeWhatsApp({ an: e.empfaenger, text: e.text }));
  } else if (e.kanal === "lastschrift") {
    const { lastschriftAusfuehren } = await import("./geld");
    ergebnis = await lastschriftAusfuehren(e);
  } else {
    ergebnis = "Livegang freigegeben";
  }
  } catch (err) {
    // Fehler am Eintrag festhalten, damit er in den Freigaben sichtbar ist (der Job versucht es noch einmal)
    await db.update(schema.postausgang).set({ fehler: (err instanceof Error ? err.message : String(err)).slice(0, 500) }).where(eq(schema.postausgang.id, id));
    throw err;
  }
  await db.update(schema.postausgang).set({ status: "versendet", versendetAm: new Date(), fehler: null }).where(and(eq(schema.postausgang.id, id), eq(schema.postausgang.status, "freigegeben")));
  await protokolliere("Levarex OS", `Versendet (${e.kanal}): ${e.betreff}`, e.betriebId, ergebnis);
  await (await import("./nachrichten")).ausgangFesthalten(e, externeId);
  await nachVersand(e);
  return ergebnis;
}
