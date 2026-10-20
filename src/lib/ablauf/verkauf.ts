import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { and, eq, max } from "drizzle-orm";
import { getDb, schema } from "../db";
import { einreihen } from "../jobs/warteschlange";
import { protokolliere } from "../protokoll";
import { transkribiere } from "../adapters/transkription";
import { schreibe, jsonAus } from "../adapters/ki";
import { datenOrdner } from "../pfade";
import { portalLink } from "../kundenportal";
import { berechne, type Auswahl } from "../katalog";
import { zahlungUeberStripe, type StripeRechnung } from "../adapters/stripe";
import { datumDe } from "../docs/basis";
import { PAKETE, PaketKey, euro, UST } from "../pakete";
import { AGB_VERSION, ZAHLUNGSZIEL_TAGE } from "../recht";
import type { ProtokollDaten } from "../docs/vorlagen";
import { inPostausgang } from "./postausgang";
import { systemAufgabeErledigt } from "./crm";
import { checklisteSicherstellen } from "./checkliste";
import { anschrift, basisUrl, betrieb, neuesDokument, setzeStatus, SYSTEM } from "./gemeinsam";

// Verkauf: Termin aufnehmen, Protokoll und Angebot, Unterschrift, Anzahlung, Projektstart.

export async function terminAufnehmen(o: { betriebId: number; datei: File; einwilligung: boolean; wer: string }): Promise<number> {
  if (!o.einwilligung) throw new Error("Ohne bestätigte Einwilligung wird nichts aufgenommen oder gespeichert.");
  if (!o.datei || o.datei.size === 0) throw new Error("Keine Aufnahme erhalten.");
  const endung = (o.datei.name.split(".").pop() || "webm").replace(/[^a-z0-9]/gi, "").slice(0, 5);
  const ziel = path.join(datenOrdner("audio"), `termin-${o.betriebId}-${Date.now()}.${endung}`);
  fs.writeFileSync(ziel, Buffer.from(await o.datei.arrayBuffer()));
  const db = await getDb();
  const [t] = await db
    .insert(schema.termine)
    .values({ betriebId: o.betriebId, einwilligung: true, einwilligungAm: new Date(), einwilligungVon: o.wer, audioPfad: ziel })
    .returning({ id: schema.termine.id });
  await setzeStatus(o.betriebId, "termin");
  await systemAufgabeErledigt(o.betriebId, "Besuch vor Ort");
  await protokolliere(o.wer, "Termin aufgenommen (Einwilligung bestätigt)", o.betriebId);
  await einreihen("transkription", { terminId: t.id });
  return t.id;
}

export async function transkription(terminId: number): Promise<string> {
  const db = await getDb();
  const [t] = await db.select().from(schema.termine).where(eq(schema.termine.id, terminId));
  if (!t?.audioPfad) throw new Error("Termin ohne Aufnahme");
  const b = await betrieb(t.betriebId);
  const { text, simuliert } = await transkribiere(t.audioPfad, b);
  await db.update(schema.termine).set({ transkript: text, status: "transkribiert" }).where(eq(schema.termine.id, terminId));
  await einreihen("auswertung", { terminId });
  return simuliert ? "Simulator-Transkript" : "Transkribiert";
}

type Auswertung = Omit<ProtokollDaten, "an" | "datum"> & { einleitung: string };

