import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { getDb, schema } from "../db";
import { protokolliere } from "../protokoll";
import { systemAufgabe, systemAufgabeErledigt, VERTRIEB } from "./crm";
import { istGesperrt } from "./postausgang";

// Vertrieb vor Ort nach Dok. 39: Besuchsplanung, Messbogen, Zwischenauswertung und Gate der Beweisphase.
// Ehrlich zählen: „sicher“ ist eine Unterschrift erst ohne Rücktritt.

export const BEWEISPHASE = { von: new Date("2027-01-04T00:00:00+01:00"), bis: new Date("2027-01-29T23:59:59+01:00"), zielBesuche: 100, zwischenNach: 50 };

export const ERGEBNISSE: Record<string, string> = {
  unterschrift: "Unterschrift",
  folgetermin: "Folgetermin vereinbart",
  ueberlegt: "Überlegt es sich",
  kein_interesse: "Kein Interesse",
  nicht_angetroffen: "Inhaber nicht angetroffen",
};

export const KONTAKT: Record<string, string> = { keine: "keine Einwilligung", mail: "E-Mail ausdrücklich gewünscht", telefon: "Anruf ausdrücklich gewünscht", brief: "Brief" };

/** Gate am Ende der Beweisphase (sichere Unterschriften). Wirkt nicht auf das Gehalt, das regelt allein die Gehaltsregel. */
export function gateStufe(sicher: number): { stufe: string; empfehlung: string } {
  if (sicher <= 2) return { stufe: "unter Minimal", empfehlung: "Besuche ohne Termin stoppen, Brief mit QR-Code und Termin; Kurswechsel spätestens im Juni." };
  if (sicher <= 5) return { stufe: "Minimal", empfehlung: "Weiter wie geplant." };
  if (sicher <= 9) return { stufe: "Neutral", empfehlung: "Personalplanung nach dem Szenario Neutral." };
  return { stufe: "Best Case", empfehlung: "Erste Einstellung vorbereiten." };
}

/** Freitag ab 12 Uhr keine Besuche (Dok. 39). */
export function besuchErlaubt(am: Date): boolean {
  const t = new Date(am.toLocaleString("en-US", { timeZone: "Europe/Berlin" }));
  return !(t.getDay() === 5 && t.getHours() >= 12) && t.getDay() !== 0 && t.getDay() !== 6;
}

export type Messbogen = {
  betriebId: number;
  am?: Date;
  inhaberAngetroffen: boolean;
  dauerMin?: number | null;
  einwand?: string;
  paket?: string;
  variante?: string;
  ergebnis: string;
  ruecktritt?: boolean;
  einwilligungKontakt?: string;
  art14Info: boolean;
  preistest?: string;
};

export async function besuchErfassen(m: Messbogen, wer: string): Promise<number> {
  if (!ERGEBNISSE[m.ergebnis]) throw new Error("Bitte ein Ergebnis wählen.");
  if (m.ergebnis === "nicht_angetroffen") m = { ...m, inhaberAngetroffen: false };
  if (m.ergebnis === "unterschrift" && !m.inhaberAngetroffen) throw new Error("Unterschrift nur vom Inhaber oder einer vertretungsberechtigten Person.");
  if (m.ergebnis === "unterschrift" && !["A", "B"].includes(m.variante ?? "")) throw new Error("Bei Unterschrift die Variante (A oder B) angeben.");
  if (m.ergebnis === "unterschrift" && !["KOMPAKT", "PROFESSIONAL"].includes(m.paket ?? "")) throw new Error("Bei Unterschrift das Paket angeben.");
  if (m.einwilligungKontakt && !KONTAKT[m.einwilligungKontakt]) throw new Error("Einwilligung ungültig.");
  if (await istGesperrt(m.betriebId)) throw new Error("Betrieb steht auf der Sperrliste.");
  const db = await getDb();
  const [b] = await db.select().from(schema.betriebe).where(eq(schema.betriebe.id, m.betriebId));
  if (!b) throw new Error("Betrieb nicht gefunden.");
  const [row] = await db
    .insert(schema.besuche)
    .values({
      betriebId: m.betriebId,
      am: m.am ?? new Date(),
      inhaberAngetroffen: m.inhaberAngetroffen,
      dauerMin: m.dauerMin ?? null,
      einwand: m.einwand?.trim() || null,
      paket: m.paket || null,
      variante: m.variante || null,
      ergebnis: m.ergebnis,
      ruecktritt: !!m.ruecktritt,
      einwilligungKontakt: m.einwilligungKontakt || "keine",
      art14Info: m.art14Info,
      preistest: m.preistest?.trim() || null,
      erstelltVon: wer,
    })
    .returning();
  await protokolliere(wer, `Besuch erfasst: ${ERGEBNISSE[m.ergebnis]}`, b.id, m.einwand || undefined);
  if (m.ergebnis !== "nicht_angetroffen") await systemAufgabeErledigt(b.id, "Besuch vor Ort");
  // Nachfassen nur mit Zusage (§ 7 UWG): kein Mail-Nachfassen ohne ausdrücklichen Wunsch
  if (m.ergebnis === "folgetermin") await systemAufgabe({ betriebId: b.id, titel: "Folgetermin vorbereiten", text: "Unterlagen und Demo dabeihaben. Einwand vom letzten Mal klären.", inTagen: 7, zustaendig: VERTRIEB });
  if (m.ergebnis === "ueberlegt" && m.einwilligungKontakt === "mail") await systemAufgabe({ betriebId: b.id, titel: "Nachfass-Mail N1 entwerfen", text: "Der Inhaber wollte ausdrücklich eine E-Mail. Binnen 2 Werktagen, Entwurf über den Postausgang.", inTagen: 2, zustaendig: VERTRIEB });
  if (m.ergebnis === "ueberlegt" && m.einwilligungKontakt === "telefon") await systemAufgabe({ betriebId: b.id, titel: "Nachfassen per Anruf", text: "Anruf war ausdrücklich gewünscht.", inTagen: 7, zustaendig: VERTRIEB });
  if (m.ergebnis === "nicht_angetroffen") await db.update(schema.betriebe).set({ besuchAb: new Date(Date.now() + 7 * 864e5) }).where(eq(schema.betriebe.id, b.id));
  if (m.ergebnis === "kein_interesse") await db.update(schema.betriebe).set({ status: "nicht_interessant" }).where(eq(schema.betriebe.id, b.id));
  return row.id;
}

