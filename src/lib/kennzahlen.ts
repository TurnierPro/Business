import { getDb, schema } from "./db";
import { BUSINESS_CASE } from "./plan";
import { ZIEL_STUNDEN } from "./ablauf/zeiten";

// Messgrößen aus dem Business Case (Abschnitt 8): Liegen sie Ende März 2027 deutlich darüber, gilt das vorsichtige Szenario.

export type Kennzahl = { name: string; wert: string; ziel: string; ok: boolean | null; erklaerung: string };

export async function kennzahlen(): Promise<{ messgroessen: Kennzahl[]; trichter: { stufe: string; anzahl: number }[] }> {
  const db = await getDb();
  const [betriebe, projekte, zeiten, termine, angebote] = await Promise.all([
    db.select().from(schema.betriebe),
    db.select().from(schema.projekte),
    db.select().from(schema.zeiten),
    db.select().from(schema.termine),
    db.select().from(schema.angebote),
  ]);
  const fertig = projekte.filter((p) => p.liveAm);
  // 1. Stunden je Projekt (Lieferung ohne Betreuung) gegen das Paket-Ziel
  const jeProjekt = fertig.map((p) => ({ p, h: zeiten.filter((z) => z.projektId === p.id && z.taetigkeit !== "betreuung").reduce((s, z) => s + z.minuten, 0) / 60 })).filter((x) => x.h > 0);
  const sProjekte = jeProjekt.filter((x) => x.p.paket === "S");
  const schnittS = sProjekte.length ? sProjekte.reduce((s, x) => s + x.h, 0) / sProjekte.length : null;
  // 2. Betreuung je Kunde und Monat (letzte 30 Tage)
  const seit = Date.now() - 30 * 864e5;
  const live = projekte.filter((p) => p.status === "live");
  const betreuung = zeiten.filter((z) => z.taetigkeit === "betreuung" && z.datum.getTime() > seit).reduce((s, z) => s + z.minuten, 0) / 60;
  const jeKunde = live.length ? betreuung / live.length : null;
  // 3. Termin (Prozess-Check) → Auftrag
  const mitTermin = new Set(termine.map((t) => t.betriebId));
  const auftraege = new Set(angebote.filter((a) => a.unterschriebenAm).map((a) => a.betriebId));
  const quote = mitTermin.size ? [...mitTermin].filter((id) => auftraege.has(id)).length / mitTermin.size : null;
  // 4. Wochen von Anzahlung bis Livegang
  const dauer = fertig.map((p) => {
    const a = angebote.find((x) => x.id === p.angebotId);
    const start = a?.angezahltAm ?? p.erstelltAm;
    return (p.liveAm!.getTime() - start.getTime()) / (7 * 864e5);
  });
  const wochen = dauer.length ? dauer.reduce((s, x) => s + x, 0) / dauer.length : null;
  const z = BUSINESS_CASE.ziele;
  const f = (x: number) => x.toLocaleString("de-DE", { maximumFractionDigits: 1 });
  const messgroessen: Kennzahl[] = [
    { name: "Stunden je Projekt „Anfragen“", wert: schnittS === null ? "noch keine Daten" : `${f(schnittS)} h`, ziel: `≤ ${z.stundenS} h ab Sommer 2027`, ok: schnittS === null ? null : schnittS <= z.stundenS, erklaerung: `Aus der Zeiterfassung (ohne Betreuung), ${sProjekte.length} Projekte. Ziele je Paket: ${Object.entries(ZIEL_STUNDEN).map(([k, v]) => `${k} ${v} h`).join(", ")}.` },
    { name: "Betreuung je Kunde und Monat", wert: jeKunde === null ? "noch keine Daten" : `${f(jeKunde)} h`, ziel: `≤ ${z.betreuungStundenJeKunde} h`, ok: jeKunde === null ? null : jeKunde <= z.betreuungStundenJeKunde, erklaerung: `Letzte 30 Tage, ${live.length} Kunden mit Live-Seite.` },
    { name: "Termine, die zum Auftrag werden", wert: quote === null ? "noch keine Daten" : `${Math.round(quote * 100)} %`, ziel: `≥ ${Math.round(z.prozessCheckQuote * 100)} %`, ok: quote === null ? null : quote >= z.prozessCheckQuote, erklaerung: `${mitTermin.size} Betriebe mit Termin, davon ${[...mitTermin].filter((id) => auftraege.has(id)).length} mit Auftrag.` },
    { name: "Wochen bis Livegang", wert: wochen === null ? "noch keine Daten" : `${f(wochen)} Wochen`, ziel: `≤ ${z.wochenBisLivegang} Wochen`, ok: wochen === null ? null : wochen <= z.wochenBisLivegang, erklaerung: `Von der Anzahlung bis zum Livegang, ${dauer.length} Projekte.` },
  ];
  const zaehle = (st: string[]) => betriebe.filter((b) => st.includes(b.status)).length;
  const trichter = [
    { stufe: "Gefunden (alle)", anzahl: betriebe.length },
    { stufe: "Interessant und weiter", anzahl: zaehle(["interessant", "angeschrieben", "termin", "angebot", "kunde"]) },
    { stufe: "Angeschrieben und weiter", anzahl: zaehle(["angeschrieben", "termin", "angebot", "kunde"]) },
    { stufe: "Termin und weiter", anzahl: zaehle(["termin", "angebot", "kunde"]) },
    { stufe: "Angebot und weiter", anzahl: zaehle(["angebot", "kunde"]) },
    { stufe: "Kunde", anzahl: zaehle(["kunde"]) },
  ];
  return { messgroessen, trichter };
}
