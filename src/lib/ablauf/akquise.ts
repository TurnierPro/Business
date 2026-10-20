import QRCode from "qrcode";
import { eq, and, inArray } from "drizzle-orm";
import { getDb, schema } from "../db";
import { einreihen } from "../jobs/warteschlange";
import { protokolliere } from "../protokoll";
import { sucheBetriebe, GefundenerBetrieb } from "../adapters/research";
import { pruefeWebsite } from "../adapters/websitecheck";
import { schreibe, jsonAus } from "../adapters/ki";
import { melde } from "../adapters/push";
import { datumDe } from "../docs/basis";
import { schreibeSeite, standardInhalt, loescheSeite } from "../sites/generator";
import { inPostausgang } from "./postausgang";
import { anschrift, basisUrl, betrieb, neuesDokument, setzeStatus, slugAus, sperrSchluessel, zufallsCode, SYSTEM } from "./gemeinsam";

// Akquise: Betriebe finden, einstufen, Online-Check + Demo + Brief vorbereiten.

export async function legeBetriebAn(b: GefundenerBetrieb & { email?: string; notizen?: string }, quelle: string, wer: string): Promise<{ id: number | null; grund?: string }> {
  const db = await getDb();
  const schluessel = sperrSchluessel(b.name, b.website);
  const [gesperrt] = await db.select().from(schema.sperrliste).where(eq(schema.sperrliste.schluessel, schluessel));
  if (gesperrt) return { id: null, grund: "steht auf der Sperrliste" };
  const alle = await db.select({ id: schema.betriebe.id, name: schema.betriebe.name, website: schema.betriebe.website }).from(schema.betriebe);
  if (alle.some((x) => sperrSchluessel(x.name, x.website) === schluessel)) return { id: null, grund: "ist schon im System" };
  const [neu] = await db
    .insert(schema.betriebe)
    .values({
      name: b.name,
      gewerk: b.gewerk || "SHK",
      anrede: b.anrede ?? "Herr",
      inhaber: b.inhaber || null,
      strasse: b.strasse || null,
      plz: b.plz || null,
      ort: b.ort || null,
      telefon: b.telefon || null,
      email: b.email || null,
      website: b.website || null,
      mitarbeiter: b.mitarbeiter ?? null,
      score: b.score ?? null,
      scoreGrund: b.scoreGrund ?? null,
      notizen: b.notizen ?? null,
      quelle,
      // Art. 14 DSGVO: Quelle festhalten, sie steht später im Brief
      datenquelle: b.datenquelle || (b.website ? `Impressum ${b.website}, abgerufen am ${datumDe()}` : `${quelle}, erfasst am ${datumDe()}`),
    })
    .returning({ id: schema.betriebe.id });
  await protokolliere(wer, `Lead angelegt: ${b.name}`, neu.id, quelle);
  return { id: neu.id };
}

export async function wochenlauf(): Promise<string> {
  const { betriebe, simuliert } = await sucheBetriebe(20);
  let neu = 0;
  for (const b of betriebe) if ((await legeBetriebAn(b, simuliert ? "Wochenlauf (Simulator)" : "Wochenlauf", SYSTEM)).id) neu++;
  await melde("job", true, "Wochenlauf fertig", `${neu} neue Leads, ${betriebe.length - neu} übersprungen (doppelt oder gesperrt).`);
  return `${neu} neue Leads`;
}

export async function einstufen(betriebId: number, interessant: boolean, wer: string): Promise<void> {
  await setzeStatus(betriebId, interessant ? "interessant" : "nicht_interessant");
  await protokolliere(wer, interessant ? "Als interessant eingestuft" : "Als nicht interessant eingestuft", betriebId);
  if (interessant) await einreihen("vorbereitung", { betriebId });
}

