import crypto from "node:crypto";
import { and, eq, isNotNull } from "drizzle-orm";
import { getDb, schema } from "./db";
import { basisUrl } from "./ablauf/gemeinsam";

// Kalender-Abo (ICS) für iPhone, Outlook und Google: Termine und fällige Aufgaben der Person.

export async function kalenderLink(benutzerId: number): Promise<string> {
  const db = await getDb();
  const [b] = await db.select().from(schema.benutzer).where(eq(schema.benutzer.id, benutzerId));
  let token = b?.kalenderToken;
  if (!token) {
    token = crypto.randomBytes(24).toString("base64url");
    await db.update(schema.benutzer).set({ kalenderToken: token }).where(eq(schema.benutzer.id, benutzerId));
  }
  return `${basisUrl()}/kalender/${token}`;
}

const ics = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

export async function kalender(token: string): Promise<string | null> {
  if (!token || token.length < 20) return null;
  const db = await getDb();
  const [b] = await db.select().from(schema.benutzer).where(eq(schema.benutzer.kalenderToken, token));
  if (!b?.aktiv) return null;
  const eintraege = await db
    .select({ a: schema.aktivitaeten, betrieb: schema.betriebe.name })
    .from(schema.aktivitaeten)
    .leftJoin(schema.betriebe, eq(schema.aktivitaeten.betriebId, schema.betriebe.id))
    .where(and(eq(schema.aktivitaeten.zustaendig, b.name), isNotNull(schema.aktivitaeten.faelligAm)));
  const jetzt = ics(new Date());
  const zeilen = eintraege
    .filter(({ a }) => a.art === "termin" || !a.erledigtAm)
    .map(({ a, betrieb }) => {
      const start = a.faelligAm!;
      const ende = new Date(start.getTime() + (a.dauerMin ?? (a.art === "termin" ? 60 : 15)) * 60_000);
      return [
        "BEGIN:VEVENT",
        `UID:nexova-${a.id}@nexova-os`,
        `DTSTAMP:${jetzt}`,
        `DTSTART:${ics(start)}`,
        `DTEND:${ics(ende)}`,
        `SUMMARY:${esc(`${a.art === "aufgabe" ? "Aufgabe: " : ""}${a.titel}${betrieb ? ` (${betrieb})` : ""}`)}`,
        ...(a.text ? [`DESCRIPTION:${esc(a.text)}`] : []),
        ...(a.betriebId ? [`URL:${basisUrl()}/leads/${a.betriebId}`] : []),
        "END:VEVENT",
      ].join("\r\n");
    });
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Nexova OS//DE", `X-WR-CALNAME:Nexova OS – ${esc(b.name)}`, "CALSCALE:GREGORIAN", ...zeilen, "END:VCALENDAR", ""].join("\r\n");
}
