import { and, eq } from "drizzle-orm";
import { getDb, schema } from "../db";
import { protokolliere } from "../protokoll";
import { euro, PAKETE, PaketKey, UST } from "../pakete";
import { auswertung, nachbar, zeitraum } from "../finanzen";
import { erstelleRechnung } from "./verkauf";
import { inPostausgang } from "./postausgang";
import { neuesDokument, SYSTEM } from "./gemeinsam";

// Agenten für die Finanzen. Sie bereiten alles vor; raus geht es erst nach Qualitätskontrolle und eurer Freigabe.

const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

/** Monatlich: Rechnung über die Betreuung für jede Live-Seite (Paket S: erste 3 Monate inklusive). */
export async function betreuungsrechnungen(jetzt = new Date()): Promise<string> {
  const db = await getDb();
  const live = await db.select().from(schema.projekte).where(eq(schema.projekte.status, "live"));
  const monat = `${MONATE[jetzt.getMonth()]} ${jetzt.getFullYear()}`;
  let neu = 0;
  for (const p of live) {
    if (!p.aboAb || !p.angebotId || p.stripeAboId) continue; // Stripe-Abo rechnet selbst ab
    const [a] = await db.select().from(schema.angebote).where(eq(schema.angebote.id, p.angebotId));
    if (!a) continue;
    const monateSeitStart = (jetzt.getFullYear() - p.aboAb.getFullYear()) * 12 + jetzt.getMonth() - p.aboAb.getMonth();
    if (p.paket === "S" && monateSeitStart < 3) continue;
    const schon = (await db.select().from(schema.rechnungen).where(and(eq(schema.rechnungen.angebotId, a.id), eq(schema.rechnungen.art, "betreuung")))).some(
      (r) => r.erstelltAm.getMonth() === jetzt.getMonth() && r.erstelltAm.getFullYear() === jetzt.getFullYear(),
    );
    if (schon) continue;
    await erstelleRechnung({ betriebId: p.betriebId, angebotId: a.id, projektId: p.id, art: "betreuung", netto: a.monatlich, positionstext: `Betreuung ${PAKETE[a.paket as PaketKey].name}, ${monat}` });
    neu++;
  }
  return `${neu} Betreuungsrechnungen vorbereitet`;
}

/** Täglich: freundliche Erinnerung für Rechnungen, die seit 14 Tagen offen sind (höchstens alle 7 Tage). */
export async function zahlungserinnerungen(jetzt = new Date()): Promise<string> {
  const db = await getDb();
  const offen = await db
    .select({ r: schema.rechnungen, b: schema.betriebe })
    .from(schema.rechnungen)
    .innerJoin(schema.betriebe, eq(schema.rechnungen.betriebId, schema.betriebe.id))
    .where(eq(schema.rechnungen.status, "offen"));
  const bisher = await db.select().from(schema.postausgang).where(eq(schema.postausgang.zweck, "zahlungserinnerung"));
  let neu = 0;
  for (const { r, b } of offen) {
    const tage = Math.floor((jetzt.getTime() - r.erstelltAm.getTime()) / 864e5);
    if (tage < 14) continue;
    const letzte = bisher.filter((e) => Number(e.meta.rechnungId) === r.id).sort((x, y) => y.erstelltAm.getTime() - x.erstelltAm.getTime())[0];
    if (letzte && (letzte.status === "zur_freigabe" || jetzt.getTime() - letzte.erstelltAm.getTime() < 7 * 864e5)) continue;
    const brutto = Math.round(r.netto * (1 + UST));
    await inPostausgang({
      betriebId: b.id,
      kanal: "mail",
      zweck: "zahlungserinnerung",
      empfaenger: b.email ?? "(E-Mail-Adresse fehlt)",
      betreff: `Erinnerung: Rechnung ${r.nummer}`,
      text: `Guten Tag,\n\nvielleicht ist es im Alltag untergegangen: Unsere Rechnung ${r.nummer} über ${euro(brutto)} ist noch offen. Falls Sie schon überwiesen haben, ist diese Nachricht hinfällig.\n\nBei Fragen rufen Sie uns gern an.\n\nMit freundlichen Grüßen\nMax Steiner\nStelax Consulting`,
      erlaubteZahlen: [euro(brutto)],
      meta: { rechnungId: r.id },
    });
    neu++;
  }
  return `${neu} Zahlungserinnerungen vorbereitet`;
}

/** Quartalsweise: Finanzbericht des letzten Quartals als Mail an den Steuerberater. */
export async function steuerberaterBericht(jetzt = new Date()): Promise<string> {
  const aktuell = zeitraum(`${jetzt.getFullYear()}-Q${Math.floor(jetzt.getMonth() / 3) + 1}`);
  const z = zeitraum(nachbar(aktuell, -1));
  const a = await auswertung(z);
  const dokId = await neuesDokument({ art: "finanzbericht", titel: `Finanzbericht ${z.name}`, daten: { zeitraum: z.key, auswertung: a } });
  await inPostausgang({
    kanal: "mail",
    zweck: "finanzbericht",
    empfaenger: process.env.STEUERBERATER_EMAIL ?? "(Adresse des Steuerberaters fehlt)",
    betreff: `Stelax Consulting: Unterlagen ${z.name}`,
    text: `Guten Tag,\n\nim Anhang finden Sie unseren Finanzbericht für das ${z.name} mit allen Rechnungen und Ausgaben. Die Belege und die Listen als CSV schicken wir Ihnen gern zusätzlich oder legen sie wie gewohnt ab.\n\nViele Grüße\nMax Steiner\nStelax Consulting`,
    anhaenge: [dokId],
    hinweise: a.ausgaben.some((x) => !x.belegName) ? [`${a.ausgaben.filter((x) => !x.belegName).length} Ausgaben ohne Beleg. Vor dem Versand ergänzen.`] : [],
    meta: { zeitraum: z.key },
  });
  await protokolliere(SYSTEM, `Finanzbericht ${z.name} vorbereitet`);
  return `Bericht ${z.name} liegt zur Freigabe`;
}
