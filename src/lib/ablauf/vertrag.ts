import { and, eq, isNotNull, lte } from "drizzle-orm";
import { getDb, schema } from "../db";
import { protokolliere } from "../protokoll";
import { melde } from "../adapters/push";
import { portalLink } from "../kundenportal";
import { datumDe } from "../docs/basis";
import { PAKETE, PaketKey, euro, UST } from "../pakete";
import { ABNAHME_FRIST_TAGE, KUENDIGUNG_MONATE_VOR_ENDE, LAUFZEIT_MONATE, VERLAENGERUNG_MONATE, VERTRAGSWERK_VERSION } from "../recht";
import { inPostausgang } from "./postausgang";
import { hakeAb } from "./checkliste";
import { basisUrl, anschrift, betrieb, neuesDokument, SYSTEM } from "./gemeinsam";
import { erstelleRechnung } from "./verkauf";

// Vertrag nach dem Livegang: Abnahme (§ 640 BGB), Schlusszahlung erst nach Abnahme, Kündigung und Vertragsende.

type Projekt = typeof schema.projekte.$inferSelect;

async function projekt(id: number): Promise<Projekt> {
  const db = await getDb();
  const [p] = await db.select().from(schema.projekte).where(eq(schema.projekte.id, id));
  if (!p) throw new Error("Projekt nicht gefunden");
  return p;
}

/**
 * Fertigstellungsanzeige: Seite als Vorschau bereitstellen (nicht in Google, mit Zugangscode) und um Abnahme bitten.
 * Online geht die Seite erst nach der Abnahme. Die Frist beginnt, sobald die Mail freigegeben und verschickt ist.
 */
export async function abnahmeAnfordern(projektId: number, wer: string, hinweise: string[] = []): Promise<number> {
  const p = await projekt(projektId);
  if (p.status !== "bereit" || !p.seitenSlug) throw new Error("Abnahme gibt es erst, wenn die Seite gebaut ist und alle Prüfungen bestanden hat.");
  if (p.abnahmeStatus === "offen") throw new Error("Die Abnahme ist schon angefordert.");
  if (p.abnahmeStatus && p.abnahmeStatus !== "verweigert") throw new Error("Das Projekt ist schon abgenommen.");
  const db = await getDb();
  await db.update(schema.projekte).set({ abnahmeStatus: "offen", abnahmeFrist: null, abnahmeMaengel: p.abnahmeStatus === "verweigert" ? p.abnahmeMaengel : null }).where(eq(schema.projekte.id, projektId));
  const b = await betrieb(p.betriebId);
  const erneut = p.abnahmeStatus === "verweigert";
  const [seite] = await db.select().from(schema.seiten).where(eq(schema.seiten.slug, p.seitenSlug));
  const vorschau = `${basisUrl()}/vorschau/${p.seitenSlug}${seite?.zugangscode ? `?code=${seite.zugangscode}` : ""}`;
  const id = await inPostausgang({
    betriebId: b.id,
    projektId,
    kanal: "mail",
    zweck: "abnahme_aufforderung",
    empfaenger: b.email ?? "(E-Mail-Adresse fehlt)",
    betreff: erneut ? "Mängel behoben: Bitte nehmen Sie Ihre Website ab" : "Ihre Website ist fertig: Bitte nehmen Sie sie ab",
    text: `Guten Tag,\n\n${erneut ? "die genannten Mängel sind behoben." : "Ihre Website ist fertig."} Sie ist noch nicht öffentlich: Sehen Sie sich die Vorschau in Ruhe an, am Handy und am Computer:\n${vorschau}\n\nErklären Sie die Abnahme bitte in Ihrem Kundenportal:\n${await portalLink(b.id)}\n\nDort können Sie abnehmen, unter Vorbehalt mit Mängeln abnehmen oder mit Begründung verweigern. Bitte melden Sie sich innerhalb von ${ABNAHME_FRIST_TAGE} Kalendertagen. Nennen Sie in dieser Frist keinen Mangel, gilt die Website als abgenommen (§ 640 Abs. 2 BGB). Online geht sie erst nach der Abnahme${p.domain ? ` unter ${p.domain}` : ""}.\n\nMit freundlichen Grüßen\nMaximilian Steiner\nLevarex Consulting`,
    erlaubteZahlen: [String(ABNAHME_FRIST_TAGE)],
    hinweise,
    meta: { projektId },
  });
  await protokolliere(wer, erneut ? "Abnahme erneut angefordert" : "Abnahme angefordert", b.id);
  return id;
}

