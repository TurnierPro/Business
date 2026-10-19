import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "../db";
import { protokolliere } from "../protokoll";
import { euro, PAKETE, PaketKey, UST } from "../pakete";
import { auswertung, nachbar, zeitraum } from "../finanzen";
import { erstelleRechnung } from "./verkauf";
import { inPostausgang, type NeuerEintrag } from "./postausgang";
import { datumDe } from "../docs/basis";
import { BASISZINS, basiszinsVeraltet, VERZUGSPAUSCHALE, VERZUGSZINS_PROZENT, verzugszinsen, ZAHLUNGSZIEL_TAGE } from "../recht";
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
    if (p.endeAm && p.endeAm < jetzt) continue; // Vertrag beendet
    const [a] = await db.select().from(schema.angebote).where(eq(schema.angebote.id, p.angebotId));
    if (!a) continue;
    const monateSeitStart = (jetzt.getFullYear() - p.aboAb.getFullYear()) * 12 + jetzt.getMonth() - p.aboAb.getMonth();
    if (p.paket === "S" && monateSeitStart < 3) continue;
    const schon = (await db.select().from(schema.rechnungen).where(and(eq(schema.rechnungen.angebotId, a.id), eq(schema.rechnungen.art, "betreuung")))).some(
      (r) => r.erstelltAm.getMonth() === jetzt.getMonth() && r.erstelltAm.getFullYear() === jetzt.getFullYear(),
    );
    if (schon) continue;
    await erstelleRechnung({ betriebId: p.betriebId, angebotId: a.id, projektId: p.id, art: "betreuung", netto: a.monatlich, positionstext: `Betreuung ${PAKETE[a.paket as PaketKey].name}, ${monat}`, leistung: monat });
    neu++;
  }
  return `${neu} Betreuungsrechnungen vorbereitet`;
}

// Mahnstufen: 0 → Erinnerung (3 Tage nach Fälligkeit) → 1. Mahnung (10 Tage später) → letzte Mahnung (10 Tage später).
const STUFEN = [
  { zweck: "zahlungserinnerung", abTage: 3 },
  { zweck: "mahnung1", abTage: 10 },
  { zweck: "mahnung2", abTage: 10 },
] as const;

/** Täglich: Mahn-Agent. Bereitet die nächste Stufe vor; raus geht sie erst nach Freigabe. */
export async function zahlungserinnerungen(jetzt = new Date()): Promise<string> {
  const db = await getDb();
  const offen = await db
    .select({ r: schema.rechnungen, b: schema.betriebe })
    .from(schema.rechnungen)
    .innerJoin(schema.betriebe, eq(schema.rechnungen.betriebId, schema.betriebe.id))
    .where(and(eq(schema.rechnungen.status, "offen"), eq(schema.rechnungen.quelle, "eigen")));
  const bisher = await db.select().from(schema.postausgang).where(inArray(schema.postausgang.zweck, STUFEN.map((x) => x.zweck)));
  let neu = 0;
  for (const { r, b } of offen) {
    if (r.mahnstufe >= STUFEN.length) continue;
    const stufe = STUFEN[r.mahnstufe];
    const faellig = r.faelligAm ?? new Date(r.erstelltAm.getTime() + ZAHLUNGSZIEL_TAGE * 864e5);
    const seit = r.mahnstufe === 0 ? faellig : (r.gemahntAm ?? faellig);
    if (jetzt.getTime() - seit.getTime() < stufe.abTage * 864e5) continue;
    // Nicht doppelt: offene oder kürzlich abgelehnte Einträge dieser Stufe abwarten
    const vorhanden = bisher.filter((e) => Number(e.meta.rechnungId) === r.id && e.zweck === stufe.zweck);
    if (vorhanden.some((e) => e.status === "zur_freigabe" || e.status === "freigegeben" || jetzt.getTime() - e.erstelltAm.getTime() < 7 * 864e5)) continue;
    await inPostausgang(mahnung(r, b, stufe.zweck, faellig, jetzt));
    neu++;
  }
  return `${neu} Erinnerungen und Mahnungen vorbereitet`;
}