function ersatzAuswertung(b: { name: string; gewerk: string; mitarbeiter: number | null }): Auswertung {
  const paket: PaketKey = b.gewerk === "Kfz" ? "S_WERKSTATT" : (b.mitarbeiter ?? 10) < 10 ? "S" : "M";
  return {
    ziele: ["Zwei neue Gesellen und einen Azubi gewinnen", "Weniger Zettelwirtschaft im Büro", "Anfragen mit Fotos statt unnötiger Anfahrten"],
    probleme: ["Website von 2014, auf dem Handy schlecht lesbar", "Anfragen kommen über Telefon, Mail und WhatsApp durcheinander", "Stellenanzeige in der Zeitung bringt kaum Bewerbungen"],
    empfehlung: { paket, begruendung: `Paket ${PAKETE[paket].name} bringt Anfragen mit Fotos an eine Stelle und, bei M, eine Karriereseite mit Kurzbewerbung per Handy. Das passt zu den beiden wichtigsten Zielen.` },
    offeneFragen: ["Wer liefert die Fotos vom Team?", "Gibt es ein Logo als Datei?"],
    massnahmen: [
      { was: "Angebot prüfen und unterschreiben", wann: "diese Woche", wer: b.name },
      { was: "Texte, Fotos und Logo im Kundenportal hochladen", wann: "nach Auftrag", wer: b.name },
      { was: "Seite bauen und zur Prüfung vorlegen", wann: `${PAKETE[paket].wochen} Wochen nach Inhalten`, wer: "Stelax" },
      { was: "Google-Unternehmensprofil einrichten", wann: "mit Livegang", wer: "Stelax" },
    ],
    einleitung: `vielen Dank für das Gespräch bei ${b.name}. Wie besprochen erhalten Sie unser Angebot. Es setzt genau bei den Punkten an, die Sie genannt haben.`,
  };
}

export async function auswertung(terminId: number): Promise<string> {
  const db = await getDb();
  const [t] = await db.select().from(schema.termine).where(eq(schema.termine.id, terminId));
  if (!t?.transkript) throw new Error("Termin ohne Transkript");
  const b = await betrieb(t.betriebId);
  const ersatz = ersatzAuswertung(b);
  const ki = await schreibe({
    zweck: "termin_auswertung",
    modell: "text",
    betriebId: b.id,
    aufgabe: `Werte dieses Gespräch aus. Antworte nur mit JSON: {"ziele": string[], "probleme": string[], "empfehlung": {"paket": "START"|"S"|"S_WERKSTATT"|"M"|"L", "begruendung": string}, "offeneFragen": string[], "massnahmen": [{"was": string, "wann": string, "wer": string}], "einleitung": string}. "einleitung" ist der erste Absatz eines Angebotsanschreibens (ohne Anrede, 2 Sätze). Verwende nur, was im Gespräch gesagt wurde. Pakete: ${Object.entries(PAKETE).map(([k, p]) => `${k} = ${p.name} (${euro(p.einmalig)} + ${euro(p.monatlich)}/Monat)`).join("; ")}.`,
    daten: { betrieb: b.name, gewerk: b.gewerk, mitarbeiter: b.mitarbeiter, gespraech: t.transkript },
    ersatz: JSON.stringify(ersatz),
  });
  const a = { ...ersatz, ...jsonAus<Partial<Auswertung>>(ki.text, {}) };
  if (!PAKETE[a.empfehlung.paket]) a.empfehlung = ersatz.empfehlung;
  await db.update(schema.termine).set({ auswertung: a, status: "ausgewertet" }).where(eq(schema.termine.id, terminId));

  const an = anschrift(b);
  const heute = datumDe();
  const protokollId = await neuesDokument({ betriebId: b.id, art: "protokoll", titel: `Protokoll ${b.name}`, daten: { an, datum: heute, ...a } });
  const { nummer } = await erstelleAngebot({
    betriebId: b.id,
    auswahl: { paket: a.empfehlung.paket, module: [], zusaetze: [] },
    einleitung: a.einleitung,
    vorAnhaenge: [protokollId],
    meta: { terminId },
    wer: SYSTEM,
  });
  return `Protokoll und Angebot ${nummer} für ${b.name}`;
}

/**
 * Angebot aus Paket, Modulen und Zusatzleistungen. Entsteht automatisch nach dem Termin oder live vor Ort
 * im Angebots-Konfigurator. Geht wie alles durch Qualitätskontrolle und Freigabe.
 */