/** Nach Versand der Aufforderung: Frist setzen. */
export async function abnahmeFristStarten(projektId: number): Promise<void> {
  const db = await getDb();
  await db.update(schema.projekte).set({ abnahmeFrist: new Date(Date.now() + ABNAHME_FRIST_TAGE * 864e5) }).where(and(eq(schema.projekte.id, projektId), eq(schema.projekte.abnahmeStatus, "offen")));
}

export type AbnahmeErklaerung = { ergebnis: "abgenommen" | "vorbehalt" | "verweigert"; name: string; maengel: string };

/** Erklärung des Kunden im Kundenportal. */
export async function abnahmeErklaeren(projektId: number, e: AbnahmeErklaerung): Promise<void> {
  const p = await projekt(projektId);
  if (p.abnahmeStatus !== "offen" || !p.abnahmeFrist) throw new Error("Für dieses Projekt ist keine Abnahme offen.");
  if (!e.name.trim()) throw new Error("Bitte Ihren Namen eintragen.");
  if (e.ergebnis !== "abgenommen" && e.maengel.trim().length < 5) throw new Error("Bitte nennen Sie die Mängel.");
  const db = await getDb();
  await db
    .update(schema.projekte)
    .set({ abnahmeStatus: e.ergebnis, abnahmeAm: new Date(), abnahmeName: e.name.trim(), abnahmeMaengel: e.maengel.trim() || null })
    .where(eq(schema.projekte.id, projektId));
  const b = await betrieb(p.betriebId);
  await protokolliere(`Kunde: ${e.name} (Kundenportal)`, `Abnahme: ${e.ergebnis}`, b.id, e.maengel || undefined);
  if (e.ergebnis === "verweigert") {
    await melde("job", false, `Abnahme verweigert: ${b.name}`, `Mängel: ${e.maengel}\nBeheben, dann im Projekt „Erneut zur Abnahme vorlegen“.`);
    return;
  }
  if (e.ergebnis === "vorbehalt") await melde("job", false, `Abnahme mit Mängeln: ${b.name}`, `Mängel: ${e.maengel}\nBitte zeitnah beheben.`);
  await nachAbnahme(projektId);
}

/** Agent (täglich): Frist abgelaufen, kein Mangel genannt → Abnahme gilt als erklärt. */
export async function abnahmefiktion(jetzt = new Date()): Promise<string> {
  const db = await getDb();
  const faellig = await db
    .select()
    .from(schema.projekte)
    .where(and(eq(schema.projekte.abnahmeStatus, "offen"), isNotNull(schema.projekte.abnahmeFrist), lte(schema.projekte.abnahmeFrist, jetzt)));
  for (const p of faellig) {
    await db.update(schema.projekte).set({ abnahmeStatus: "fiktion", abnahmeAm: p.abnahmeFrist }).where(eq(schema.projekte.id, p.id));
    await protokolliere(SYSTEM, "Abnahme gilt als erklärt (Frist abgelaufen, § 640 Abs. 2 BGB)", p.betriebId);
    await nachAbnahme(p.id);
  }
  return `${faellig.length} Abnahmen nach Fristablauf`;
}

