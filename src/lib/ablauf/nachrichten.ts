import { and, desc, eq, gt } from "drizzle-orm";
import { getDb, schema } from "../db";
import { protokolliere } from "../protokoll";
import { einreihen } from "../jobs/warteschlange";
import { schreibe } from "../adapters/ki";
import { telefonNormal } from "../adapters/whatsapp";
import { systemAufgabe, TECHNIK, VERTRIEB } from "./crm";
import { inPostausgang } from "./postausgang";

// Eine Stelle für alle Nachrichten, egal über welchen Kanal.
// Ablauf beim Eingang: speichern → Betrieb zuordnen → Aufgabe für den Zuständigen → bei Mail/WhatsApp Antwortentwurf.
// Der Entwurf landet im Postausgang. Rausgehen tut er erst nach Qualitätskontrolle und Freigabe durch einen Menschen.
// Ein späterer WhatsApp- oder Telefon-Bot nutzt genau diese Funktionen, nichts daneben.

export const KANAELE: Record<string, string> = { mail: "E-Mail", whatsapp: "WhatsApp", telefon: "Telefon", portal: "Kundenportal", formular: "Website-Formular" };

export type Eingang = {
  kanal: string;
  absender: string;
  inhalt: string;
  betreff?: string | null;
  externeId?: string | null;
  betriebId?: number | null;
  name?: string | null;
  anhaenge?: string[];
  dauerSek?: number | null;
  zeit?: Date;
  /** Bei false wird kein Antwortentwurf erstellt (z. B. wenn der Bot selbst schon einen liefert). */
  entwurf?: boolean;
};

const MAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Absender (Mail oder Telefonnummer) einem Betrieb und ggf. Ansprechpartner zuordnen. */
export async function zuordnen(absender: string): Promise<{ betriebId: number | null; kontaktId: number | null }> {
  const db = await getDb();
  const mail = MAIL.test(absender.trim()) ? absender.trim().toLowerCase() : null;
  const tel = mail ? null : telefonNormal(absender);
  if (!mail && !tel) return { betriebId: null, kontaktId: null };
  const passt = (x: string | null) => (mail ? x?.trim().toLowerCase() === mail : telefonNormal(x) === tel);
  const kontakte = await db.select().from(schema.kontakte);
  const k = kontakte.find((x) => passt(mail ? x.email : x.telefon));
  if (k) return { betriebId: k.betriebId, kontaktId: k.id };
  const betriebe = await db.select({ id: schema.betriebe.id, email: schema.betriebe.email, telefon: schema.betriebe.telefon }).from(schema.betriebe);
  const b = betriebe.find((x) => passt(mail ? x.email : x.telefon));
  return { betriebId: b?.id ?? null, kontaktId: null };
}

