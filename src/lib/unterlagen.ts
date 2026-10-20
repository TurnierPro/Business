import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import daten from "./unterlagen-daten.json";
import { getDb, schema } from "./db";
import { datenOrdner } from "./pfade";
import { protokolliere } from "./protokoll";

// Unterlagen-Register aus dem Bericht „Dokumente für die Nexova GmbH“ (docs/unterlagen-bericht.md).
// Keine Rechtsberatung: Wo Anwalt, Steuerberater oder Notar steht, prüfen diese.

export type Unterlage = (typeof daten)[number];
export const UNTERLAGEN: Unterlage[] = daten;

export const ETAPPEN: { nr: number; name: string; bis: string }[] = [
  { nr: 1, name: "Vor dem Notartermin", bis: "2026-12-15" },
  { nr: 2, name: "Bei Gründung", bis: "2027-01-31" },
  { nr: 3, name: "Vor dem ersten Brief und Kunden", bis: "2027-01-15" },
  { nr: 4, name: "Innerhalb von 3 Monaten", bis: "2027-04-15" },
  { nr: 5, name: "Später, mit Anlass", bis: "2028-11-30" },
  { nr: 0, name: "Entfällt für Nexova", bis: "" },
];

// Was Nexova OS bereits technisch abdeckt (rechtliche Prüfung bleibt offen)
export const IN_NEXOVA_OS: Record<string, string> = {
  "Werbe-Sperrliste": "Sperrliste mit automatischem Abgleich vor jedem Versand (Leads → Widerspruch)",
  "Art.-14/21-Hinweis im Akquisebrief": "Steht in jedem Akquise-Brief (Vorlage Brief)",
  "Protokoll der Datenquelle je Lead": "Quelle und Datenquelle beim Lead gespeichert",
  "Auftragsbestätigung": "Entsteht automatisch nach der Annahme, geht durch Freigabe",
  "Abnahmeprotokoll": "Abnahme im Kundenportal, Abnahmefiktion nach Frist, Protokoll als PDF",
  "Mahnvorlagen": "Mahn-Agent: Erinnerung, 1. Mahnung mit Verzugszins und 40-€-Pauschale, letzte Mahnung",
  "E-Signatur- bzw. Portal-Annahme": "Annahme im Kundenportal mit Name, Zeitstempel, AGB-Version, Unternehmer-Bestätigung",
  "Unternehmer-Bestätigung": "Pflichthäkchen bei der Annahme im Kundenportal",
  "Kunden-Onboarding-Fragebogen": "Kundenportal: Inhalte plus Mitarbeiterzahl, Umsatz, Terminbuchung (BFSG)",
  "Einwilligung für Gesprächsaufzeichnung": "Aufnahme nur mit bestätigter Einwilligung, Löschung nach Versand",
  "Verzeichnis als Auftragsverarbeiter": "System → Verarbeitungen je Kunde",
  "Verzeichnis der Verarbeitungstätigkeiten als Verantwortlicher": "Datenschutz → Verzeichnis (Entwurf, mit Berater prüfen)",
  "Datenpannen-Runbook": "Datenschutz → Datenpannen mit 72-Stunden-Frist, Push und Hinweis auf Heute",
  "Löschkonzept": "Datenschutz → Löschkonzept; der Aufräum-Agent löscht täglich",
  "TOM-Dokumentation": "Datenschutz → Maßnahmen (Art. 32), technisch umgesetzt und getestet",
  "Richtlinie Passwörter, MFA": "Technisch: 12 Zeichen, Zwei-Faktor, Sperre nach Fehlversuchen; Richtlinie für Geräte noch schreiben",
  "Zugriffs- und Berechtigungskonzept": "Rollen in Einstellungen; Offboarding: Konto sperren, überall abmelden, API-Schlüssel widerrufen",
  "Backup-Konzept": "Tägliches Backup, sonntägliche Probe-Rücksicherung",
  "Prozess für Betroffenenanfragen": "Beim Betrieb: Datenauskunft exportieren, alle Daten löschen",
  "Rechnungsvorlagen": "Anzahlung, Schlussrechnung mit Abzug, Betreuung; zahlbar bis Datum",
  "Auftrag zum Domain-Umzug": "Kundenportal: Auftrag per Häkchen mit Zeitpunkt; Umzugs-Agent mit Bestandsaufnahme und Anleitung",
  "Zusicherung des Kunden zu Rechten": "Pflichthäkchen im Kundenportal beim Hochladen der Inhalte",
  "Mustertext Kündigung Alt-Hosting": "Kommt automatisch mit der Nachricht, dass die Umstellung geklappt hat",
  "Briefbogen, E-Mail-Signatur": "Pflichtangaben nach § 35a GmbHG in Fußzeile und Mail-Signatur (brand/tokens.json)",
};