function mahnung(r: typeof schema.rechnungen.$inferSelect, b: typeof schema.betriebe.$inferSelect, zweck: (typeof STUFEN)[number]["zweck"], faellig: Date, jetzt: Date): NeuerEintrag {
  const brutto = Math.round(r.netto * (1 + UST));
  const tage = Math.max(0, Math.floor((jetzt.getTime() - faellig.getTime()) / 864e5));
  const zinsen = verzugszinsen(brutto, tage);
  const frist = datumDe(new Date(jetzt.getTime() + 7 * 864e5));
  const gruss = "\n\nMit freundlichen Grüßen\nMax Steiner\nStelax Consulting";
  const forderung = `Rechnungsbetrag ${euro(brutto)}\nVerzugszinsen ${VERZUGSZINS_PROZENT.toLocaleString("de-DE")} % p. a. für ${tage} Tage: ${euro(zinsen)}\nPauschale nach § 288 Abs. 5 BGB: ${euro(VERZUGSPAUSCHALE)}\nGesamt: ${euro(brutto + zinsen + VERZUGSPAUSCHALE)}`;
  const texte = {
    zahlungserinnerung: {
      betreff: `Erinnerung: Rechnung ${r.nummer}`,
      text: `Guten Tag,\n\nvielleicht ist es im Alltag untergegangen: Unsere Rechnung ${r.nummer} über ${euro(brutto)} war am ${datumDe(faellig)} fällig und ist noch offen. Bitte überweisen Sie den Betrag bis zum ${frist}. Falls Sie schon überwiesen haben, ist diese Nachricht hinfällig.\n\nBei Fragen rufen Sie uns gern an.${gruss}`,
    },
    mahnung1: {
      betreff: `1. Mahnung: Rechnung ${r.nummer}`,
      text: `Guten Tag,\n\nunsere Rechnung ${r.nummer} war am ${datumDe(faellig)} fällig. Trotz Erinnerung ist bisher keine Zahlung eingegangen. Seit dem Fälligkeitsdatum befinden Sie sich in Verzug (§ 286 BGB). Offen sind:\n\n${forderung}\n\nBitte überweisen Sie den Gesamtbetrag bis zum ${frist}. Verwendungszweck: ${r.nummer}. Wenn es ein Problem gibt, rufen Sie uns bitte an. Dann finden wir eine Lösung.${gruss}`,
    },
    mahnung2: {
      betreff: `Letzte Mahnung: Rechnung ${r.nummer}`,
      text: `Guten Tag,\n\nauf unsere Erinnerung und unsere 1. Mahnung zur Rechnung ${r.nummer} haben wir keine Zahlung erhalten. Offen sind:\n\n${forderung}\n\nBitte überweisen Sie den Gesamtbetrag bis zum ${frist}. Geht bis dahin keine Zahlung ein, beantragen wir einen gerichtlichen Mahnbescheid. Das möchten wir gern vermeiden. Rufen Sie uns an, wenn Sie Fragen haben.${gruss}`,
    },
  }[zweck];
  return {
    betriebId: b.id,
    kanal: "mail",
    zweck,
    empfaenger: b.email ?? "(E-Mail-Adresse fehlt)",
    betreff: texte.betreff,
    text: texte.text,
    erlaubteZahlen: [euro(brutto), euro(zinsen), euro(VERZUGSPAUSCHALE), euro(brutto + zinsen + VERZUGSPAUSCHALE), String(tage), VERZUGSZINS_PROZENT.toLocaleString("de-DE")],
    hinweise: [
      ...(zweck !== "zahlungserinnerung" ? ["Vor dem Versand: Zahlungseingang auf dem Konto prüfen."] : []),
      ...(zweck !== "zahlungserinnerung" && basiszinsVeraltet(jetzt) ? [`Basiszins ist seit ${BASISZINS.naechsteAnpassung} neu festgesetzt. Wert in src/lib/recht.ts aktualisieren.`] : []),
    ],
    meta: { rechnungId: r.id, tage, zinsen },
  };
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