/** Eingehende Nachricht speichern und weiterverarbeiten. Gibt die ID zurück (bei Doppelten die vorhandene). */
export async function nachrichtEingang(n: Eingang, quelle: string): Promise<{ id: number; neu: boolean; betriebId: number | null }> {
  if (!KANAELE[n.kanal]) throw new Error(`Unbekannter Kanal „${n.kanal}“. Erlaubt: ${Object.keys(KANAELE).join(", ")}`);
  const absender = (n.kanal === "whatsapp" || n.kanal === "telefon" ? telefonNormal(n.absender) : n.absender.trim()) ?? "";
  if (!absender) throw new Error("Absender fehlt oder ist keine gültige Adresse/Nummer.");
  const inhalt = n.inhalt?.trim();
  if (!inhalt) throw new Error("Inhalt fehlt.");
  const db = await getDb();
  if (n.externeId) {
    const [da] = await db.select().from(schema.nachrichten).where(and(eq(schema.nachrichten.kanal, n.kanal), eq(schema.nachrichten.externeId, n.externeId)));
    if (da) return { id: da.id, neu: false, betriebId: da.betriebId };
  }
  const z = n.betriebId ? { betriebId: n.betriebId, kontaktId: null } : await zuordnen(absender);
  const [neu] = await db
    .insert(schema.nachrichten)
    .values({
      kanal: n.kanal,
      richtung: "ein",
      betriebId: z.betriebId,
      kontaktId: z.kontaktId,
      externeId: n.externeId ?? null,
      absender,
      betreff: n.betreff?.slice(0, 300) ?? null,
      inhalt: inhalt.slice(0, 20000),
      anhaenge: n.anhaenge ?? [],
      dauerSek: n.dauerSek ?? null,
      status: z.betriebId ? "neu" : "unbekannt",
      quelle,
      zeit: n.zeit ?? new Date(),
    })
    .onConflictDoNothing()
    .returning({ id: schema.nachrichten.id });
  if (!neu) {
    // Gleichzeitig doppelt angekommen: die andere Anfrage hat gewonnen
    const [da] = await db.select().from(schema.nachrichten).where(and(eq(schema.nachrichten.kanal, n.kanal), eq(schema.nachrichten.externeId, n.externeId ?? "")));
    return { id: da.id, neu: false, betriebId: da.betriebId };
  }
  const wer = n.name ? `${n.name} (${absender})` : absender;
  await protokolliere(quelle, `${KANAELE[n.kanal]} von ${wer}`, z.betriebId);

  if (z.betriebId) await folgeschritte(neu.id, wer, n.entwurf !== false);
  return { id: neu.id, neu: true, betriebId: z.betriebId };
}

/** Aufgabe für den Zuständigen und (bei Mail/WhatsApp) Antwortentwurf. */
async function folgeschritte(id: number, wer: string, entwurf: boolean): Promise<void> {
  const db = await getDb();
  const [n] = await db.select().from(schema.nachrichten).where(eq(schema.nachrichten.id, id));
  if (!n?.betriebId) return;
  const [b] = await db.select().from(schema.betriebe).where(eq(schema.betriebe.id, n.betriebId));
  const zustaendig = b?.zustaendig ?? (b?.status === "kunde" ? TECHNIK : VERTRIEB);
  const titel = n.kanal === "telefon" ? `Rückruf: ${wer}` : `${KANAELE[n.kanal]} beantworten: ${n.betreff ?? n.inhalt.slice(0, 50)}`;
  await systemAufgabe({ betriebId: n.betriebId, titel, text: n.inhalt.slice(0, 500), inTagen: n.kanal === "telefon" ? 0 : 1, zustaendig });
  if ((n.kanal === "mail" || n.kanal === "whatsapp") && entwurf) await einreihen("antwortentwurf", { nachrichtId: n.id });
}

/** Antwort als Entwurf in den Postausgang legen (KI schreibt, Mensch gibt frei). */
export async function antwortEntwerfen(nachrichtId: number): Promise<string> {
  const db = await getDb();
  const [n] = await db.select().from(schema.nachrichten).where(eq(schema.nachrichten.id, nachrichtId));
  if (!n || n.richtung !== "ein") throw new Error("Nachricht nicht gefunden");
  if (!n.betriebId) return "Kein Betrieb zugeordnet, kein Entwurf";
  if (n.kanal !== "mail" && n.kanal !== "whatsapp") return "Für diesen Kanal gibt es keinen Antwortentwurf";
  const [b] = await db.select().from(schema.betriebe).where(eq(schema.betriebe.id, n.betriebId));
  const verlauf = await db.select().from(schema.nachrichten).where(eq(schema.nachrichten.betriebId, n.betriebId)).orderBy(desc(schema.nachrichten.zeit)).limit(6);
  const ersatz = `Guten Tag,\n\nvielen Dank für Ihre Nachricht. Wir haben sie erhalten und melden uns bis morgen mit einer Antwort.\n\nViele Grüße\n${b?.status === "kunde" ? TECHNIK : VERTRIEB}`;
  const ki = await schreibe({
    zweck: "antwortentwurf",
    modell: "schnell",
    betriebId: n.betriebId,
    aufgabe: `Schreibe einen kurzen Antwortentwurf auf die letzte eingehende ${n.kanal === "whatsapp" ? "WhatsApp-Nachricht (höchstens 600 Zeichen, ohne Betreff)" : "E-Mail"} an ${b?.name}. Beantworte nur, was sich aus den Daten sicher ergibt. Alles andere: freundlich sagen, dass wir uns melden. Keine Preise oder Termine erfinden. Nur den Text ausgeben.`,
    daten: { betrieb: { name: b?.name, status: b?.status }, verlauf: verlauf.reverse().map((x) => ({ richtung: x.richtung, kanal: x.kanal, betreff: x.betreff, inhalt: x.inhalt.slice(0, 2000) })) },
    ersatz,
  });
  const id = await inPostausgang({
    betriebId: n.betriebId,
    kanal: n.kanal as "mail" | "whatsapp",
    zweck: "antwort",
    empfaenger: n.absender,
    betreff: n.kanal === "mail" ? `AW: ${(n.betreff ?? "Ihre Nachricht").replace(/^(AW|RE):\s*/i, "")}` : "WhatsApp-Antwort",
    text: ki.text,
    hinweise: ki.simuliert ? ["Standardtext ohne KI. Bitte vor dem Freigeben auf die Nachricht eingehen."] : [],
    meta: { antwortAuf: n.id },
  });
  return `Entwurf ${id} im Postausgang`;
}

