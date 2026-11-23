import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { ANGEBOT_VORLAGE, fuelle } from "../angebot-vorlage";
import { and, eq, inArray, max } from "drizzle-orm";
import { getDb, schema } from "../db";
import { einreihen } from "../jobs/warteschlange";
import { protokolliere } from "../protokoll";
import { transkribiere } from "../adapters/transkription";
import { schreibe, jsonAus } from "../adapters/ki";
import { datenOrdner } from "../pfade";
import { portalLink } from "../kundenportal";
import { aktuellerKatalog, berechne, type Auswahl } from "../katalog";
import { datumDe } from "../docs/basis";
import { NICHT_ENTHALTEN, PAKETE, PaketKey, euro, paketVorschlag, UST } from "../pakete";
import { katalogLaden } from "../katalog-db";
import { AGB_VERSION, ZAHLUNGSZIEL_TAGE } from "../recht";
import type { AngebotDaten, ProtokollDaten } from "../docs/vorlagen";
import { inPostausgang, istGesperrt } from "./postausgang";
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

/**
 * Gespräch aus Claude (Meeting-Zusammenfassung oder Mitschrift) übernehmen: statt Aufnahme direkt Text.
 * Danach wie bei einer Aufnahme: Auswertung → Protokoll, Angebotsentwurf und Begleit-Mail zur Freigabe.
 */