export async function erstelleAngebot(o: { betriebId: number; auswahl: Auswahl; einleitung?: string; vorAnhaenge?: number[]; meta?: Record<string, unknown>; wer: string }): Promise<{ angebotId: number; nummer: string; eintragId: number }> {
  const db = await getDb();
  const b = await betrieb(o.betriebId);
  const an = anschrift(b);
  const r = berechne(o.auswahl);
  const p = PAKETE[o.auswahl.paket];
  const [angebot] = await db.insert(schema.angebote).values({ betriebId: b.id, paket: o.auswahl.paket, einmalig: r.einmalig, monatlich: r.monatlich, positionen: r.positionen }).returning();
  const nummer = `A-${new Date().getFullYear()}-${String(angebot.id).padStart(4, "0")}`;
  const einleitung = o.einleitung || `vielen Dank für das Gespräch bei ${b.name}. Wie besprochen erhalten Sie unser Angebot mit den Bausteinen, die wir gemeinsam ausgewählt haben.`;
  const angebotDokId = await neuesDokument({
    betriebId: b.id,
    art: "angebot",
    titel: `Angebot ${nummer}`,
    daten: { an, nummer, datum: datumDe(), paket: o.auswahl.paket, einleitung, einmalig: r.einmalig, monatlich: r.monatlich, positionen: r.positionen, zahlweg: zahlungUeberStripe() ? "stripe" : "ueberweisung", agbVersion: AGB_VERSION },
  });
  const anrede = an.inhaber ? (an.anrede === "Frau" ? `Sehr geehrte Frau ${an.inhaber.split(" ").slice(-1)[0]},` : `Sehr geehrter Herr ${an.inhaber.split(" ").slice(-1)[0]},`) : "Guten Tag,";
  const zahlen = zahlungUeberStripe() ? " Nach der Annahme können Sie die Anzahlung direkt online bezahlen." : "";
  const eintragId = await inPostausgang({
    betriebId: b.id,
    kanal: "mail",
    zweck: "angebot",
    empfaenger: b.email ?? "(E-Mail-Adresse fehlt)",
    betreff: `Ihr Angebot von Stelax: ${p.name}`,
    text: `${anrede}\n\n${einleitung}\n\nIm Anhang finden Sie ${o.vorAnhaenge?.length ? "das Protokoll mit Maßnahmenplan und " : ""}das Angebot. Alles liegt auch in Ihrem Kundenportal. Dort nehmen Sie das Angebot mit zwei Klicks an und sehen jederzeit, wo Ihr Projekt steht.${zahlen}\n${await portalLink(b.id)}\n\nBei Fragen rufen Sie mich gern an.\n\nMit freundlichen Grüßen\nDaniel Lück\nStelax Consulting`,
    anhaenge: [...(o.vorAnhaenge ?? []), angebotDokId],
    erlaubteZahlen: [euro(r.einmalig), euro(r.monatlich), ...r.positionen.flatMap((x) => [euro(x.einmalig), euro(x.monatlich)])],
    hinweise: [...(b.email ? [] : ["E-Mail-Adresse fehlt. Beim Betrieb ergänzen und Empfänger anpassen."]), ...r.hinweise],
    meta: { ...(o.meta ?? {}), angebotId: angebot.id },
  });
  // Bestandskunden (Nachtrag, weiteres Modul) bleiben Kunden
  if (b.status !== "kunde") await setzeStatus(b.id, "angebot");
  await protokolliere(o.wer, `Angebot ${nummer} erstellt (${euro(r.einmalig)} + ${euro(r.monatlich)}/Monat)`, b.id);
  return { angebotId: angebot.id, nummer, eintragId };
}

export async function naechsteRechnungsnummer(jahr = new Date().getFullYear()): Promise<{ nummer: string; lfdNr: number; jahr: number }> {
  const db = await getDb();
  const [r] = await db.select({ m: max(schema.rechnungen.lfdNr) }).from(schema.rechnungen).where(eq(schema.rechnungen.jahr, jahr));
  const lfdNr = (r?.m ?? 0) + 1;
  return { nummer: `${jahr}-${String(lfdNr).padStart(4, "0")}`, lfdNr, jahr };
}

