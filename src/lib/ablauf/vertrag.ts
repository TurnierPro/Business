import { and, eq, isNotNull, lte } from "drizzle-orm";
import { getDb, schema } from "../db";
import { protokolliere } from "../protokoll";
import { melde } from "../adapters/push";
import { zahlungUeberStripe } from "../adapters/stripe";
import { portalLink } from "../kundenportal";
import { datumDe } from "../docs/basis";
import { PAKETE, PaketKey, euro, UST } from "../pakete";
import { ABNAHME_FRIST_TAGE } from "../recht";
import { inPostausgang } from "./postausgang";
import { hakeAb } from "./checkliste";
import { anschrift, betrieb, neuesDokument, SYSTEM } from "./gemeinsam";
import { erstelleRechnung } from "./verkauf";

// Vertrag nach dem Livegang: Abnahme (§ 640 BGB), Schlusszahlung erst nach Abnahme, Kündigung und Vertragsende.

type Projekt = typeof schema.projekte.$inferSelect;

async function projekt(id: number): Promise<Projekt> {
  const db = await getDb();
  const [p] = await db.select().from(schema.projekte).where(eq(schema.projekte.id, id));
  if (!p) throw new Error("Projekt nicht gefunden");
  return p;
}

/** Bittet den Kunden im Kundenportal um Abnahme. Die Frist beginnt, sobald die Mail freigegeben und verschickt ist. */
export async function abnahmeAnfordern(projektId: number, wer: string): Promise<number> {
  const p = await projekt(projektId);
  if (p.status !== "live") throw new Error("Abnahme gibt es erst, wenn die Seite live ist.");
  if (p.abnahmeStatus === "offen") throw new Error("Die Abnahme ist schon angefordert.");
  if (p.abnahmeStatus && p.abnahmeStatus !== "verweigert") throw new Error("Das Projekt ist schon abgenommen.");
  const db = await getDb();
  await db.update(schema.projekte).set({ abnahmeStatus: "offen", abnahmeFrist: null, abnahmeMaengel: p.abnahmeStatus === "verweigert" ? p.abnahmeMaengel : null }).where(eq(schema.projekte.id, projektId));
  const b = await betrieb(p.betriebId);
  const erneut = p.abnahmeStatus === "verweigert";
  const id = await inPostausgang({
    betriebId: b.id,
    projektId,
    kanal: "mail",
    zweck: "abnahme_aufforderung",
    empfaenger: b.email ?? "(E-Mail-Adresse fehlt)",
    betreff: erneut ? "Mängel behoben: Bitte nehmen Sie Ihre Website ab" : "Ihre Website ist fertig: Bitte nehmen Sie sie ab",
    text: `Guten Tag,\n\n${erneut ? "die genannten Mängel sind behoben." : "Ihre Website ist fertig und online."}${p.domain ? ` Sie finden sie unter ${p.domain}.` : ""} Bitte sehen Sie sich alles in Ruhe an und erklären Sie die Abnahme in Ihrem Kundenportal:\n${await portalLink(b.id)}\n\nDort können Sie abnehmen, unter Vorbehalt mit Mängeln abnehmen oder mit Begründung verweigern. Bitte melden Sie sich innerhalb von ${ABNAHME_FRIST_TAGE} Tagen. Nennen Sie in dieser Frist keinen Mangel, gilt die Website als abgenommen (§ 640 Abs. 2 BGB).\n\nMit freundlichen Grüßen\nMax Steiner\nStelax Consulting`,
    erlaubteZahlen: [String(ABNAHME_FRIST_TAGE)],
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

/** Abnahmeprotokoll an den Kunden und Schlusszahlung vorbereiten. Beides geht durch Qualitätskontrolle und Freigabe. */
async function nachAbnahme(projektId: number): Promise<void> {
  const p = await projekt(projektId);
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
    text: `Guten Tag,\n\n${ergebnis === "fiktion" ? `die Frist zur Abnahme ist am ${datumDe(p.abnahmeFrist ?? new Date())} abgelaufen, ohne dass Sie einen Mangel genannt haben. Damit gilt Ihre Website als abgenommen.` : ergebnis === "vorbehalt" ? "vielen Dank für die Abnahme. Die genannten Mängel beheben wir zeitnah und melden uns mit einem Termin." : "vielen Dank für die Abnahme Ihrer Website."} Im Anhang finden Sie das Abnahmeprotokoll. Es liegt auch in Ihrem Kundenportal.\n\nMit freundlichen Grüßen\nMax Steiner\nStelax Consulting`,
    anhaenge: [protokollId],
    meta: { projektId },
  });
  if (!p.angebotId) return;
  const [a] = await db.select().from(schema.angebote).where(eq(schema.angebote.id, p.angebotId));
  if (!a) return;
  await db.update(schema.angebote).set({ status: "abgeschlossen" }).where(eq(schema.angebote.id, a.id));
  const anzahlung = Math.round(a.einmalig / 2);
  const rest = a.einmalig - anzahlung;
  if (zahlungUeberStripe()) {
    // Geld bewegt sich nur nach Freigabe
    const brutto = Math.round(rest * (1 + UST));
    await inPostausgang({
      betriebId: b.id,
      projektId,
      kanal: "zahlung",
      zweck: "schlusszahlung",
      empfaenger: `Stripe: ${b.name}`,
      betreff: `Schlusszahlung einziehen: ${b.name}`,
      text: `Abnahme ${ergebnis === "fiktion" ? "durch Fristablauf" : "erklärt"} am ${am}. Schlusszahlung 50 % ${name}: ${euro(rest)} netto (${euro(brutto)} brutto). Wird mit der gespeicherten Zahlungsart eingezogen, Stripe schickt die Rechnung an den Kunden.`,
      noetigeFreigaben: brutto > 1_000_000 ? 2 : 1,
      meta: { angebotId: a.id, netto: rest, beschreibung: `Schlusszahlung 50 % ${name}, Abnahme ${am}` },
    });
    return;
  }
  // Schlussrechnung: Gesamtleistung minus Anzahlung und darauf entfallende Steuer (§ 14 Abs. 5 UStG)
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
      { text: `abzüglich Anzahlung${anz ? `, Rechnung ${anz.nummer} vom ${datumDe(anz.erstelltAm)}` : ""} (darauf entfallende USt ${euro(Math.round(anzNetto * UST))})`, netto: -anzNetto },
    ],
    leistung: `Abnahme am ${am}`,
  });
}