export async function gespraechImportieren(o: { betriebId: number; text: string; datum?: Date | null; einwilligung: boolean; quelle: string; wer: string }): Promise<number> {
  if (!o.einwilligung) throw new Error("Bitte bestätigen, dass der Betrieb mit dem Mitschreiben des Gesprächs einverstanden war.");
  const text = o.text.trim();
  if (text.length < 40) throw new Error("Der Gesprächstext ist zu kurz. Bitte die Zusammenfassung oder Mitschrift aus Claude einfügen.");
  await betrieb(o.betriebId); // wirft, wenn es den Betrieb nicht gibt
  const db = await getDb();
  const [t] = await db
    .insert(schema.termine)
    .values({ betriebId: o.betriebId, datum: o.datum ?? new Date(), einwilligung: true, einwilligungAm: new Date(), einwilligungVon: o.wer, transkript: text.slice(0, 200000), status: "transkribiert" })
    .returning({ id: schema.termine.id });
  const [b] = await db.select({ status: schema.betriebe.status }).from(schema.betriebe).where(eq(schema.betriebe.id, o.betriebId));
  if (b && ["neu", "interessant", "angeschrieben"].includes(b.status)) await setzeStatus(o.betriebId, "termin");
  await systemAufgabeErledigt(o.betriebId, "Besuch vor Ort");
  await protokolliere(o.wer, `Gespräch importiert (${o.quelle})`, o.betriebId);
  await einreihen("auswertung", { terminId: t.id });
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

// Ohne KI (oder wenn Feldern fehlen): keine erfundenen Inhalte. Ziele und Probleme bleiben leer, das Protokoll ist als
// unvollständig markiert und die Qualitätskontrolle hält die Mail an, bis jemand es ausgefüllt oder entfernt hat.
function ersatzAuswertung(b: { name: string; gewerk: string; mitarbeiter: number | null }): Auswertung {
  const paket: PaketKey = paketVorschlag(b.mitarbeiter);
  return {
    ziele: [],
    probleme: [],
    empfehlung: { paket, begruendung: `Vorschlag nach Betriebsgröße: ${PAKETE[paket].name}.` },
    offeneFragen: [],
    massnahmen: [
      { was: "Angebot prüfen und unterschreiben", wann: "diese Woche", wer: b.name },
      { was: "Texte, Fotos und Logo im Kundenportal hochladen", wann: "nach Auftrag", wer: b.name },
      { was: "Seite bauen und zur Prüfung vorlegen", wann: `${PAKETE[paket].wochen} Wochen nach Inhalten`, wer: "Levarex" },
      { was: "Google-Unternehmensprofil einrichten", wann: "mit Livegang", wer: "Levarex" },
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
    aufgabe: `Werte dieses Gespräch aus. Antworte nur mit JSON: {"ziele": string[], "probleme": string[], "empfehlung": {"paket": "KOMPAKT"|"PROFESSIONAL", "begruendung": string}, "offeneFragen": string[], "massnahmen": [{"was": string, "wann": string, "wer": string}], "einleitung": string}. "einleitung" ist der erste Absatz eines Angebotsanschreibens (ohne Anrede, 2 Sätze). Verwende nur, was im Gespräch gesagt wurde. Webauftritt: ${Object.entries(PAKETE).map(([k, p]) => `${k} = ${p.name} (${euro(p.einmalig)} + ${euro(p.monatlich)}/Monat)`).join("; ")}. Module nur in der Begründung nennen, wenn der Betrieb danach gefragt hat.`,
    daten: { betrieb: b.name, gewerk: b.gewerk, mitarbeiter: b.mitarbeiter, gespraech: t.transkript },
    ersatz: JSON.stringify(ersatz),
  });
  const ausKi = ki.simuliert ? {} : jsonAus<Partial<Auswertung>>(ki.text, {});
  const a = { ...ersatz, ...ausKi };
  if (!PAKETE[a.empfehlung?.paket]) a.empfehlung = ersatz.empfehlung;
  // Unvollständig, wenn Ziele oder Probleme fehlen (nichts erfinden, lieber anhalten)
  const unvollstaendig = !a.ziele?.length || !a.probleme?.length;
  await db.update(schema.termine).set({ auswertung: a, status: "ausgewertet" }).where(eq(schema.termine.id, terminId));

  const an = anschrift(b);
  const heute = datumDe();
  const protokollId = await neuesDokument({ betriebId: b.id, art: "protokoll", titel: `Protokoll ${b.name}`, daten: { an, datum: heute, ...a, quelle: t.audioPfad ? "aufnahme" : "mitschrift", ...(unvollstaendig ? { unvollstaendig: true } : {}) } });
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
export async function erstelleAngebot(o: { betriebId: number; auswahl: Auswahl; einleitung?: string; vorAnhaenge?: number[]; meta?: Record<string, unknown>; wer: string; /** false: nur Angebot und PDF speichern, die E-Mail schreibt man danach in Schritt 2 */ mail?: boolean }): Promise<{ angebotId: number; nummer: string; eintragId: number }> {
  const db = await getDb();
  const b = await betrieb(o.betriebId);
  // Sperrliste zuerst: dann entsteht gar nichts (kein Angebot, keine Nummer, kein Portal-Link)
  if (await istGesperrt(b.id)) throw new Error("Betrieb steht auf der Sperrliste. Es wird nichts erstellt.");
  const an = anschrift(b);
  await katalogLaden(); // aktuelle Stammdaten
  const r = berechne(o.auswahl);
  const p = PAKETE[o.auswahl.paket];
  const [angebot] = await db.insert(schema.angebote).values({ betriebId: b.id, paket: o.auswahl.paket, einmalig: r.einmalig, monatlich: r.monatlich, positionen: r.positionen, module: [...o.auswahl.module], zusaetze: [...o.auswahl.zusaetze] }).returning();
  const katalog = aktuellerKatalog();
  const bausteine = [
    ...katalog.module.filter((m) => o.auswahl.module.includes(m.key)).map((m) => ({ name: m.name, problem: m.problem, punkte: m.punkte?.length ? [...m.punkte] : [m.text] })),
    ...katalog.zusaetze.filter((z) => o.auswahl.zusaetze.includes(z.key) && z.key !== "prozesscheck").map((z) => ({ name: z.name, punkte: [z.individuell && o.auswahl.individuell?.text ? o.auswahl.individuell.text : z.text ?? z.name] })),
  ];
  const nummer = `A-${new Date().getFullYear()}-${String(angebot.id).padStart(4, "0")}`;
  const vorlage = structuredClone(ANGEBOT_VORLAGE); // eingefroren: spätere Änderungen an der Vorlage ändern kein Angebot
  const einleitung = o.einleitung || fuelle(vorlage.einstieg, { betrieb: b.name });
  const angebotDokId = await neuesDokument({
    betriebId: b.id,
    art: "angebot",
    titel: `Angebot ${nummer}`,
    daten: { an, nummer, datum: datumDe(), paket: o.auswahl.paket, einleitung, einmalig: r.einmalig, monatlich: r.monatlich, positionen: r.positionen, zahlweg: "ueberweisung", agbVersion: AGB_VERSION,
      // Eingefroren: spätere Änderungen in den Stammdaten ändern kein verschicktes Angebot
      paketName: p.name, paketProblem: p.problem, paketInhalt: [...p.inhalt], nichtEnthalten: NICHT_ENTHALTEN[o.auswahl.paket].filter((x) => !katalog.module.some((m) => o.auswahl.module.includes(m.key) && x.includes(m.name))), wochen: p.wochen,
      bausteine, mitKi: o.auswahl.module.some((m) => m === "marketing" || m === "kundenmanagement"), vorlage },
  });
  const entwurf = await angebotMailEntwurf(angebot.id, o.vorAnhaenge?.length ? "das Protokoll mit Maßnahmenplan und das Angebot" : undefined);
  // Ohne Mail (Angebot vor Ort zusammengestellt): Die E-Mail entsteht erst in Schritt 2, wenn das Angebot fertig ist
  const eintragId =
    o.mail === false
      ? 0
      : await inPostausgang({
          betriebId: b.id,
          kanal: "mail",
          zweck: "angebot",
          empfaenger: b.email ?? "(E-Mail-Adresse fehlt)",
          betreff: entwurf.betreff,
          text: entwurf.text,
          anhaenge: [...(o.vorAnhaenge ?? []), angebotDokId],
          erlaubteZahlen: entwurf.erlaubteZahlen,
          hinweise: [...(b.email ? [] : ["E-Mail-Adresse fehlt. Beim Betrieb ergänzen und Empfänger anpassen."]), ...r.hinweise],
          meta: { ...(o.meta ?? {}), angebotId: angebot.id },
        });
  // Ältere, noch offene Angebote sind überholt: Mail nicht mehr senden, nicht mehr unterschreiben
  const alt = (await db.select().from(schema.angebote).where(eq(schema.angebote.betriebId, b.id))).filter((x) => x.id !== angebot.id && ["entwurf", "versendet"].includes(x.status));
  for (const x of alt) {
    await db.update(schema.angebote).set({ status: "ueberholt" }).where(eq(schema.angebote.id, x.id));
    const mails = (await db.select().from(schema.postausgang).where(and(eq(schema.postausgang.betriebId, b.id), eq(schema.postausgang.zweck, "angebot"), inArray(schema.postausgang.status, ["zur_freigabe", "freigegeben"])))).filter((m) => Number(m.meta.angebotId) === x.id);
    for (const m of mails) await db.update(schema.postausgang).set({ status: "abgelehnt", ablehnGrund: `Durch Angebot ${nummer} ersetzt` }).where(eq(schema.postausgang.id, m.id));
  }
  if (alt.length) await protokolliere(o.wer, `${alt.length} älteres Angebot durch ${nummer} ersetzt`, b.id);
  // Wer ein Angebot schreibt, war beim Betrieb: die Besuchsaufgabe ist erledigt
  await systemAufgabeErledigt(b.id, "Besuch vor Ort");
  // Bestandskunden (Nachtrag, weiteres Modul) bleiben Kunden
  if (b.status !== "kunde") await setzeStatus(b.id, "angebot");
  await protokolliere(o.wer, `Angebot ${nummer} erstellt (${euro(r.einmalig)} + ${euro(r.monatlich)}/Monat)`, b.id);
  return { angebotId: angebot.id, nummer, eintragId };
}

/** Vorschlag für die Angebots-Mail (Betreff, Text, erlaubte Zahlen) aus Angebot, Vorlage und Betrieb. */
export async function angebotMailEntwurf(angebotId: number, anhaenge = "das Angebot"): Promise<{ betreff: string; text: string; erlaubteZahlen: string[]; angebotDokId: number | null }> {
  const db = await getDb();
  const [a] = await db.select().from(schema.angebote).where(eq(schema.angebote.id, angebotId));
  if (!a) throw new Error("Angebot nicht gefunden");
  const b = await betrieb(a.betriebId);
  const an = anschrift(b);
  const nummer = `A-${a.erstelltAm.getFullYear()}-${String(a.id).padStart(4, "0")}`;
  const dok = (await db.select().from(schema.dokumente).where(and(eq(schema.dokumente.betriebId, b.id), eq(schema.dokumente.art, "angebot")))).find((d) => (d.daten as AngebotDaten).nummer === nummer);
  const daten = (dok?.daten ?? {}) as Partial<AngebotDaten>;
  const vorlage = daten.vorlage ?? ANGEBOT_VORLAGE;
  const paketName = daten.paketName ?? PAKETE[a.paket as PaketKey]?.name ?? a.paket;
  const bausteine = daten.bausteine?.length ?? 0;
  const nachname = an.inhaber?.split(" ").slice(-1)[0];
  const anrede = !an.inhaber ? "Guten Tag," : an.anrede === "Frau" ? `Sehr geehrte Frau ${nachname},` : an.anrede === "Herr" ? `Sehr geehrter Herr ${nachname},` : `Guten Tag ${an.inhaber},`;
  return {
    betreff: `Ihr Angebot von Levarex: ${paketName}${bausteine ? ` und ${bausteine === 1 ? "ein weiterer Baustein" : `${bausteine} weitere Bausteine`}` : ""}`,
    text: fuelle(vorlage.mail, { anrede, einstieg: daten.einleitung ?? fuelle(vorlage.einstieg, { betrieb: b.name }), anhaenge, portallink: await portalLink(b.id) }),
    erlaubteZahlen: [euro(a.einmalig), euro(a.monatlich), ...a.positionen.flatMap((x) => [euro(x.einmalig), euro(x.monatlich)])],
    angebotDokId: dok?.id ?? null,
  };
}

/** Schritt 2: Die von Hand formulierte Angebots-Mail in die Freigaben legen (Qualitätskontrolle, dann Freigabe). */
export async function angebotMailVorlegen(o: { angebotId: number; empfaenger: string; betreff: string; text: string; wer: string }): Promise<number> {
  const db = await getDb();
  const [a] = await db.select().from(schema.angebote).where(eq(schema.angebote.id, o.angebotId));
  if (!a) throw new Error("Angebot nicht gefunden");
  if (a.status !== "entwurf") throw new Error(`Das Angebot hat den Status „${a.status}“; eine neue Angebots-Mail ist nicht mehr nötig.`);
  const offen = (await db.select().from(schema.postausgang).where(and(eq(schema.postausgang.betriebId, a.betriebId), eq(schema.postausgang.zweck, "angebot"), inArray(schema.postausgang.status, ["zur_freigabe", "freigegeben"])))).find((m) => Number(m.meta.angebotId) === a.id);
  if (offen) return offen.id; // nicht doppelt
  const empfaenger = o.empfaenger.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(empfaenger)) throw new Error("Bitte eine gültige E-Mail-Adresse eintragen.");
  if (o.betreff.trim().length < 3 || o.text.trim().length < 20) throw new Error("Betreff und Text der E-Mail fehlen.");
  const entwurf = await angebotMailEntwurf(a.id);
  if (!entwurf.angebotDokId) throw new Error("Das Angebots-PDF fehlt.");
  const b = await betrieb(a.betriebId);
  if (!b.email) await db.update(schema.betriebe).set({ email: empfaenger }).where(eq(schema.betriebe.id, b.id));
  const id = await inPostausgang({
    betriebId: a.betriebId,
    kanal: "mail",
    zweck: "angebot",
    empfaenger,
    betreff: o.betreff.trim(),
    text: o.text.trim(),
    anhaenge: [entwurf.angebotDokId],
    erlaubteZahlen: entwurf.erlaubteZahlen,
    meta: { angebotId: a.id },
  });
  await protokolliere(o.wer, `Angebots-Mail zur Freigabe vorgelegt`, a.betriebId);
  return id;
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
  // Monatsbeitrag: Einzug per SEPA-Lastschrift über Qonto, sobald der Einzug eingerichtet ist, sonst Überweisung
  const [proj] = o.projektId ? await db.select({ qontoAboId: schema.projekte.qontoAboId }).from(schema.projekte).where(eq(schema.projekte.id, o.projektId)) : [];
  const lastschrift = o.art === "betreuung" && !!proj?.qontoAboId;
  await inPostausgang({
    betriebId: o.betriebId,
    projektId: o.projektId,
    kanal: "mail",
    zweck: o.art === "anzahlung" ? "rechnung" : o.art === "schluss" ? "schlussrechnung" : "betreuungsrechnung",
    empfaenger: b.email ?? "(E-Mail-Adresse fehlt)",
    betreff: `Rechnung ${n.nummer} von Levarex`,
    text: `Guten Tag,\n\nim Anhang finden Sie die Rechnung ${n.nummer} über ${euro(brutto)} (brutto). ${lastschrift ? "" : `Bitte überweisen Sie den Betrag bis zum ${datumDe(faellig)}.`}\n\n${o.art === "anzahlung" ? "Nach Zahlungseingang starten wir; Texte und Fotos laden Sie dann in Ihrem Kundenportal hoch." : o.art === "schluss" ? "Vielen Dank für die Zusammenarbeit. Ab jetzt läuft die Betreuung." : lastschrift ? "Den Betrag ziehen wir frühestens 5 Kalendertage nach dieser Mitteilung per SEPA-Lastschrift von Ihrem Konto ein." : "Vielen Dank."}\n\nMit freundlichen Grüßen\nMaximilian Steiner\nLevarex Consulting`,
    anhaenge: [...(o.anhaenge ?? []), dokId],
    // Regel aus dem Business Case: Rechnungen über 10.000 € brauchen zwei Freigaben.
    noetigeFreigaben: brutto > 1_000_000 ? 2 : 1,
    erlaubteZahlen: [euro(brutto), euro(o.netto), ...positionen.map((p) => euro(Math.abs(p.netto)))],
    meta: { angebotId: o.angebotId, rechnungsnummer: n.nummer },
  });
  return dokId;
}

export type Annahme = { name: string; am: string; agbVersion: string; unternehmer: boolean; kanal?: "tablet" | "portal" };

/** Angebot ist angenommen: Nachweis speichern, Auftragsbestätigung und Rechnung über die erste Rate vorbereiten. */
export async function unterschriftEingegangen(angebotId: number, wer: string, annahme?: Annahme, vertragsDokumente: number[] = []): Promise<void> {
  const db = await getDb();
  const [a] = await db.select().from(schema.angebote).where(eq(schema.angebote.id, angebotId));
  if (!a) throw new Error("Angebot nicht gefunden");
  // Unterschrift auf dem Tablet geht auch, bevor die Angebots-Mail raus ist (Termin vor Ort)
  if (!["versendet", "entwurf"].includes(a.status)) throw new Error(`Angebot hat Status „${a.status}“ und kann nicht mehr angenommen werden.`);
  const nachweis = annahme ?? { name: wer, am: new Date().toISOString(), agbVersion: AGB_VERSION, unternehmer: false };
  await db.update(schema.angebote).set({ status: "unterschrieben", unterschriebenAm: new Date(), annahme: nachweis }).where(eq(schema.angebote.id, angebotId));
  await setzeStatus(a.betriebId, "kunde");
  await systemAufgabeErledigt(a.betriebId, "Angebot nachfassen");
  await systemAufgabeErledigt(a.betriebId, "Besuch vor Ort");
  // Ein noch offener Akquise-Brief darf an einen Kunden nicht mehr raus
  for (const m of await db.select().from(schema.postausgang).where(and(eq(schema.postausgang.betriebId, a.betriebId), eq(schema.postausgang.zweck, "akquise_brief"), inArray(schema.postausgang.status, ["zur_freigabe", "freigegeben"])))) {
    await db.update(schema.postausgang).set({ status: "abgelehnt", ablehnGrund: "Betrieb ist jetzt Kunde (Auftrag unterschrieben)" }).where(eq(schema.postausgang.id, m.id));
  }
  await (await import("../webhooks")).ereignis("angebot.unterschrieben", { angebotId, betriebId: a.betriebId });
  await protokolliere(wer, `Angebot angenommen (${PAKETE[a.paket as PaketKey].name}, AGB ${nachweis.agbVersion}${nachweis.unternehmer ? ", Unternehmer bestätigt" : ""})`, a.betriebId);

  const b = await betrieb(a.betriebId);
  const arten = vertragsDokumente.length ? (await db.select({ art: schema.dokumente.art }).from(schema.dokumente).where(inArray(schema.dokumente.id, vertragsDokumente))).map((d) => d.art) : [];
  const mitMandat = arten.includes("sepa_mandat");
  const mitPilot = arten.includes("pilotvereinbarung");
  const nummer = `AB-${a.erstelltAm.getFullYear()}-${String(a.id).padStart(4, "0")}`;
  const angebotNummer = `A-${a.erstelltAm.getFullYear()}-${String(a.id).padStart(4, "0")}`;
  const positionen = a.positionen.length ? a.positionen : [{ text: PAKETE[a.paket as PaketKey].name, einmalig: a.einmalig, monatlich: a.monatlich }];
  const dokId = await neuesDokument({
    betriebId: b.id,
    art: "auftragsbestaetigung",
    titel: `Auftragsbestätigung ${nummer}`,
    daten: { an: anschrift(b), nummer, angebotNummer, datum: datumDe(), paket: a.paket, positionen, einmalig: a.einmalig, monatlich: a.monatlich, annahme: nachweis, zahlweg: "ueberweisung" },
  });
  await inPostausgang({
    betriebId: b.id,
    kanal: "mail",
    zweck: "auftragsbestaetigung",
    empfaenger: b.email ?? "(E-Mail-Adresse fehlt)",
    betreff: `Auftragsbestätigung ${nummer}`,
    text: `Guten Tag,\n\nvielen Dank für Ihren Auftrag. Im Anhang finden Sie die Auftragsbestätigung zu unserem Angebot ${angebotNummer}${vertragsDokumente.length ? ` und die unterschriebenen Verträge (Rahmenvertrag, Leistungsscheine${mitPilot ? ", Pilotvereinbarung" : ""} und Vertrag zur Auftragsverarbeitung${mitMandat ? ", dazu Ihr SEPA-Lastschriftmandat" : ""})` : ""}. Alles liegt auch in Ihrem Kundenportal:\n${await portalLink(b.id)}\n\nDie Rechnung über die erste Rate (50 %) kommt in einer eigenen E-Mail. Danach geht es los.\n\nMit freundlichen Grüßen\nDaniel Lück\nLevarex Consulting`,
    anhaenge: [dokId, ...vertragsDokumente],
    erlaubteZahlen: [euro(a.einmalig), euro(a.monatlich), ...positionen.flatMap((x) => [euro(x.einmalig), euro(x.monatlich)])],
    hinweise: nachweis.unternehmer ? [] : ["Annahme ohne Unternehmer-Bestätigung (intern erfasst). Bitte mit dem Kunden klären."],
    meta: { angebotId },
  });
  await erstelleRechnung({ betriebId: a.betriebId, angebotId, art: "anzahlung", netto: Math.round(a.einmalig / 2), positionstext: `Anzahlung 50 % laut Angebot ${angebotNummer} (${PAKETE[a.paket as PaketKey].name}${a.positionen.length > 1 ? ` und ${a.positionen.length - 1} weitere Position${a.positionen.length > 2 ? "en" : ""}` : ""})` });
}

/** Erste Rate ist bezahlt (Lexware-Abgleich oder von Hand gebucht): Projekt anlegen und Start-Mail vorbereiten. */
export async function zahlungEingegangen(angebotId: number, wer: string): Promise<number> {
  const db = await getDb();
  const [a] = await db.select().from(schema.angebote).where(eq(schema.angebote.id, angebotId));
  if (a?.status === "angezahlt") {
    // Zweimal gemeldet (z. B. Abgleich und Knopf): nichts doppelt anlegen
    const [vorhanden] = await db.select().from(schema.projekte).where(eq(schema.projekte.angebotId, angebotId));
    if (vorhanden) return vorhanden.id;
  }
  if (!a || a.status !== "unterschrieben") throw new Error("Zahlung passt zu keinem unterschriebenen Angebot.");
  await db.update(schema.angebote).set({ status: "angezahlt", angezahltAm: new Date() }).where(eq(schema.angebote.id, angebotId));
  await db.update(schema.rechnungen).set({ status: "bezahlt", bezahltAm: new Date() }).where(and(eq(schema.rechnungen.angebotId, angebotId), eq(schema.rechnungen.art, "anzahlung")));
  const token = crypto.randomBytes(18).toString("base64url");
  const [p] = await db.insert(schema.projekte).values({ betriebId: a.betriebId, angebotId, paket: a.paket, portalToken: token }).returning();
  await checklisteSicherstellen(p.id);
  const b = await betrieb(a.betriebId);
  await protokolliere(wer, "Anzahlung eingegangen, Projekt angelegt", a.betriebId);
  await (await import("../webhooks")).ereignis("projekt.gestartet", { projektId: p.id, betriebId: a.betriebId, angebotId });
  await inPostausgang({
    betriebId: a.betriebId,
    projektId: p.id,
    kanal: "mail",
    zweck: "kickoff",
    empfaenger: b.email ?? "(E-Mail-Adresse fehlt)",
    betreff: "Los geht's: Ihr Zugang für Texte und Fotos",
    text: `Guten Tag,\n\ndie Anzahlung ist da, vielen Dank. Jetzt brauchen wir Ihre Inhalte. Über diesen Link laden Sie Texte, Fotos und Ihr Logo hoch, ganz ohne Anmeldung:\n${basisUrl()}/portal/${token}\n\nDen Stand Ihres Projekts, Ihre Unterlagen und Rechnungen finden Sie wie immer in Ihrem Kundenportal:\n${await portalLink(a.betriebId)}\n\nSobald alles da ist, bauen wir Ihre Seite. Den Livegang planen wir ${PAKETE[a.paket as PaketKey].wochen <= 4 ? "30 Tage" : `${PAKETE[a.paket as PaketKey].wochen} Wochen`} nach Erhalt der Inhalte.\n\nMit freundlichen Grüßen\nMaximilian Steiner\nLevarex Consulting`,
    meta: { projektId: p.id },
  });
  return p.id;
}

export { SYSTEM };