export async function erstelleRechnung(o: {
  betriebId: number;
  angebotId: number;
  art: "anzahlung" | "schluss" | "betreuung";
  netto: number;
  positionstext: string;
  projektId?: number;
  /** Eigene Positionen, z. B. Gesamtleistung minus Anzahlung. Summe muss netto ergeben. */
  positionen?: { text: string; netto: number }[];
  /** Leistungszeitpunkt oder -zeitraum */
  leistung?: string;
  anhaenge?: number[];
}): Promise<number> {
  const positionen = o.positionen ?? [{ text: o.positionstext, netto: o.netto }];
  if (positionen.reduce((x, p) => x + p.netto, 0) !== o.netto) throw new Error("Rechnungspositionen ergeben nicht den Rechnungsbetrag.");
  // Zahlungsziel als Kalenderdatum: dann tritt Verzug ohne Mahnung ein (§ 286 BGB)
  const faellig = new Date(Date.now() + ZAHLUNGSZIEL_TAGE * 864e5);
  const db = await getDb();
  const b = await betrieb(o.betriebId);
  // Die eindeutige Rechnungsnummer verhindert Doppelte; bei Kollision nochmal versuchen.
  let n: Awaited<ReturnType<typeof naechsteRechnungsnummer>> | undefined;
  for (let versuch = 0; versuch < 5 && !n; versuch++) {
    const kandidat = await naechsteRechnungsnummer();
    try {
      await db.insert(schema.rechnungen).values({ nummer: kandidat.nummer, lfdNr: kandidat.lfdNr, jahr: kandidat.jahr, betriebId: o.betriebId, angebotId: o.angebotId, art: o.art, netto: o.netto, faelligAm: faellig });
      n = kandidat;
    } catch (e) {
      if (versuch === 4) throw e;
    }
  }
  if (!n) throw new Error("Rechnungsnummer konnte nicht vergeben werden");
  const dokId = await neuesDokument({
    betriebId: o.betriebId,
    projektId: o.projektId,
    art: "rechnung",
    titel: `Rechnung ${n.nummer}`,
    daten: { an: anschrift(b), nummer: n.nummer, datum: datumDe(), art: o.art, positionen, zahlungszielTage: ZAHLUNGSZIEL_TAGE, zahlbarBis: datumDe(faellig), leistung: o.leistung },
  });
  const brutto = Math.round(o.netto * (1 + UST));
  await inPostausgang({
    betriebId: o.betriebId,
    projektId: o.projektId,
    kanal: "mail",
    zweck: o.art === "anzahlung" ? "rechnung" : o.art === "schluss" ? "schlussrechnung" : "betreuungsrechnung",
    empfaenger: b.email ?? "(E-Mail-Adresse fehlt)",
    betreff: `Rechnung ${n.nummer} von Stelax`,
    text: `Guten Tag,\n\nim Anhang finden Sie die Rechnung ${n.nummer} über ${euro(brutto)} (brutto). ${o.art === "betreuung" ? "" : `Bitte überweisen Sie den Betrag bis zum ${datumDe(faellig)}.`}\n\n${o.art === "anzahlung" ? "Nach Zahlungseingang schicken wir Ihnen den Zugang zum Kundenportal für Texte und Fotos." : o.art === "schluss" ? "Vielen Dank für die Zusammenarbeit. Ab jetzt läuft die Betreuung." : "Der Betrag wird wie vereinbart per SEPA-Lastschrift eingezogen."}\n\nMit freundlichen Grüßen\nMax Steiner\nStelax Consulting`,
    anhaenge: [...(o.anhaenge ?? []), dokId],
    // Regel aus dem Business Case: Rechnungen über 10.000 € brauchen zwei Freigaben.
    noetigeFreigaben: brutto > 1_000_000 ? 2 : 1,
    erlaubteZahlen: [euro(brutto), euro(o.netto), ...positionen.map((p) => euro(Math.abs(p.netto)))],
    meta: { angebotId: o.angebotId, rechnungsnummer: n.nummer },
  });
  return dokId;
}