/** Zwischenauswertung und Gate für einen Zeitraum (Standard: Beweisphase). */
export async function auswertung(von = BEWEISPHASE.von, bis = BEWEISPHASE.bis) {
  const db = await getDb();
  const liste = await db.select().from(schema.besuche).where(and(gte(schema.besuche.am, von), lte(schema.besuche.am, bis)));
  const zaehle = (l: typeof liste) => ({
    besuche: l.length,
    angetroffen: l.filter((x) => x.inhaberAngetroffen).length,
    unterschriften: l.filter((x) => x.ergebnis === "unterschrift").length,
    ruecktritte: l.filter((x) => x.ergebnis === "unterschrift" && x.ruecktritt).length,
    sicher: l.filter((x) => x.ergebnis === "unterschrift" && !x.ruecktritt).length,
  });
  const gesamt = zaehle(liste);
  const einwaende = new Map<string, number>();
  for (const x of liste) if (x.einwand) einwaende.set(x.einwand, (einwaende.get(x.einwand) ?? 0) + 1);
  return {
    ...gesamt,
    quote: gesamt.angetroffen ? gesamt.sicher / gesamt.angetroffen : 0,
    varianteA: zaehle(liste.filter((x) => x.variante === "A")),
    varianteB: zaehle(liste.filter((x) => x.variante === "B")),
    art14Fehlt: liste.filter((x) => x.inhaberAngetroffen && !x.art14Info).length,
    einwaende: [...einwaende.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8),
    gate: gateStufe(gesamt.sicher),
  };
}

/** Besuchsplanung: besuchsbereite Leads nach Ort gebündelt (Wege sparen). Ohne Sperrliste, Kunden und Absagen. */
export async function besuchsplan(jetzt = new Date()) {
  const db = await getDb();
  const leads = await db.select().from(schema.betriebe).where(inArray(schema.betriebe.status, ["neu", "angeschrieben", "termin"])).orderBy(desc(schema.betriebe.score));
  const letzte = await db.select().from(schema.besuche).orderBy(desc(schema.besuche.am));
  const gruppen = new Map<string, { betrieb: (typeof leads)[number]; letzterBesuch: Date | null }[]>();
  for (const b of leads) {
    if (b.besuchAb && b.besuchAb > jetzt) continue;
    if (await istGesperrt(b.id)) continue;
    const ort = [b.plz, b.ort].filter(Boolean).join(" ") || "Ort fehlt";
    const eintrag = { betrieb: b, letzterBesuch: letzte.find((x) => x.betriebId === b.id)?.am ?? null };
    gruppen.set(ort, [...(gruppen.get(ort) ?? []), eintrag]);
  }
  return [...gruppen.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])).map(([ort, betriebe]) => ({ ort, betriebe }));
}
