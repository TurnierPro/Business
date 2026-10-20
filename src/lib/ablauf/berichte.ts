import { and, eq, gte, lt } from "drizzle-orm";
import { getDb, schema } from "../db";
import { protokolliere } from "../protokoll";
import { portalLink } from "../kundenportal";
import { inPostausgang } from "./postausgang";
import { anschrift, betrieb, neuesDokument, SYSTEM } from "./gemeinsam";

// Monatsreport für jeden Kunden mit Betreuung (Paket S, S-Werkstatt, M, L): Anfragen und Erreichbarkeit des Vormonats.

const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const MIT_REPORT = ["S", "S_WERKSTATT", "M", "L"];

export async function monatsreports(jetzt = new Date()): Promise<string> {
  const db = await getDb();
  const von = new Date(jetzt.getFullYear(), jetzt.getMonth() - 1, 1);
  const bis = new Date(jetzt.getFullYear(), jetzt.getMonth(), 1);
  const davor = new Date(jetzt.getFullYear(), jetzt.getMonth() - 2, 1);
  const monat = `${MONATE[von.getMonth()]} ${von.getFullYear()}`;
  const live = await db.select().from(schema.projekte).where(eq(schema.projekte.status, "live"));
  const ausfaelle = await db.select().from(schema.meldungen).where(and(eq(schema.meldungen.art, "erreichbarkeit"), eq(schema.meldungen.ok, false), gte(schema.meldungen.am, von), lt(schema.meldungen.am, bis)));
  let neu = 0;
  for (const p of live) {
    if (!MIT_REPORT.includes(p.paket) || !p.liveAm || p.liveAm >= bis) continue;
    const schon = await db.select().from(schema.dokumente).where(and(eq(schema.dokumente.projektId, p.id), eq(schema.dokumente.art, "monatsreport"), eq(schema.dokumente.titel, `Monatsreport ${monat}`)));
    if (schon.length) continue;
    const b = await betrieb(p.betriebId);
    const zaehle = async (a: Date, z: Date) => (await db.select().from(schema.anfragen).where(and(eq(schema.anfragen.betriebId, b.id), gte(schema.anfragen.am, a), lt(schema.anfragen.am, z)))).length;
    const anfragen = await zaehle(von, bis);
    const vormonat = await zaehle(davor, von);
    const start = p.liveAm > von ? p.liveAm : von;
    const pruefungen = Math.round((bis.getTime() - start.getTime()) / 600_000);
    const kennung = [p.domain, p.seitenSlug].filter(Boolean) as string[];
    const aus = ausfaelle.filter((m) => kennung.some((k) => m.detail?.includes(k))).length;
    const hinweise = [
      ...(anfragen > vormonat && vormonat > 0 ? [`${anfragen - vormonat} Anfragen mehr als im Vormonat.`] : []),
      ...(aus ? [`${aus} kurze Ausfälle erkannt und behoben.`] : []),
    ];
    const dokId = await neuesDokument({
      betriebId: b.id,
      projektId: p.id,
      art: "monatsreport",
      titel: `Monatsreport ${monat}`,
      daten: { an: anschrift(b), monat, domain: p.domain, anfragen, anfragenVormonat: vormonat, erreichbar: { pruefungen, ausfaelle: aus }, hinweise },
    });
    await inPostausgang({
      betriebId: b.id,
      projektId: p.id,
      kanal: "mail",
      zweck: "monatsreport",
      empfaenger: b.email ?? "(E-Mail-Adresse fehlt)",
      betreff: `Ihr Monatsreport ${monat}`,
      text: `Guten Tag,\n\nim Anhang finden Sie den Monatsreport für ${monat}: ${anfragen === 1 ? "1 Anfrage" : `${anfragen} Anfragen`} über Ihre Website. Alle Anfragen sehen Sie auch in Ihrem Kundenportal:\n${await portalLink(b.id)}\n\nViele Grüße\nMax Steiner\nNexova Consulting`,
      anhaenge: [dokId],
      meta: { projektId: p.id, monat },
    });
    neu++;
  }
  if (neu) await protokolliere(SYSTEM, `${neu} Monatsreports ${monat} vorbereitet`);
  return `${neu} Monatsreports vorbereitet`;
}