export function inNexovaOs(u: Unterlage): string | null {
  const treffer = Object.keys(IN_NEXOVA_OS).find((k) => u.titel.startsWith(k) || u.titel.includes(k));
  return treffer ? IN_NEXOVA_OS[treffer] : null;
}

export const FRISTEN: { datum: string; was: string; quelle: string }[] = [
  { datum: "2026-12-02", was: "KI-VO Art. 50 Abs. 2: Markierung synthetischer Inhalte (Übergang Altsysteme endet)", quelle: "AI-Omnibus" },
  { datum: "2026-12-15", was: "Notartermin (Annahme): Satzung und Gesellschaftervereinbarung fertig, vorher anwaltlich geprüft", quelle: "Fahrplan Etappe 1" },
  { datum: "2027-01-01", was: "Basiszins-Anpassung: Verzugszins in Mahnvorlagen aktualisieren (bisher 1,52 % + 9 = 10,52 %)", quelle: "§ 247 BGB" },
  { datum: "2027-01-15", was: "Binnen 1 Woche nach Eröffnung: VBG anmelden; unverzüglich Transparenzregister, Gewerbeanmeldung", quelle: "§ 192 SGB VII, § 20 GwG" },
  { datum: "2027-01-31", was: "Binnen 1 Monat: Fragebogen zur steuerlichen Erfassung (Ist-Versteuerung, Dauerfristverlängerung, Wirtschaftsjahr)", quelle: "§ 138 AO" },
  { datum: "2027-02-10", was: "Sondervorauszahlung bei Dauerfristverlängerung", quelle: "§ 18 UStG" },
  { datum: "2027-04-15", was: "Erste VBG-Abrechnung; Etappe 4 abgeschlossen (GoBD, Löschkonzept, Mahnwesen, Liquiditätsplan)", quelle: "Fahrplan Etappe 4" },
  { datum: "2027-11-30", was: "Ende des ersten Rumpf-Wirtschaftsjahrs", quelle: "Satzung" },
  { datum: "2027-12-02", was: "Hochrisiko-Pflichten für Recruiting-KI (keine Rangfolge von Bewerbern bis dahin)", quelle: "KI-VO Anhang III" },
  { datum: "2028-01-01", was: "E-Rechnung: Versand für alle B2B-Rechnungen Pflicht", quelle: "§ 14 UStG" },
  { datum: "2028-05-31", was: "Jahresabschluss aufstellen (Kleinstkapitalgesellschaft)", quelle: "§ 264 HGB" },
  { datum: "2028-11-30", was: "Jahresabschluss spätestens hinterlegen", quelle: "§ 325 HGB" },
];