/** Abnahmeprotokoll an den Kunden und Livegang vorbereiten. Beides geht durch Qualitätskontrolle und Freigabe. */
async function nachAbnahme(projektId: number): Promise<void> {
  const p = await projekt(projektId);
  await (await import("../webhooks")).ereignis("abnahme.erklaert", { projektId, betriebId: p.betriebId, ergebnis: p.abnahmeStatus });
  await hakeAb(projektId, "abnahme");
  const b = await betrieb(p.betriebId);
  const db = await getDb();
  const ergebnis = p.abnahmeStatus as "abgenommen" | "vorbehalt" | "fiktion";
  const am = datumDe(p.abnahmeAm ?? new Date());
  const name = PAKETE[p.paket as PaketKey]?.name ?? p.paket;
  const protokollId = await neuesDokument({
    betriebId: b.id,
    projektId,
    art: "abnahmeprotokoll",
    titel: `Abnahmeprotokoll ${b.name}`,
    daten: { an: anschrift(b), datum: datumDe(), projekt: name, domain: p.domain, ergebnis, name: p.abnahmeName, am, frist: p.abnahmeFrist ? datumDe(p.abnahmeFrist) : null, maengel: p.abnahmeMaengel, pruefung: p.pruefung ?? [] },
  });
  await inPostausgang({
    betriebId: b.id,
    projektId,
    kanal: "mail",
    zweck: "abnahme_bestaetigung",
    empfaenger: b.email ?? "(E-Mail-Adresse fehlt)",
    betreff: "Abnahmeprotokoll zu Ihrer Website",
    text: `Guten Tag,\n\n${ergebnis === "fiktion" ? `die Frist zur Abnahme ist am ${datumDe(p.abnahmeFrist ?? new Date())} abgelaufen, ohne dass Sie einen Mangel genannt haben. Damit gilt Ihre Website als abgenommen.` : ergebnis === "vorbehalt" ? "vielen Dank für die Abnahme. Die genannten Mängel beheben wir zeitnah und melden uns mit einem Termin." : "vielen Dank für die Abnahme Ihrer Website."} Im Anhang finden Sie das Abnahmeprotokoll. Es liegt auch in Ihrem Kundenportal.\n\nMit freundlichen Grüßen\nMaximilian Steiner\nLevarex Consulting`,
    anhaenge: [protokollId],
    meta: { projektId },
  });
  // Erst jetzt der Livegang: Freigabe nur durch Maximilian mit zweitem Faktor
  if (p.status === "bereit") {
    await inPostausgang({
      betriebId: b.id,
      projektId,
      kanal: "livegang",
      zweck: "livegang",
      empfaenger: p.domain || "(Domain fehlt)",
      betreff: `Livegang ${b.name} (${name})`,
      text: `Abnahme ${ergebnis === "fiktion" ? "durch Fristablauf" : "erklärt"} am ${am}. Die Seite hat alle ${(p.pruefung ?? []).length} Prüfungen bestanden. Vorschau ansehen, dann freigeben.\n\nNach der Freigabe: Seite geht online, die Domain wird umgestellt, die Schlussrechnung (50 %) und die Lastschrift für den Monatsbeitrag liegen zur Freigabe.`,
      meta: { projektId, slug: p.seitenSlug },
    });
  }
}

/** Zweite Rate beim Livegang nach der Abnahme: Gesamtleistung minus erste Rate und darauf entfallende Steuer (§ 14 Abs. 5 UStG). */
export async function schlussrechnungStellen(projektId: number): Promise<void> {
  const p = await projekt(projektId);
  if (!p.angebotId) return;
  const db = await getDb();
  const [a] = await db.select().from(schema.angebote).where(eq(schema.angebote.id, p.angebotId));
  if (!a || a.status === "abgeschlossen") return;
  await db.update(schema.angebote).set({ status: "abgeschlossen" }).where(eq(schema.angebote.id, a.id));
  const b = await betrieb(p.betriebId);
  const name = PAKETE[p.paket as PaketKey]?.name ?? p.paket;
  const am = datumDe(p.abnahmeAm ?? new Date());
  const anzahlung = Math.round(a.einmalig / 2);
  const [anz] = await db.select().from(schema.rechnungen).where(and(eq(schema.rechnungen.angebotId, a.id), eq(schema.rechnungen.art, "anzahlung")));
  const anzNetto = anz?.netto ?? anzahlung;
  await erstelleRechnung({
    betriebId: b.id,
    angebotId: a.id,
    projektId,
    art: "schluss",
    netto: a.einmalig - anzNetto,
    positionstext: `Schlussrechnung ${name}`,
    positionen: [
      { text: `${name}, Gesamtleistung laut Angebot A-${a.erstelltAm.getFullYear()}-${String(a.id).padStart(4, "0")}`, netto: a.einmalig },
      { text: `abzüglich erste Rate${anz ? `, Rechnung ${anz.nummer} vom ${datumDe(anz.erstelltAm)}` : ""} (darauf entfallende USt ${euro(Math.round(anzNetto * UST))})`, netto: -anzNetto },
    ],
    leistung: `Abnahme am ${am}, Livegang am ${datumDe()}`,
  });
}

