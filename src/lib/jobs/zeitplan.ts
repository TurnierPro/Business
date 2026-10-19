import { eq } from "drizzle-orm";
import { getDb, schema } from "../db";
import { einreihen } from "./warteschlange";

// Feste Termine. Die Zeiten gelten in deutscher Zeit.

type Regel = { name: string; art: string; faellig: (jetzt: Date, zuletzt: Date | null) => boolean };

const berlin = (d: Date) => {
  const teile = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", weekday: "short", hour: "numeric", year: "numeric", month: "2-digit", day: "2-digit", hourCycle: "h23" }).formatToParts(d);
  const w = (t: string) => teile.find((p) => p.type === t)?.value ?? "";
  return { tag: `${w("year")}-${w("month")}-${w("day")}`, stunde: Number(w("hour")), wochentag: w("weekday") };
};

const taeglichAb = (stunde: number) => (jetzt: Date, zuletzt: Date | null) => {
  const j = berlin(jetzt);
  return j.stunde >= stunde && (!zuletzt || berlin(zuletzt).tag !== j.tag);
};
const woechentlichAb = (wochentag: string, stunde: number) => (jetzt: Date, zuletzt: Date | null) => {
  const j = berlin(jetzt);
  return j.wochentag.startsWith(wochentag) && j.stunde >= stunde && (!zuletzt || jetzt.getTime() - zuletzt.getTime() > 2 * 864e5);
};
const monatsanfangAb = (stunde: number, nurQuartal = false) => (jetzt: Date, zuletzt: Date | null) => {
  const j = berlin(jetzt);
  const [, monat, tag] = j.tag.split("-").map(Number);
  if (nurQuartal && ![1, 4, 7, 10].includes(monat)) return false;
  return tag <= 7 && j.stunde >= stunde && (!zuletzt || jetzt.getTime() - zuletzt.getTime() > 20 * 864e5);
};
const alleMinuten = (min: number) => (jetzt: Date, zuletzt: Date | null) => !zuletzt || jetzt.getTime() - zuletzt.getTime() >= min * 60_000;

export const REGELN: Regel[] = [
  { name: "Wochenlauf Leads (Mo 6 Uhr)", art: "wochenlauf", faellig: woechentlichAb("Mo", 6) },
  { name: "Backup (täglich 2 Uhr)", art: "backup", faellig: taeglichAb(2) },
  { name: "Aufräumen (täglich 3 Uhr)", art: "aufraeumen", faellig: taeglichAb(3) },
  { name: "Probe-Rücksicherung (So 4 Uhr)", art: "ruecksicherung", faellig: woechentlichAb("So", 4) },
  { name: "Tagesbericht (täglich 7 Uhr)", art: "tagesbericht", faellig: taeglichAb(7) },
  { name: "Betreuungsrechnungen (Monatsanfang)", art: "betreuungsrechnungen", faellig: monatsanfangAb(6) },
  { name: "Erinnerungen und Mahnungen (täglich 8 Uhr)", art: "zahlungserinnerungen", faellig: taeglichAb(8) },
  { name: "Abnahme nach Fristablauf (täglich 5 Uhr)", art: "abnahmefiktion", faellig: taeglichAb(5) },
  { name: "Vertragsende (täglich 5 Uhr)", art: "vertragsende", faellig: taeglichAb(5) },
  { name: "Monatsreports für Kunden (Monatsanfang)", art: "monatsreports", faellig: monatsanfangAb(7) },
  { name: "Bericht an Steuerberater (Quartalsanfang)", art: "steuerberater", faellig: monatsanfangAb(8, true) },
  { name: "Erreichbarkeit (alle 10 Minuten)", art: "erreichbarkeit", faellig: alleMinuten(10) },
];

export async function zeitplanPruefen(jetzt = new Date()): Promise<void> {
  const db = await getDb();
  for (const r of REGELN) {
    const [eintrag] = await db.select().from(schema.zeitplan).where(eq(schema.zeitplan.name, r.art));
    if (!r.faellig(jetzt, eintrag?.zuletztAm ?? null)) continue;
    await einreihen(r.art, { geplant: true });
    if (eintrag) await db.update(schema.zeitplan).set({ zuletztAm: jetzt }).where(eq(schema.zeitplan.name, r.art));
    else await db.insert(schema.zeitplan).values({ name: r.art, zuletztAm: jetzt });
  }
}