/** Kündigung der Betreuung erfassen. Annahme: 12 Monate Mindestlaufzeit ab Betreuungsstart, danach zum Ende des Folgemonats (in den AGB prüfen). */
export async function kuendigungErfassen(projektId: number, wer: string, eingang = new Date()): Promise<Date> {
  const p = await projekt(projektId);
  if (p.gekuendigtAm) throw new Error("Die Kündigung ist schon erfasst.");
  const start = p.aboAb ?? p.liveAm ?? new Date();
  const mindest = new Date(start.getFullYear(), start.getMonth() + 12, start.getDate());
  const folgemonat = new Date(eingang.getFullYear(), eingang.getMonth() + 2, 0, 23, 59);
  const ende = mindest > folgemonat ? new Date(mindest.getFullYear(), mindest.getMonth() + 1, 0, 23, 59) : folgemonat;
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
    text: `Guten Tag,\n\nwir bestätigen Ihre Kündigung der Betreuung vom ${datumDe(eingang)}. Die Betreuung endet am ${datumDe(ende)}. Bis dahin kümmern wir uns wie gewohnt um Ihre Website.\n\nZum Ende übergeben wir Ihnen auf Wunsch alles, was Sie für einen Wechsel brauchen: Zugang zur Domain, die Inhalte und den Code Ihrer Seite. Sagen Sie uns einfach, wer Ihre Seite künftig betreut.\n\nSchade, dass Sie gehen. Wenn wir etwas besser machen können, freuen wir uns über ein kurzes Wort.\n\nMit freundlichen Grüßen\nMax Steiner\nStelax Consulting`,
    hinweise: ["Kündigungsfrist und Mindestlaufzeit sind eine Annahme, bis die AGB final sind. Enddatum bitte prüfen."],
    meta: { projektId },
  });
  if (p.stripeAboId) {
    await inPostausgang({
      betriebId: b.id,
      projektId,
      kanal: "zahlung",
      zweck: "betreuung_ende",
      empfaenger: `Stripe: ${b.name}`,
      betreff: `Betreuung beenden: ${b.name}`,
      text: `Stripe-Abo ${p.stripeAboId} endet am ${datumDe(ende)}. Danach wird nichts mehr eingezogen.`,
      meta: { projektId, aboId: p.stripeAboId, endeAm: ende.toISOString() },
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