export type Annahme = { name: string; am: string; agbVersion: string; unternehmer: boolean };

/** Angebot ist angenommen: Nachweis speichern, Auftragsbestätigung vorbereiten, ohne Stripe auch die Anzahlungsrechnung. */
export async function unterschriftEingegangen(angebotId: number, wer: string, annahme?: Annahme): Promise<void> {
  const db = await getDb();
  const [a] = await db.select().from(schema.angebote).where(eq(schema.angebote.id, angebotId));
  if (!a) throw new Error("Angebot nicht gefunden");
  if (a.status !== "versendet") throw new Error(`Angebot hat Status „${a.status}“. Unterschrift ist erst nach Versand möglich.`);
  const nachweis = annahme ?? { name: wer, am: new Date().toISOString(), agbVersion: AGB_VERSION, unternehmer: false };
  await db.update(schema.angebote).set({ status: "unterschrieben", unterschriebenAm: new Date(), annahme: nachweis }).where(eq(schema.angebote.id, angebotId));
  await setzeStatus(a.betriebId, "kunde");
  await systemAufgabeErledigt(a.betriebId, "Angebot nachfassen");
  await protokolliere(wer, `Angebot angenommen (${PAKETE[a.paket as PaketKey].name}, AGB ${nachweis.agbVersion}${nachweis.unternehmer ? ", Unternehmer bestätigt" : ""})`, a.betriebId);

  const b = await betrieb(a.betriebId);
  const nummer = `AB-${a.erstelltAm.getFullYear()}-${String(a.id).padStart(4, "0")}`;
  const angebotNummer = `A-${a.erstelltAm.getFullYear()}-${String(a.id).padStart(4, "0")}`;
  const positionen = a.positionen.length ? a.positionen : [{ text: PAKETE[a.paket as PaketKey].name, einmalig: a.einmalig, monatlich: a.monatlich }];
  const dokId = await neuesDokument({
    betriebId: b.id,
    art: "auftragsbestaetigung",
    titel: `Auftragsbestätigung ${nummer}`,
    daten: { an: anschrift(b), nummer, angebotNummer, datum: datumDe(), paket: a.paket, positionen, einmalig: a.einmalig, monatlich: a.monatlich, annahme: nachweis, zahlweg: zahlungUeberStripe() ? "stripe" : "ueberweisung" },
  });
  await inPostausgang({
    betriebId: b.id,
    kanal: "mail",
    zweck: "auftragsbestaetigung",
    empfaenger: b.email ?? "(E-Mail-Adresse fehlt)",
    betreff: `Auftragsbestätigung ${nummer}`,
    text: `Guten Tag,\n\nvielen Dank für Ihren Auftrag. Im Anhang finden Sie die Auftragsbestätigung zu unserem Angebot ${angebotNummer}. Sie liegt auch in Ihrem Kundenportal:\n${await portalLink(b.id)}\n\n${zahlungUeberStripe() ? "Die Anzahlung können Sie dort direkt online bezahlen, falls noch nicht geschehen." : "Die Rechnung über die Anzahlung kommt in einer eigenen E-Mail."} Danach geht es los.\n\nMit freundlichen Grüßen\nDaniel Lück\nStelax Consulting`,
    anhaenge: [dokId],
    erlaubteZahlen: [euro(a.einmalig), euro(a.monatlich), ...positionen.flatMap((x) => [euro(x.einmalig), euro(x.monatlich)])],
    hinweise: nachweis.unternehmer ? [] : ["Annahme ohne Unternehmer-Bestätigung (intern erfasst). Bitte mit dem Kunden klären."],
    meta: { angebotId },
  });
  // Mit Stripe zahlt der Kunde direkt im Portal, Stripe schickt die Rechnung. Sonst eigene Rechnung.
  if (zahlungUeberStripe()) return;
  await erstelleRechnung({ betriebId: a.betriebId, angebotId, art: "anzahlung", netto: Math.round(a.einmalig / 2), positionstext: `Anzahlung 50 % ${PAKETE[a.paket as PaketKey].name} laut Angebot ${angebotNummer}` });
}