/** Nach dem Versand: ausgehende Nachricht festhalten, damit der Verlauf vollständig ist. */
export async function ausgangFesthalten(e: { id: number; kanal: string; betriebId: number | null; empfaenger: string; betreff: string; text: string; meta: Record<string, unknown> }, externeId: string | null): Promise<void> {
  if (e.kanal !== "mail" && e.kanal !== "whatsapp") return;
  const db = await getDb();
  await db.insert(schema.nachrichten).values({ kanal: e.kanal, richtung: "aus", betriebId: e.betriebId, postausgangId: e.id, externeId, absender: "Nexova", empfaenger: e.empfaenger, betreff: e.kanal === "mail" ? e.betreff : null, inhalt: e.text, quelle: "Postausgang" });
  if (typeof e.meta.antwortAuf === "number") await db.update(schema.nachrichten).set({ status: "erledigt" }).where(eq(schema.nachrichten.id, e.meta.antwortAuf));
}

/** WhatsApp erlaubt freie Texte nur 24 Stunden nach der letzten Nachricht des Kunden. */
export async function whatsappFensterOffen(nummer: string): Promise<boolean> {
  const tel = telefonNormal(nummer);
  if (!tel) return false;
  const db = await getDb();
  const [x] = await db
    .select({ id: schema.nachrichten.id })
    .from(schema.nachrichten)
    .where(and(eq(schema.nachrichten.kanal, "whatsapp"), eq(schema.nachrichten.richtung, "ein"), eq(schema.nachrichten.absender, tel), gt(schema.nachrichten.zeit, new Date(Date.now() - 24 * 3600e3))));
  return !!x;
}

/** Unbekannte Nachricht nachträglich einem Betrieb zuordnen. */
export async function nachrichtZuordnen(id: number, betriebId: number, wer: string): Promise<void> {
  const db = await getDb();
  const [n] = await db.update(schema.nachrichten).set({ betriebId, status: "neu" }).where(eq(schema.nachrichten.id, id)).returning();
  if (!n) throw new Error("Nachricht nicht gefunden");
  await protokolliere(wer, `Nachricht ${id} zugeordnet`, betriebId);
  await folgeschritte(id, n.absender, true);
}

export async function nachrichtErledigt(id: number, wer: string): Promise<void> {
  const db = await getDb();
  await db.update(schema.nachrichten).set({ status: "erledigt" }).where(eq(schema.nachrichten.id, id));
  await protokolliere(wer, `Nachricht ${id} erledigt`);
}

export async function unbekannteNachrichten() {
  const db = await getDb();
  return db.select().from(schema.nachrichten).where(and(eq(schema.nachrichten.status, "unbekannt"), eq(schema.nachrichten.richtung, "ein"))).orderBy(desc(schema.nachrichten.zeit));
}