/**
 * Vertragsende nach Baukasten: Laufzeit 24 Monate ab Livegang, danach Verlängerung um je 12 Monate;
 * Kündigung bis 3 Monate vor Ende in Textform. Die Kündigung wirkt zum Ende der laufenden Periode.
 */
export function laufzeitEnde(start: Date, eingang: Date): Date {
  let monate = LAUFZEIT_MONATE;
  const ende = (m: number) => new Date(start.getFullYear(), start.getMonth() + m, start.getDate() - 1, 23, 59);
  const frist = (m: number) => new Date(start.getFullYear(), start.getMonth() + m - KUENDIGUNG_MONATE_VOR_ENDE, start.getDate() - 1, 23, 59);
  while (eingang > frist(monate)) monate += VERLAENGERUNG_MONATE;
  return ende(monate);
}

/** Kündigung des Monatsbeitrags erfassen (Ende nach laufzeitEnde). */
export async function kuendigungErfassen(projektId: number, wer: string, eingang = new Date()): Promise<Date> {
  const p = await projekt(projektId);
  if (p.gekuendigtAm) throw new Error("Die Kündigung ist schon erfasst.");
  const start = p.liveAm ?? p.aboAb ?? new Date();
  const ende = laufzeitEnde(start, eingang);
  const db = await getDb();
  await db.update(schema.projekte).set({ gekuendigtAm: eingang, endeAm: ende }).where(eq(schema.projekte.id, projektId));
  const b = await betrieb(p.betriebId);
  await protokolliere(wer, `Kündigung erfasst, Ende ${datumDe(ende)}`, b.id);
  await inPostausgang({
    betriebId: b.id,
    projektId,
    kanal: "mail",
    zweck: "kuendigung",
    empfaenger: b.email ?? "(E-Mail-Adresse fehlt)",
    betreff: "Bestätigung Ihrer Kündigung",
    text: `Guten Tag,\n\nwir bestätigen Ihre Kündigung vom ${datumDe(eingang)}. Der Vertrag endet am ${datumDe(ende)}. Bis dahin kümmern wir uns wie gewohnt um Ihre Website.\n\nZum Ende übergeben wir Ihnen auf Wunsch alles, was Sie für einen Wechsel brauchen: Zugang zur Domain, die Inhalte und den Code Ihrer Seite. Sagen Sie uns einfach, wer Ihre Seite künftig betreut.\n\nSchade, dass Sie gehen. Wenn wir etwas besser machen können, freuen wir uns über ein kurzes Wort.\n\nMit freundlichen Grüßen\nMaximilian Steiner\nLevarex Consulting`,
    hinweise: VERTRAGSWERK_VERSION.startsWith("Entwurf") ? ["Laufzeit und Kündigungsfrist nach Baukasten; das Vertragswerk ist noch ein Entwurf. Enddatum bitte prüfen."] : [],
    meta: { projektId },
  });
  if (p.qontoAboId) {
    await inPostausgang({
      betriebId: b.id,
      projektId,
      kanal: "lastschrift",
      zweck: "lastschrift_ende",
      empfaenger: b.email ?? "(E-Mail-Adresse fehlt)",
      betreff: `Lastschrift beenden: ${b.name}`,
      text: `Qonto-Einzug ${p.qontoAboId} zum Vertragsende am ${datumDe(ende)} beenden. Danach wird nichts mehr eingezogen.`,
      meta: { projektId, aboId: p.qontoAboId, endeAm: ende.toISOString() },
    });
  }

  return ende;
}

/** Agent (täglich): Verträge, deren Ende erreicht ist, beenden und das Team an die Übergabe erinnern. */
export async function vertragsende(jetzt = new Date()): Promise<string> {
  const db = await getDb();
  const ende = await db.select().from(schema.projekte).where(and(eq(schema.projekte.status, "live"), isNotNull(schema.projekte.endeAm), lte(schema.projekte.endeAm, jetzt)));
  for (const p of ende) {
    await db.update(schema.projekte).set({ status: "beendet" }).where(eq(schema.projekte.id, p.id));
    const b = await betrieb(p.betriebId);
    await protokolliere(SYSTEM, "Vertrag beendet", b.id);
    await melde("job", false, `Vertrag beendet: ${b.name}`, "Exit-Paket übergeben (Domain, Inhalte, Code), dann Hosting abschalten. Rechnungen bleiben 8 Jahre im Archiv.");
  }
  return `${ende.length} Verträge beendet`;
}