export type StripeZahlung = { kundeId: string | null; zahlart: string | null; rechnung: StripeRechnung | null };

export async function zahlungEingegangen(angebotId: number, wer: string, stripe?: StripeZahlung): Promise<number> {
  const db = await getDb();
  const [a] = await db.select().from(schema.angebote).where(eq(schema.angebote.id, angebotId));
  if (a?.status === "angezahlt") {
    // Stripe meldet manche Zahlungen doppelt: dann nichts zweimal anlegen
    const [vorhanden] = await db.select().from(schema.projekte).where(eq(schema.projekte.angebotId, angebotId));
    if (vorhanden) return vorhanden.id;
  }
  if (!a || a.status !== "unterschrieben") throw new Error("Zahlung passt zu keinem unterschriebenen Angebot.");
  await db.update(schema.angebote).set({ status: "angezahlt", angezahltAm: new Date() }).where(eq(schema.angebote.id, angebotId));
  if (zahlungUeberStripe()) {
    const netto = Math.round(a.einmalig / 2);
    const r = stripe?.rechnung ?? { id: `sim_in_${angebotId}`, nummer: `SIM-${new Date().getFullYear()}-${String(angebotId).padStart(4, "0")}`, url: null, netto, bezahlt: true };
    await db.insert(schema.rechnungen).values({ nummer: r.nummer, lfdNr: 0, jahr: new Date().getFullYear(), betriebId: a.betriebId, angebotId, art: "anzahlung", netto: r.netto || netto, status: "bezahlt", bezahltAm: new Date(), quelle: "stripe", stripeId: r.id, stripeUrl: r.url }).onConflictDoNothing();
    await db
      .update(schema.betriebe)
      .set({ stripeKundeId: stripe?.kundeId ?? `sim_kunde_${a.betriebId}`, stripeZahlart: stripe?.zahlart ?? "sim_zahlart" })
      .where(eq(schema.betriebe.id, a.betriebId));
  } else {
    await db.update(schema.rechnungen).set({ status: "bezahlt", bezahltAm: new Date() }).where(and(eq(schema.rechnungen.angebotId, angebotId), eq(schema.rechnungen.art, "anzahlung")));
  }
  const token = crypto.randomBytes(18).toString("base64url");
  const [p] = await db.insert(schema.projekte).values({ betriebId: a.betriebId, angebotId, paket: a.paket, portalToken: token }).returning();
  await checklisteSicherstellen(p.id);
  const b = await betrieb(a.betriebId);
  await protokolliere(wer, "Anzahlung eingegangen, Projekt angelegt", a.betriebId);
  await inPostausgang({
    betriebId: a.betriebId,
    projektId: p.id,
    kanal: "mail",
    zweck: "kickoff",
    empfaenger: b.email ?? "(E-Mail-Adresse fehlt)",
    betreff: "Los geht's: Ihr Zugang für Texte und Fotos",
    text: `Guten Tag,\n\ndie Anzahlung ist da, vielen Dank. Jetzt brauchen wir Ihre Inhalte. Über diesen Link laden Sie Texte, Fotos und Ihr Logo hoch, ganz ohne Anmeldung:\n${basisUrl()}/portal/${token}\n\nDen Stand Ihres Projekts, Ihre Unterlagen und Rechnungen finden Sie wie immer in Ihrem Kundenportal:\n${await portalLink(a.betriebId)}\n\nSobald alles da ist, bauen wir Ihre Seite. Den Livegang planen wir ${PAKETE[a.paket as PaketKey].wochen <= 4 ? "30 Tage" : `${PAKETE[a.paket as PaketKey].wochen} Wochen`} nach Erhalt der Inhalte.\n\nMit freundlichen Grüßen\nMax Steiner\nStelax Consulting`,
    meta: { projektId: p.id },
  });
  return p.id;
}

export { SYSTEM };