export async function widerspruch(betriebId: number, wer: string, grund = "Widerspruch"): Promise<void> {
  const db = await getDb();
  const b = await betrieb(betriebId);
  const schluessel = sperrSchluessel(b.name, b.website);
  await db.insert(schema.sperrliste).values({ name: b.name, schluessel, grund }).onConflictDoNothing();
  await db
    .update(schema.postausgang)
    .set({ status: "abgelehnt", ablehnGrund: "Sperrliste" })
    .where(and(eq(schema.postausgang.betriebId, betriebId), inArray(schema.postausgang.status, ["zur_freigabe", "freigegeben"])));
  const demos = await db.select().from(schema.seiten).where(and(eq(schema.seiten.betriebId, betriebId), eq(schema.seiten.art, "demo")));
  for (const d of demos) {
    loescheSeite(d.slug);
    await db.delete(schema.seiten).where(eq(schema.seiten.id, d.id));
  }
  await setzeStatus(betriebId, "gesperrt");
  await protokolliere(wer, "Widerspruch: auf Sperrliste gesetzt, offene Post gestoppt, Demo gelöscht", betriebId, grund);
}

/** Läuft nach „interessant“: Online-Check, Demo, Gesprächsleitfaden, Brief. Ziel: unter 30 Minuten. */
export async function vorbereitung(betriebId: number): Promise<string> {
  const b = await betrieb(betriebId);
  const an = anschrift(b);
  const heute = datumDe();

  // 1. Online-Check
  const check = await pruefeWebsite(b.website);
  const schwach = check.punkte.filter((p) => p.ampel !== "gruen");
  const prioErsatz = (schwach.length ? schwach : check.punkte).slice(0, 3).map((p) => `${p.name}: ${p.befund}`);
  const prio = await schreibe({
    zweck: "check_prioritaeten",
    modell: "schnell",
    betriebId,
    aufgabe: "Formuliere aus diesen Prüfergebnissen genau drei konkrete nächste Schritte für den Inhaber, je ein Satz, wichtigster zuerst. Antworte als JSON-Array mit drei Strings.",
    daten: { betrieb: b.name, gewerk: b.gewerk, punkte: check.punkte },
    ersatz: JSON.stringify(prioErsatz),
  });
  const reportId = await neuesDokument({
    betriebId,
    art: "check_report",
    titel: `Online-Check ${b.name}`,
    daten: { an, website: b.website, datum: heute, punkte: check.punkte, prioritaeten: jsonAus<string[]>(prio.text, prioErsatz).slice(0, 3), ladezeitMs: check.ladezeitMs },
  });

  // 2. Demo-Website mit Zugangscode, ohne Cookies, Löschung nach 60 Tagen
  const db = await getDb();
  const slug = `${slugAus(b.name)}-${zufallsCode(4).toLowerCase()}`;
  const code = zufallsCode(6);
  schreibeSeite(slug, standardInhalt(b, true));
  await db.insert(schema.seiten).values({ slug, betriebId, art: "demo", zugangscode: code, loeschenAm: new Date(Date.now() + 60 * 864e5) });
  const demoUrl = `${basisUrl()}/vorschau/${slug}?code=${code}`;

  // 3. Gesprächsleitfaden (intern)
  const leitErsatz = [
    "Wie kommen neue Kunden heute zu Ihnen?",
    "Wie viele Anfragen kommen pro Woche, und auf welchem Weg?",
    "Welche Stellen sind offen, und seit wann?",
    "Wer macht bei Ihnen das Büro, und wie viele Stunden pro Woche?",
    "Was passiert mit Anrufen, wenn alle auf der Baustelle sind?",
    "Was hat Sie an Ihrer jetzigen Website gestört?",
    "Was müsste in einem Jahr anders sein, damit Sie zufrieden sind?",
    "Wer entscheidet außer Ihnen mit?",
  ];
  const leit = await schreibe({
    zweck: "leitfaden",
    modell: "schnell",
    betriebId,
    aufgabe: "Schreibe 8 bis 10 offene Fragen für ein 20-minütiges Erstgespräch mit diesem Inhaber. Bezieh dich auf die Prüfergebnisse. Antworte als JSON-Array von Strings.",
    daten: { betrieb: b.name, gewerk: b.gewerk, mitarbeiter: b.mitarbeiter, scoreGrund: b.scoreGrund, schwachstellen: schwach.map((p) => p.befund) },
    ersatz: JSON.stringify(leitErsatz),
  });
  await neuesDokument({
    betriebId,
    art: "leitfaden",
    titel: `Gesprächsleitfaden ${b.name}`,
    daten: { an, datum: heute, fragen: jsonAus<string[]>(leit.text, leitErsatz), hinweise: [b.scoreGrund ?? "Kein Score-Grund hinterlegt.", ...schwach.slice(0, 3).map((p) => p.befund), `Demo: ${demoUrl}`] },
  });

  // 4. Akquise-Brief in den Postausgang
  const anrede = an.inhaber ? (an.anrede === "Frau" ? `Sehr geehrte Frau ${an.inhaber.split(" ").slice(-1)[0]},` : `Sehr geehrter Herr ${an.inhaber.split(" ").slice(-1)[0]},`) : "Sehr geehrte Damen und Herren,";
  const briefErsatz = `${anrede}

wir sind Daniel Lück und Max Steiner aus Karlsruhe. Wir sorgen dafür, dass Betriebe wie ${b.name} mehr Anfragen und mehr Bewerbungen bekommen und das Büro weniger Arbeit hat.

Wir haben uns angesehen, wie man Sie heute online findet. ${schwach[0] ? schwach[0].befund : "Einiges läuft schon gut."} Das kostet Anfragen, die bei Ihnen ankommen könnten.

Wie eine neue Seite für Sie aussehen könnte, haben wir schon vorbereitet. Den Zugang finden Sie unten.

Ich komme in den nächsten Tagen gern für 20 Minuten vorbei und zeige Ihnen, was wir für ${b.gewerk === "Kfz" ? "Werkstätten" : "Betriebe"} in der Region tun. Wenn es gerade nicht passt, sagen Sie es mir einfach.

Mit freundlichen Grüßen

Daniel Lück
Nexova Consulting`;
  const briefText = await schreibe({
    zweck: "akquise_brief",
    modell: "text",
    betriebId,
    aufgabe:
      "Schreibe einen kurzen Akquise-Brief (höchstens 170 Wörter) an diesen Inhaber. Beginne mit der Anrede, ende mit Grüßen von Daniel Lück, Nexova Consulting. Nenne eine konkrete Beobachtung aus dem Check. Kündige an, dass Daniel in den nächsten Tagen für 20 Minuten vorbeikommt. Keine Preise. Nur den Brieftext ausgeben.",
    daten: { anrede, betrieb: b.name, gewerk: b.gewerk, ort: b.ort, beobachtungen: schwach.map((p) => p.befund) },
    ersatz: briefErsatz,
  });
  const betreff = `${b.name}: mehr Anfragen, weniger Büro`;
  const briefId = await neuesDokument({
    betriebId,
    art: "brief",
    titel: `Akquise-Brief ${b.name}`,
    daten: { an, betreff, text: briefText.text, datum: heute, demoUrl, quelle: b.datenquelle ?? undefined, qr: await QRCode.toDataURL(demoUrl, { margin: 0, width: 240 }) },
  });
  await inPostausgang({
    betriebId,
    kanal: "brief",
    zweck: "akquise_brief",
    empfaenger: `${b.name}, ${b.strasse ?? "?"}, ${b.plz ?? ""} ${b.ort ?? ""}`,
    betreff,
    text: briefText.text,
    anhaenge: [briefId],
    hinweise: [
      ...(!b.strasse || !b.plz ? ["Anschrift unvollständig. Vor Freigabe ergänzen."] : []),
      ...(process.env.AKQUISE_FREIGESCHALTET === "ja" ? [] : ["Akquise ist noch gesperrt (vor Notartermin und Gründungszuschuss). Der Brief geht nur an den Simulator."]),
    ],
  });
  await protokolliere(SYSTEM, "Vorbereitung fertig: Online-Check, Demo, Leitfaden, Brief", betriebId, `Report ${reportId}`);
  return `Check, Demo und Brief für ${b.name} fertig`;
}