export const ENTSCHEIDUNGEN: { titel: string; text: string; wer: string }[] = [
  { titel: "Stripe zieht nur widerrufbare Basislastschriften ein", text: "8 Wochen Rückgaberecht auch für Firmen; Limit 10.000 € je Woche für Neukunden. Bericht empfiehlt Projektzahlungen per Überweisung und Stripe nur für Abos. Umschalten: ZAHLUNGSWEG=ueberweisung.", wer: "Gründer, IT-Anwalt (AGB-Klauseln)" },
  { titel: "50 % Anzahlung vor jeder Leistung", text: "Im Angebot individuell vereinbaren oder an eine Vorleistung (Konzept, Design-Entwurf) knüpfen. Schlusszahlung erst nach Abnahme.", wer: "IT-Anwalt" },
  { titel: "Stripe-Rechnungen und E-Rechnung", text: "Erzeugt Stripe konforme ZUGFeRD/XRechnung? Sonst Rechnungen aus lexoffice/sevDesk und Stripe nur zum Einzug.", wer: "Steuerberater" },
  { titel: "n8n-Lizenz für Kunden-Hosting", text: "Sustainable Use License: Betrieb für Kunden gegen Entgelt erlaubt? Vor Bankgespräch klären.", wer: "IT-Anwalt" },
  { titel: "Rein KI-generierte Inhalte", text: "Nutzungsrechte nur einräumen, „soweit solche bestehen“; Design-System und Vorlagen über NDA und Geheimnisschutz sichern.", wer: "IT-Anwalt" },
  { titel: "Keine KI-Rangfolge von Bewerbern", text: "Karriereseiten: KI fasst zusammen und strukturiert, sortiert nicht, rankt nicht, lehnt nicht ab.", wer: "Produktregel" },
  { titel: "USt-Voranmeldung 2027", text: "Neugründer-Aussetzung über 2026 hinaus verlängert? Monatlich ohnehin sinnvoll.", wer: "Steuerberater" },
  { titel: "Website-Anfragen sofort an den Kunden weiterleiten?", text: "Heute nur im Kundenportal sichtbar. Automatische Weiterleitung per Mail ginge am Postausgang vorbei: als Ausnahme erlauben?", wer: "Gründer" },
  { titel: "Datenbank und Speicherort", text: "PostgreSQL auf Hetzner (Deutschland) oder Supabase; Kundendaten, Belege und Archiv-PDFs gehören in die EU mit AV-Vertrag.", wer: "Gründer" },
];

export async function stand() {
  const db = await getDb();
  const zeilen = await db.select().from(schema.unterlagen);
  return new Map(zeilen.map((z) => [z.key, z]));
}

export async function speichern(key: string, o: { status: string; notiz: string; datei: File | null }, wer: string): Promise<void> {
  if (!UNTERLAGEN.some((u) => u.key === key)) throw new Error("Unbekannte Unterlage");
  if (!["offen", "in_arbeit", "erledigt", "entfaellt"].includes(o.status)) throw new Error("Unbekannter Status");
  let datei: { pfad: string; name: string } | null = null;
  if (o.datei && o.datei.size > 0) {
    const name = `${key}-${Date.now()}-${o.datei.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-60)}`;
    const pfad = path.join(datenOrdner("unterlagen"), name);
    fs.writeFileSync(pfad, Buffer.from(await o.datei.arrayBuffer()));
    datei = { pfad, name: o.datei.name };
  }
  const db = await getDb();
  const werte = { status: o.status, notiz: o.notiz || null, geaendertVon: wer, geaendertAm: new Date(), ...(datei ? { dateiPfad: datei.pfad, dateiName: datei.name } : {}) };
  await db.insert(schema.unterlagen).values({ key, ...werte }).onConflictDoUpdate({ target: schema.unterlagen.key, set: werte });
  await protokolliere(wer, `Unterlage ${key}: ${o.status}`);
}

export async function datei(key: string) {
  const db = await getDb();
  const [z] = await db.select().from(schema.unterlagen).where(eq(schema.unterlagen.key, key));
  return z?.dateiPfad && fs.existsSync(z.dateiPfad) ? { inhalt: fs.readFileSync(z.dateiPfad), name: z.dateiName ?? "datei" } : null;
}
