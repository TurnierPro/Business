"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { brauchtBenutzer, COOKIE, darf, hashPasswort, pruefePasswort } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { einreihen, wiederholen } from "@/lib/jobs/warteschlange";
import * as akquise from "@/lib/ablauf/akquise";
import * as post from "@/lib/ablauf/postausgang";
import * as verkauf from "@/lib/ablauf/verkauf";
import { protokolliere } from "@/lib/protokoll";
import { berlinZeit, inTagen } from "@/lib/format";
import { internerPfad } from "@/lib/sicherheit";
import { entschluessele, verschluessele } from "@/lib/geheim";

// Alle Knöpfe der Oberfläche landen hier. Jede Aktion meldet Erfolg oder Fehler zurück.

type Ergebnis = { ziel?: string; ok?: string } | void | unknown;

async function ausfuehren(ziel: string, ok: string, fn: (wer: string) => Promise<Ergebnis>, recht: "aendern" | "verwalten" = "aendern"): Promise<never> {
  const b = await brauchtBenutzer();
  let fehler: string | null = null;
  try {
    if (!darf(b, recht)) throw new Error(recht === "verwalten" ? "Das darf nur ein Admin." : "Dein Konto darf nur lesen.");
    const r = (await fn(b.name)) as { ziel?: string; ok?: string } | undefined;
    if (r && typeof r === "object") {
      ziel = r.ziel ?? ziel;
      ok = r.ok ?? ok;
    }
  } catch (e) {
    fehler = e instanceof Error ? e.message : String(e);
    // Technische Fehler (z. B. aus der Datenbank) nicht anzeigen: verraten sonst Aufbau und Daten
    if (/duplicate key|violates|relation |column |syntax|ECONN|ENOENT|at \S+:\d+/i.test(fehler)) {
      console.error("Aktion fehlgeschlagen:", e);
      fehler = "Technischer Fehler. Bitte erneut versuchen; Details stehen im Server-Log.";
    }
  }
  revalidatePath("/", "layout");
  ziel = internerPfad(ziel);
  // Meldung vor einen Anker (#…) setzen, sonst kommt sie nicht an
  const [pfad, anker] = ziel.split("#");
  const trenner = pfad.includes("?") ? "&" : "?";
  redirect(`${pfad}${trenner}${fehler ? `fehler=${encodeURIComponent(fehler)}` : `ok=${encodeURIComponent(ok)}`}${anker ? `#${anker}` : ""}`);
}

const zahl = (f: FormData, k: string) => Number(f.get(k));
const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function abmelden() {
  (await cookies()).delete(COOKIE);
  redirect("/login");
}

export async function wochenlaufStarten() {
  await ausfuehren("/leads", "Wochenlauf läuft. Neue Leads erscheinen in wenigen Sekunden.", () => einreihen("wochenlauf"));
}

/** Geburtsdatum aus dem Formular: nur ein echtes Datum in der Vergangenheit, sonst leer. */
function geburtsdatumAus(f: FormData): string | null {
  const t = text(f, "geburtsdatum");
  if (!t) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t) || Number.isNaN(Date.parse(t)) || new Date(t) > new Date() || t < "1900-01-01") throw new Error("Geburtsdatum ungültig");
  return t;
}

/** Website ist Pflicht, außer „Keine Website vorhanden“ ist angekreuzt. */
function websiteAus(f: FormData): string | null {
  const w = text(f, "website");
  if (!w && f.get("keineWebsite") !== "ja") throw new Error("Bitte die Website eintragen oder „Keine Website vorhanden“ ankreuzen.");
  return f.get("keineWebsite") === "ja" ? null : w;
}

export async function leadAnlegen(f: FormData) {
  await ausfuehren("/leads/neu", "Lead angelegt", async (wer) => {
    const website = websiteAus(f);
    const r = await akquise.legeBetriebAn(
      {
        name: text(f, "name"),
        gewerk: text(f, "gewerk"),
        anrede: text(f, "anrede"),
        inhaber: text(f, "inhaber"),
        strasse: text(f, "strasse"),
        plz: text(f, "plz"),
        ort: text(f, "ort"),
        telefon: text(f, "telefon"),
        email: text(f, "email"),
        website: website ?? undefined,
        datenquelle: text(f, "datenquelle") || undefined,
        mitarbeiter: f.get("mitarbeiter") ? zahl(f, "mitarbeiter") : undefined,
        score: f.get("score") ? zahl(f, "score") : 50,
        scoreGrund: text(f, "notizen") || "manuell angelegt",
        notizen: text(f, "notizen"),
      },
      "manuell",
      wer,
    );
    if (!r.id) throw new Error(`Nicht angelegt: Betrieb ${r.grund}.`);
    const geburtsdatum = geburtsdatumAus(f);
    if (geburtsdatum) await (await getDb()).update(schema.betriebe).set({ inhaberGeburtsdatum: geburtsdatum }).where(eq(schema.betriebe.id, r.id));
    return { ziel: `/leads/${r.id}` };
  });
}

export async function betriebSpeichern(f: FormData) {
  const id = zahl(f, "id");
  await ausfuehren(`/leads/${id}`, "Stammdaten gespeichert", async (wer) => {
    const db = await getDb();
    await db
      .update(schema.betriebe)
      .set({
        name: text(f, "name"),
        gewerk: text(f, "gewerk"),
        anrede: text(f, "anrede"),
        inhaber: text(f, "inhaber") || null,
        inhaberGeburtsdatum: geburtsdatumAus(f),
        strasse: text(f, "strasse") || null,
        plz: text(f, "plz") || null,
        ort: text(f, "ort") || null,
        telefon: text(f, "telefon") || null,
        email: text(f, "email") || null,
        website: websiteAus(f),
        datenquelle: text(f, "datenquelle") || null,
        notizen: text(f, "notizen") || null,
        letzteAktivitaet: new Date(),
      })
      .where(eq(schema.betriebe.id, id));
    await protokolliere(wer, "Stammdaten geändert", id);
  });
}

export async function einstufen(f: FormData) {
  const id = zahl(f, "id");
  const ja = text(f, "wahl") === "ja";
  await ausfuehren(`/leads/${id}`, ja ? "Eingestuft: interessant. Check, Demo und Brief werden vorbereitet." : "Eingestuft: nicht interessant", (wer) => akquise.einstufen(id, ja, wer));
}

export async function widerspruch(f: FormData) {
  const id = zahl(f, "id");
  await ausfuehren(`/leads/${id}`, "Auf Sperrliste gesetzt. Offene Post gestoppt, Demo gelöscht.", (wer) => akquise.widerspruch(id, wer, text(f, "grund") || "Widerspruch"));
}

export async function freigeben(f: FormData) {
  const id = zahl(f, "id");
  await ausfuehren("/freigaben", "Freigegeben. Versand läuft.", async (wer) => {
    if ((await post.eintrag(id)).kanal === "livegang") await (await import("@/lib/zweiter-faktor")).technikMitCode(wer, text(f, "code"), `Livegang (Eintrag ${id})`);
    if ((await post.freigeben(id, wer)) === "weitere_freigabe_noetig") return { ok: "Deine Freigabe ist gespeichert. Es fehlt noch die zweite Person (Rechnung über 10.000 €)." };
  });
}

export async function ablehnen(f: FormData) {
  const id = zahl(f, "id");
  await ausfuehren("/freigaben", "Abgelehnt", (wer) => post.ablehnen(id, text(f, "grund"), wer));
}

export async function eintragSpeichern(f: FormData) {
  const id = zahl(f, "id");
  await ausfuehren(`/freigaben/${id}`, "Text gespeichert. Bitte jetzt prüfen und freigeben.", async (wer) => {
    const db = await getDb();
    const empfaenger = text(f, "empfaenger");
    // Erst der Text (prüft den Status), dann der Empfänger: Versendetes bleibt unverändert
    await post.bearbeiten(id, text(f, "betreff"), String(f.get("text") ?? ""), wer);
    if (empfaenger) await db.update(schema.postausgang).set({ empfaenger }).where(eq(schema.postausgang.id, id));
  });
}

export async function terminHochladen(f: FormData) {
  const id = zahl(f, "id");
  await ausfuehren(`/leads/${id}`, "Aufnahme gespeichert. Protokoll und Angebot werden erstellt.", (wer) =>
    verkauf.terminAufnehmen({ betriebId: id, datei: f.get("aufnahme") as File, einwilligung: f.get("einwilligung") === "ja", wer }),
  );
}

export async function gespraechImportieren(f: FormData) {
  const id = zahl(f, "id");
  await ausfuehren(`/leads/${id}?tab=aktivitaeten`, "Gespräch übernommen. Protokoll und Angebotsentwurf werden erstellt und landen in den Freigaben.", (wer) =>
    verkauf.gespraechImportieren({ betriebId: id, text: text(f, "text"), datum: datumAus(f, "datum"), einwilligung: f.get("einwilligung") === "ja", quelle: "Claude, eingefügt", wer }),
  );
}

// ---------- Demo-Pakete (Website und Instagram-Vorlagen) ----------

export async function demoHochladen(f: FormData) {
  const id = zahl(f, "betriebId");
  await ausfuehren(`/leads/${id}?tab=dokumente#demo`, "Demo-Paket hochgeladen. Intern ansehen, dann ins Kundenportal freigeben.", async (wer) => {
    await (await import("@/lib/demos")).demoHochladen({ betriebId: id, titel: text(f, "titel"), datei: f.get("datei") as File, wer });
  });
}

export async function demoFreigeben(f: FormData) {
  const id = zahl(f, "betriebId");
  await ausfuehren(`/leads/${id}?tab=dokumente#demo`, "Die Mail „Ihre Demo liegt im Kundenportal“ liegt in den Freigaben. Sichtbar wird die Demo nach Freigabe und Versand.", async (wer) => {
    const eintragId = await (await import("@/lib/demos")).demoFreigabeAnfordern(zahl(f, "demoId"), wer);
    return { ziel: `/freigaben/${eintragId}` };
  });
}

export async function demoZurueckziehen(f: FormData) {
  const id = zahl(f, "betriebId");
  await ausfuehren(`/leads/${id}?tab=dokumente#demo`, "Demo aus dem Kundenportal genommen.", async (wer) => (await import("@/lib/demos")).demoZurueckziehen(zahl(f, "demoId"), wer));
}

export async function demoLoeschen(f: FormData) {
  const id = zahl(f, "betriebId");
  await ausfuehren(`/leads/${id}?tab=dokumente#demo`, "Demo gelöscht.", async (wer) => (await import("@/lib/demos")).demoLoeschen(zahl(f, "demoId"), wer));
}

export async function vertragUnterschreiben(f: FormData) {
  const angebotId = zahl(f, "angebotId");
  await ausfuehren(`/unterschrift/${angebotId}`, "Verträge unterschrieben. Die Auftragsbestätigung mit allen Unterlagen liegt in den Freigaben.", async (wer) => {
    const { vertragUnterschreiben: unterschreiben } = await import("@/lib/ablauf/vertraege");
    const bilder: Record<number, string> = {};
    for (const [k, v] of f.entries()) if (k.startsWith("bild-")) bilder[Number(k.slice(5))] = String(v);
    await unterschreiben({ angebotId, kunde: { name: text(f, "name"), funktion: text(f, "funktion"), unternehmer: f.get("unternehmer") === "ja" }, bilder, levarex: { name: text(f, "levarexName"), bild: text(f, "levarexBild") }, wer,
      // Mandat nur, wenn eine IBAN eingetragen ist; sonst später im Kundenportal
      mandat: text(f, "iban") ? { kontoinhaber: text(f, "kontoinhaber"), iban: text(f, "iban"), bic: text(f, "bic"), bild: text(f, "mandatBild") } : null });
    const db = await getDb();
    const [a] = await db.select().from(schema.angebote).where(eq(schema.angebote.id, angebotId));
    return { ziel: `/leads/${a.betriebId}` };
  });
}

export async function zahlungSimulieren(f: FormData) {
  const id = zahl(f, "betriebId");
  await ausfuehren(`/leads/${id}`, "Zahlung eingetragen. Projekt angelegt, Start-Mail liegt zur Freigabe.", (wer) => verkauf.zahlungEingegangen(zahl(f, "angebotId"), `${wer} (von Hand gebucht)`));
}

export async function neuBauen(f: FormData) {
  const id = zahl(f, "id");
  await ausfuehren(`/projekte/${id}`, "Seite wird neu gebaut und geprüft.", async () => {
    const db = await getDb();
    await db.update(schema.projekte).set({ status: "bau" }).where(eq(schema.projekte.id, id));
    await einreihen("bau", { projektId: id });
  });
}

export async function jobStarten(f: FormData) {
  const art = text(f, "art");
  await ausfuehren("/system", "Job gestartet", () => einreihen(art, { manuell: true }));
}

export async function jobWiederholen(f: FormData) {
  await ausfuehren("/system", "Job wird wiederholt", () => wiederholen(zahl(f, "id")));
}

/** Alle Sitzungen dieses Kontos beenden (z. B. Handy verloren). */
export async function ueberallAbmelden() {
  const ich = await brauchtBenutzer();
  const db = await getDb();
  const [b] = await db.select().from(schema.benutzer).where(eq(schema.benutzer.id, ich.id));
  await db.update(schema.benutzer).set({ sitzungVersion: b.sitzungVersion + 1 }).where(eq(schema.benutzer.id, b.id));
  await protokolliere(ich.name, "Überall abgemeldet");
  (await cookies()).delete(COOKIE);
  redirect("/login");
}

export async function beispieleLaden() {
  await ausfuehren("/", "Beispieldaten werden geladen. Das dauert etwa eine Minute, dann die Seite neu laden.", () => einreihen("beispieldaten"));
}

export async function beispieleEntfernen() {
  const { beispieleEntfernen: entfernen } = await import("@/lib/beispiele");
  let ergebnis = "";
  await ausfuehren("/system", "Beispieldaten entfernt", async () => {
    ergebnis = await entfernen();
    return { ok: ergebnis };
  });
}

export async function ausgabeSpeichern(f: FormData) {
  const id = f.get("id") ? Number(f.get("id")) : undefined;
  const { ausgabeSpeichern: speichern } = await import("@/lib/finanzen");
  // „zurueck“ führt nach dem Speichern in den gleichen Zeitraum zurück (internerPfad prüft das Ziel in ausfuehren)
  await ausfuehren(f.get("zurueck") ? String(f.get("zurueck")) : "/finanzen", f.get("nurBeleg") === "ja" ? "Beleg hochgeladen. Der Beleg-Agent liest ihn aus, bitte danach prüfen." : "Ausgabe gespeichert", async (wer) => {
    const neu = await speichern(f, wer, id);
    if (f.get("nurBeleg") === "ja") return { ziel: `/finanzen/ausgabe/${neu}` };
  });
}

/** Plan je Ausgaben-Kategorie (Euro im Monat) anpassen. */
export async function kostenplanAnpassen(f: FormData) {
  await ausfuehren(f.get("zurueck") ? String(f.get("zurueck")) : "/finanzen", "Plan je Kategorie gespeichert", async (wer) => {
    const { KATEGORIEN, kostenplanSpeichern } = await import("@/lib/finanzen");
    const werte: Record<string, number> = {};
    for (const k of KATEGORIEN) {
      const roh = text(f, `plan-${k.key}`);
      if (roh === "") continue;
      werte[k.key] = Math.round(Number(roh.replace(/\./g, "").replace(",", ".")) * 100);
    }
    await kostenplanSpeichern(werte, wer);
  }, "verwalten");
}

export async function ausgabeLoeschen(f: FormData) {
  await ausfuehren("/finanzen", "Ausgabe gelöscht", async (wer) => {
    const db = await getDb();
    const [a] = await db.delete(schema.ausgaben).where(eq(schema.ausgaben.id, zahl(f, "id"))).returning();
    await protokolliere(wer, `Ausgabe gelöscht: ${a?.lieferant}`);
  });
}

export async function rechnungBezahlt(f: FormData) {
  const { rechnungBezahlt: bezahlt } = await import("@/lib/finanzen");
  await ausfuehren(`/finanzen?z=${text(f, "z")}`, "Als bezahlt markiert", (wer) => bezahlt(zahl(f, "id"), wer));
}

export async function berichtVorbereiten() {
  await ausfuehren("/freigaben", "Bericht an den Steuerberater wird vorbereitet und kommt gleich in die Freigabe.", () => einreihen("steuerberater"));
}

export async function angebotErstellen(f: FormData) {
  const id = zahl(f, "id");
  const { erstelleAngebot } = await import("@/lib/ablauf/verkauf");
  await ausfuehren(`/leads/${id}/angebot`, "Angebot gespeichert. Jetzt die E-Mail dazu schreiben oder direkt auf dem Tablet unterschreiben.", async (wer) => {
    const betrag = (k: string) => {
      const t = text(f, k);
      return t ? Math.round(Number(t.replace(/\./g, "").replace(",", ".")) * 100) : 0;
    };
    const { angebotId } = await erstelleAngebot({
      betriebId: id,
      auswahl: {
        paket: text(f, "paket") as import("@/lib/pakete").PaketKey,
        module: f.getAll("module").map(String),
        zusaetze: f.getAll("zusaetze").map(String),
        pilot: f.get("pilot") === "ja",
        individuell: { einmalig: betrag("individuellEinmalig"), monatlich: betrag("individuellMonatlich"), text: text(f, "individuellText") },
        prozessCheckAnrechnen: f.get("prozessCheckAnrechnen") === "ja",
      },
      einleitung: text(f, "einleitung") || undefined,
      wer,
      mail: false, // Schritt 2: E-Mail erst nach dem Speichern formulieren
    });
    return { ziel: `/leads/${id}/angebot/${angebotId}` };
  });
}

export async function angebotAendern(f: FormData) {
  const id = zahl(f, "id");
  const { angebotAendern: aendern } = await import("@/lib/ablauf/angebot-bearbeiten");
  await ausfuehren(`/freigaben/${id}`, "Angebot angepasst. Qualitätskontrolle läuft neu.", (wer) => aendern(id, JSON.parse(String(f.get("daten"))), wer));
}

export async function kontostandSpeichern(f: FormData) {
  const { inCent } = await import("@/lib/finanzen");
  await ausfuehren("/finanzen/plan", "Kontostand gespeichert", async (wer) => {
    const monat = text(f, "monat");
    if (!/^\d{4}-\d{2}$/.test(monat)) throw new Error("Bitte einen Monat wählen.");
    const betrag = inCent(text(f, "betrag"));
    const db = await getDb();
    await db.insert(schema.kontostaende).values({ monat, betrag, erfasstVon: wer }).onConflictDoUpdate({ target: schema.kontostaende.monat, set: { betrag, erfasstVon: wer, am: new Date() } });
    await protokolliere(wer, `Kontostand ${monat} erfasst`);
  });
}

export async function unterlageSpeichern(f: FormData) {
  const key = text(f, "key");
  await ausfuehren("/unterlagen", "Unterlage gespeichert", async (wer) => {
    const { speichern } = await import("@/lib/unterlagen");
    const d = f.get("datei");
    await speichern(key, { status: text(f, "status"), notiz: text(f, "notiz"), datei: d instanceof File ? d : null }, wer);
  });
}

export async function abnahmeErneut(f: FormData) {
  const id = zahl(f, "id");
  await ausfuehren(`/projekte/${id}`, "Bitte um Abnahme liegt im Postausgang", async (wer) => (await import("@/lib/ablauf/vertrag")).abnahmeAnfordern(id, wer));
}

export async function kuendigungErfassen(f: FormData) {
  const id = zahl(f, "id");
  await ausfuehren(`/projekte/${id}`, "Kündigung erfasst, Bestätigung liegt im Postausgang", async (wer) => {
    const eingang = new Date(`${text(f, "eingang")}T12:00:00`);
    if (Number.isNaN(eingang.getTime())) throw new Error("Datum fehlt");
    await (await import("@/lib/ablauf/vertrag")).kuendigungErfassen(id, wer, eingang);
  });
}

export async function datenLoeschen(f: FormData) {
  const id = zahl(f, "id");
  await ausfuehren(`/leads/${id}`, "Gelöscht", async (wer) => {
    const ergebnis = await (await import("@/lib/ablauf/datenschutz")).allesLoeschen(id, text(f, "bestaetigung"), wer);
    return { ziel: "/leads", ok: ergebnis };
  });
}

export async function umzugPruefen(f: FormData) {
  const id = zahl(f, "id");
  await ausfuehren(`/projekte/${id}`, "Prüfung läuft. In ein paar Sekunden neu laden.", async () => {
    await einreihen("umzug_bestand", { projektId: id });
    await einreihen("umzug_pruefen", {});
  });
}

export async function providerwechselErledigt(f: FormData) {
  const id = zahl(f, "id");
  await ausfuehren(`/projekte/${id}`, "Vermerkt. Levarex OS prüft jetzt, ob die Domain auf uns zeigt.", async (wer) => (await import("@/lib/ablauf/umzug")).providerwechselErledigt(id, wer));
}

// ---------- CRM: Kontakte, Aktivitäten, Aufgaben ----------

const datumAus = (f: FormData, k: string, uhr = "09:00") => {
  const t = text(f, k);
  if (!t) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) throw new Error("Datum ungültig");
  return berlinZeit(t, text(f, `${k}Uhr`) || uhr);
};

export async function kontaktSpeichern(f: FormData) {
  const betriebId = zahl(f, "betriebId");
  await ausfuehren(`/leads/${betriebId}`, "Kontakt gespeichert", async (wer) =>
    (await import("@/lib/ablauf/crm")).kontaktSpeichern({ id: zahl(f, "id") || undefined, betriebId, name: text(f, "name"), rolle: text(f, "rolle"), telefon: text(f, "telefon"), email: text(f, "email"), notiz: text(f, "notiz"), haupt: f.get("haupt") === "ja" }, wer),
  );
}

export async function kontaktLoeschen(f: FormData) {
  await ausfuehren(`/leads/${zahl(f, "betriebId")}`, "Kontakt gelöscht", async (wer) => (await import("@/lib/ablauf/crm")).kontaktLoeschen(zahl(f, "id"), wer));
}

export async function aktivitaetAnlegen(f: FormData) {
  const zurueck = text(f, "zurueck") || "/aufgaben";
  await ausfuehren(zurueck, "Gespeichert", async (wer) => {
    const crm = await import("@/lib/ablauf/crm");
    const art = text(f, "art") as "notiz";
    await crm.aktivitaetAnlegen(
      { betriebId: zahl(f, "betriebId") || null, projektId: zahl(f, "projektId") || null, ticketId: zahl(f, "ticketId") || null, art, titel: text(f, "titel") || crm.ARTEN[art] || "", text: text(f, "text"), faelligAm: datumAus(f, "faellig"), dauerMin: zahl(f, "dauer") || null, zustaendig: text(f, "zustaendig") || null },
      wer,
    );
  });
}

export async function aufgabeErledigen(f: FormData) {
  await ausfuehren(text(f, "zurueck") || "/aufgaben", "Erledigt", async (wer) => (await import("@/lib/ablauf/crm")).erledigen(zahl(f, "id"), f.get("rueckgaengig") !== "ja", wer));
}

export async function aufgabeVerschieben(f: FormData) {
  await ausfuehren(text(f, "zurueck") || "/aufgaben", "Verschoben", async () => {
    await (await import("@/lib/ablauf/crm")).verschieben(zahl(f, "id"), inTagen(zahl(f, "tage") || 1));
  });
}

export async function betriebZuweisen(f: FormData) {
  const id = zahl(f, "id");
  await ausfuehren(`/leads/${id}?tab=zustaendig`, "Gespeichert", async () => (await import("@/lib/pipeline")).betriebZuweisen(id, text(f, "zustaendig") || null, text(f, "tags").split(",")));
}

// ---------- Lieferung: Checkliste und Zeiten ----------

export async function checklistePunkt(f: FormData) {
  const projektId = zahl(f, "projektId");
  await ausfuehren(`/projekte/${projektId}`, "Gespeichert", async (wer) => {
    const c = await import("@/lib/ablauf/checkliste");
    if (zahl(f, "id")) await c.umschalten(zahl(f, "id"), wer);
    else await c.punktHinzufuegen(projektId, text(f, "phase"), text(f, "titel"));
  });
}

export async function zeitErfassen(f: FormData) {
  const zurueck = text(f, "zurueck") || "/";
  await ausfuehren(zurueck, "Zeit erfasst", async (wer) => {
    const minuten = zahl(f, "minuten") || Math.round(Number(text(f, "stunden").replace(",", ".")) * 60);
    await (await import("@/lib/ablauf/zeiten")).zeitErfassen({ projektId: zahl(f, "projektId") || null, betriebId: zahl(f, "betriebId") || null, minuten, taetigkeit: text(f, "taetigkeit"), baustein: text(f, "baustein"), notiz: text(f, "notiz"), datum: datumAus(f, "datum", "12:00") ?? undefined }, wer);
  });
}

export async function zeitLoeschen(f: FormData) {
  await ausfuehren(text(f, "zurueck") || "/", "Gelöscht", async () => (await import("@/lib/ablauf/zeiten")).zeitLoeschen(zahl(f, "id")));
}

// ---------- Tickets ----------

export async function ticketAnlegen(f: FormData) {
  await ausfuehren("/tickets", "Ticket angelegt", async (wer) => {
    // Kunde gewählt oder anhand von Telefonnummer bzw. E-Mail des Anrufers gefunden
    let betriebId = zahl(f, "betriebId");
    if (!betriebId && text(f, "kontakt")) betriebId = (await (await import("@/lib/ablauf/nachrichten")).zuordnen(text(f, "kontakt"))).betriebId ?? 0;
    if (!betriebId) throw new Error(text(f, "kontakt") ? `Zu „${text(f, "kontakt")}“ ist kein Kunde bekannt. Bitte den Kunden auswählen.` : "Bitte den Kunden auswählen oder Telefon bzw. E-Mail eintragen.");
    const id = await (await import("@/lib/ablauf/tickets")).ticketAnlegen({ betriebId, betreff: text(f, "betreff"), beschreibung: text(f, "beschreibung"), kategorie: text(f, "kategorie"), prioritaet: text(f, "prioritaet"), quelle: text(f, "quelle") || "telefon" }, wer);
    return { ziel: `/tickets/${id}` };
  });
}

export async function ticketAendern(f: FormData) {
  const id = zahl(f, "id");
  await ausfuehren(`/tickets/${id}`, "Gespeichert", async (wer) => (await import("@/lib/ablauf/tickets")).ticketAendern(id, { status: text(f, "status"), zustaendig: text(f, "zustaendig"), prioritaet: text(f, "prioritaet") }, wer));
}

export async function ticketZeit(f: FormData) {
  const id = zahl(f, "id");
  await ausfuehren(`/tickets/${id}`, "Zeit gebucht", async (wer) => (await import("@/lib/ablauf/tickets")).ticketZeit(id, zahl(f, "minuten"), text(f, "notiz"), wer));
}

export async function ticketAntworten(f: FormData) {
  const id = zahl(f, "id");
  await ausfuehren(`/tickets/${id}`, "Antwort liegt im Postausgang zur Freigabe", async (wer) => {
    await (await import("@/lib/ablauf/tickets")).ticketAntworten(id, text(f, "antwort"), f.get("erledigt") === "ja", wer);
  });
}

// ---------- Einstellungen: Benutzer, Zwei-Faktor, API, Import ----------

export async function benutzerAnlegen(f: FormData) {
  await ausfuehren("/einstellungen?reiter=benutzer", "Benutzer angelegt. Start-Passwort sicher weitergeben.", async (wer) => {
    const email = text(f, "email").toLowerCase();
    const rolle = text(f, "rolle");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("E-Mail ungültig");
    if (!["admin", "vertrieb", "technik", "lesen"].includes(rolle)) throw new Error("Rolle ungültig");
    if (text(f, "passwort").length < 10) throw new Error("Start-Passwort: mindestens 10 Zeichen");
    await (await import("@/lib/zweiter-faktor")).technikMitCode(wer, text(f, "code"), `Benutzer anlegen: ${email}`);
    const db = await getDb();
    await db.insert(schema.benutzer).values({ email, name: text(f, "name"), rolle, passwortHash: hashPasswort(text(f, "passwort")) });
    await protokolliere(wer, `Benutzer angelegt: ${email} (${rolle})`);
  }, "verwalten");
}

export async function benutzerAendern(f: FormData) {
  await ausfuehren("/einstellungen?reiter=benutzer", "Gespeichert", async (wer) => {
    const id = zahl(f, "id");
    const db = await getDb();
    const ich = await brauchtBenutzer();
    const rolle = text(f, "rolle");
    const aktiv = f.get("aktiv") === "ja";
    if (id === ich.id && (!aktiv || rolle !== "admin")) throw new Error("Du kannst dich nicht selbst sperren oder herabstufen.");
    if (!["admin", "vertrieb", "technik", "lesen"].includes(rolle)) throw new Error("Rolle ungültig");
    await (await import("@/lib/zweiter-faktor")).technikMitCode(wer, text(f, "code"), `Benutzer ${id} ändern`);
    await db.update(schema.benutzer).set({ rolle, aktiv, ...(f.get("zweiFaktorAus") === "ja" ? { totpAktiv: false, totpGeheim: null } : {}) }).where(eq(schema.benutzer.id, id));
    await protokolliere(wer, `Benutzer ${id}: ${rolle}${aktiv ? "" : ", gesperrt"}`);
  }, "verwalten");
}

export async function zweiFaktorStarten(f?: FormData) {
  await ausfuehren((f && text(f, "zurueck")) || "/einstellungen", "Code mit der App scannen und bestätigen", async () => {
    const ich = await brauchtBenutzer();
    const db = await getDb();
    // Geheimnis verschlüsselt speichern: ein Datenbank-Abzug allein reicht nicht für den zweiten Faktor
    await db.update(schema.benutzer).set({ totpGeheim: verschluessele((await import("@/lib/totp")).neuesGeheimnis()), totpAktiv: false, totpLetzterSchritt: null }).where(eq(schema.benutzer.id, ich.id));
  });
}

export async function zweiFaktorBestaetigen(f: FormData) {
  await ausfuehren(text(f, "weiter") || "/einstellungen", "Zwei-Faktor-Anmeldung ist aktiv", async (wer) => {
    const ich = await brauchtBenutzer();
    const db = await getDb();
    const [b] = await db.select().from(schema.benutzer).where(eq(schema.benutzer.id, ich.id));
    const schritt = b.totpGeheim ? (await import("@/lib/totp")).pruefeMitSchritt(entschluessele(b.totpGeheim), text(f, "code")) : null;
    if (schritt === null) throw new Error("Der Code stimmt nicht. Uhrzeit am Handy prüfen und den aktuellen Code eingeben.");
    await db.update(schema.benutzer).set({ totpAktiv: true, totpLetzterSchritt: schritt }).where(eq(schema.benutzer.id, ich.id));
    await protokolliere(wer, "Zwei-Faktor-Anmeldung eingeschaltet");
  });
}

export async function apiSchluesselErzeugen(f: FormData) {
  const b = await brauchtBenutzer();
  if (!darf(b, "verwalten")) redirect("/einstellungen?reiter=schnittstelle&fehler=" + encodeURIComponent("Das darf nur ein Admin."));
  const faktor = await (await import("@/lib/zweiter-faktor")).technikMitCode(b.name, text(f, "code"), `API-Schlüssel ${text(f, "name")}`).catch((e: Error) => e);
  if (faktor instanceof Error) redirect("/einstellungen?reiter=schnittstelle&fehler=" + encodeURIComponent(faktor.message));
  const schluessel = await (await import("@/lib/api")).schluesselErzeugen(text(f, "name"), f.getAll("rechte").map(String), b.name).catch((e: Error) => e);
  if (schluessel instanceof Error) redirect("/einstellungen?reiter=schnittstelle&fehler=" + encodeURIComponent(schluessel.message));
  // Der Schlüssel wird genau einmal angezeigt (nur in einem kurzlebigen Cookie, nicht in der Adresse)
  (await cookies()).set("lvx_neuer_schluessel", schluessel, { httpOnly: true, sameSite: "strict", path: "/einstellungen", maxAge: 120 });
  redirect("/einstellungen?reiter=schnittstelle&ok=" + encodeURIComponent("Schlüssel erzeugt. Jetzt kopieren, er wird nur einmal angezeigt."));
}

export async function webhookAnlegen(f: FormData) {
  const b = await brauchtBenutzer();
  if (!darf(b, "verwalten")) redirect("/einstellungen?reiter=schnittstelle&fehler=" + encodeURIComponent("Das darf nur ein Admin."));
  const faktor = await (await import("@/lib/zweiter-faktor")).technikMitCode(b.name, text(f, "code"), `Webhook ${text(f, "name")}`).catch((e: Error) => e);
  if (faktor instanceof Error) redirect("/einstellungen?reiter=schnittstelle&fehler=" + encodeURIComponent(faktor.message));
  const w = await (await import("@/lib/webhooks")).webhookAnlegen({ name: text(f, "name"), url: text(f, "url"), ereignisse: f.getAll("ereignisse").map(String) }, b.name).catch((e: Error) => e);
  if (w instanceof Error) redirect("/einstellungen?reiter=schnittstelle&fehler=" + encodeURIComponent(w.message));
  // Geheimnis nur einmal zeigen (kurzlebiges Cookie, nicht in der Adresse)
  (await cookies()).set("lvx_neues_geheimnis", w.geheimnis, { httpOnly: true, sameSite: "strict", path: "/einstellungen", maxAge: 120 });
  redirect("/einstellungen?reiter=schnittstelle&ok=" + encodeURIComponent("Webhook angelegt. Geheimnis jetzt in n8n eintragen, es wird nur einmal angezeigt."));
}

export async function webhookLoeschen(f: FormData) {
  await ausfuehren("/einstellungen?reiter=schnittstelle", "Webhook gelöscht", async (wer) => (await import("@/lib/webhooks")).webhookLoeschen(zahl(f, "id"), wer), "verwalten");
}

export async function apiSchluesselWiderrufen(f: FormData) {
  await ausfuehren("/einstellungen?reiter=schnittstelle", "Widerrufen", async (wer) => (await import("@/lib/api")).schluesselWiderrufen(zahl(f, "id"), wer), "verwalten");
}

export async function leadsImportieren(f: FormData) {
  await ausfuehren("/leads", "Import fertig", async (wer) => {
    const datei = f.get("datei");
    if (!(datei instanceof File) || !datei.size) throw new Error("Bitte eine CSV-Datei wählen");
    if (datei.size > 5 * 1024 * 1024) throw new Error("Datei zu groß (höchstens 5 MB)");
    const r = await (await import("@/lib/import")).leadsImportieren(await datei.text(), wer);
    return { ok: `${r.neu} Leads importiert${r.uebersprungen.length ? `, ${r.uebersprungen.length} übersprungen (${r.uebersprungen.slice(0, 5).map((x) => `Zeile ${x.zeile}: ${x.grund}`).join("; ")}${r.uebersprungen.length > 5 ? " …" : ""})` : ""}` };
  });
}

// ---------- Datenschutz: Datenpannen und Betroffenenanfragen ----------

export async function panneErfassen(f: FormData) {
  await ausfuehren("/datenschutz", "Datenpanne erfasst. Jetzt bewerten: Frist 72 Stunden.", async (wer) => {
    const ds = await import("@/lib/ablauf/datenschutz");
    await ds.panneErfassen({ entdecktAm: datumAus(f, "datum") ?? new Date(), beschreibung: text(f, "beschreibung"), betroffene: text(f, "betroffene"), daten: text(f, "daten") }, wer);
  });
}

export async function panneAktualisieren(f: FormData) {
  await ausfuehren("/datenschutz", "Gespeichert", async (wer) =>
    (await import("@/lib/ablauf/datenschutz")).panneAktualisieren(zahl(f, "id"), { risiko: text(f, "risiko"), massnahmen: text(f, "massnahmen"), gemeldet: f.get("gemeldet") === "ja", informiert: f.get("informiert") === "ja", abgeschlossen: f.get("abgeschlossen") === "ja" }, wer),
  );
}

export async function betroffenenanfrageErfassen(f: FormData) {
  await ausfuehren("/datenschutz", "Anfrage erfasst. Frist: ein Monat.", async (wer) =>
    (await import("@/lib/ablauf/datenschutz")).betroffenenanfrageErfassen({ eingangAm: datumAus(f, "eingang", "12:00") ?? new Date(), art: text(f, "art"), person: text(f, "person"), notiz: text(f, "notiz") }, wer),
  );
}

export async function betroffenenanfrageErledigt(f: FormData) {
  await ausfuehren("/datenschutz", "Erledigt", async (wer) => (await import("@/lib/ablauf/datenschutz")).betroffenenanfrageErledigt(zahl(f, "id"), wer));
}

// ---------- Stammdaten: Katalog und Soll-Umsätze (nur Admin) ----------

const formularDaten = (f: FormData) => Object.fromEntries([...f.entries()].filter(([, v]) => typeof v === "string"));

export async function paketSpeichern(f: FormData) {
  await ausfuehren("/stammdaten?reiter=webauftritt", "Paket gespeichert. Gilt für neue Angebote.", async (wer) => (await import("@/lib/katalog-db")).paketSpeichern(text(f, "key"), formularDaten(f), wer), "verwalten");
}

export async function modulSpeichern(f: FormData) {
  await ausfuehren("/stammdaten?reiter=module", "Modul gespeichert. Gilt für neue Angebote.", async (wer) => {
    await (await import("@/lib/katalog-db")).modulSpeichern(text(f, "key") || null, formularDaten(f), wer);
  }, "verwalten");
}

export async function zusatzSpeichern(f: FormData) {
  await ausfuehren("/stammdaten?reiter=zusatz", "Zusatzleistung gespeichert. Gilt für neue Angebote.", async (wer) => {
    await (await import("@/lib/katalog-db")).zusatzSpeichern(text(f, "key") || null, formularDaten(f), wer);
  }, "verwalten");
}

export async function katalogZuruecksetzen(f: FormData) {
  const art = text(f, "art");
  await ausfuehren(`/stammdaten?reiter=${art === "paket" ? "webauftritt" : art === "modul" ? "module" : "zusatz"}`, "Auf Werkseinstellung zurückgesetzt", async (wer) => (await import("@/lib/katalog-db")).zuruecksetzen(art, text(f, "key"), wer), "verwalten");
}

export async function angebotVorlageSpeichern(f: FormData) {
  await ausfuehren("/stammdaten/angebot", "Angebotsvorlage gespeichert. Gilt für neue Angebote.", async (wer) =>
    (await import("@/lib/katalog-db")).angebotVorlageSpeichern({ gueltigTage: f.get("gueltigTage"), einstieg: f.get("einstieg"), ablauf: f.get("ablauf"), unterschreiben: f.get("unterschreiben"), mail: f.get("mail") }, wer), "verwalten");
}

export async function sollSpeichern(f: FormData) {
  await ausfuehren("/stammdaten/ziele", "Soll-Umsätze gespeichert", async (wer) => {
    const monate = f.getAll("monat").map(String);
    const { PLAN_BAUSTEINE } = await import("@/lib/plan");
    const werte = monate.map((m) => ({ monat: m, stueck: Object.fromEntries(PLAN_BAUSTEINE.map((b) => [b.key, Number(text(f, `${b.key}-${m}`) || 0)])) }));
    const n = await (await import("@/lib/soll")).sollSpeichern(werte, wer);
    return { ok: `Gespeichert. ${n} Monate weichen vom Business Case ab.` };
  }, "verwalten");
}

export async function testmailAnMich() {
  const ich = await brauchtBenutzer();
  await ausfuehren("/stammdaten/konnektoren", "Testmail liegt in den Freigaben", async (wer) => {
    const { aktiverMailDienst, MAIL_DIENSTE } = await import("@/lib/adapters/mail");
    const id = await post.inPostausgang({
      kanal: "mail",
      zweck: "testmail",
      empfaenger: ich.email,
      betreff: "Testmail aus Levarex OS",
      text: `Hallo ${wer.split(" ")[0]},\n\ndiese Mail prüft den Versandweg „${MAIL_DIENSTE[aktiverMailDienst()].name}“. Wenn sie im Postfach ankommt, im Levarex-Design und mit Signatur, ist alles richtig angeschlossen.\n\nAuch Testmails gehen nur nach Qualitätskontrolle und Freigabe raus.`,
    });
    return { ziel: `/freigaben/${id}` };
  });
}

export async function nachrichtZuordnen(f: FormData) {
  await ausfuehren("/", "Nachricht zugeordnet", async (wer) => {
    const n = await import("@/lib/ablauf/nachrichten");
    await n.nachrichtZuordnen(zahl(f, "id"), zahl(f, "betriebId"), wer);
  });
}

export async function nachrichtErledigt(f: FormData) {
  await ausfuehren(text(f, "zurueck") || "/", "Erledigt", async (wer) => (await import("@/lib/ablauf/nachrichten")).nachrichtErledigt(zahl(f, "id"), wer));
}

export async function antwortEntwerfen(f: FormData) {
  await ausfuehren(text(f, "zurueck") || "/freigaben", "Entwurf liegt in den Freigaben", async () => {
    const r = await (await import("@/lib/ablauf/nachrichten")).antwortEntwerfen(zahl(f, "id"));
    return { ok: r };
  });
}

export async function portalZugangAnlegen(f: FormData) {
  const id = zahl(f, "betriebId");
  await ausfuehren(`/leads/${id}?tab=datenschutz`, "Zugang angelegt. Die Mail mit dem Link liegt in den Freigaben.", async (wer) => (await import("@/lib/kundenportal")).zugangAnlegen({ betriebId: id, name: text(f, "name"), email: text(f, "email") }, wer));
}

export async function portalZugangSperren(f: FormData) {
  const id = zahl(f, "betriebId");
  await ausfuehren(`/leads/${id}?tab=datenschutz`, "Zugang gesperrt. Der Link funktioniert ab sofort nicht mehr.", async (wer) => (await import("@/lib/kundenportal")).zugangSperren(zahl(f, "id"), wer));
}

export async function portalLinkErneuern(f: FormData) {
  const id = zahl(f, "id");
  await ausfuehren(`/leads/${id}?tab=datenschutz`, "Neuer Portal-Link erzeugt. Der alte ist gesperrt; die Mail mit dem neuen Link liegt in den Freigaben.", async (wer) => {
    const kp = await import("@/lib/kundenportal");
    await kp.portalLinkErneuern(id, wer);
    const db = await getDb();
    const [b] = await db.select().from(schema.betriebe).where(eq(schema.betriebe.id, id));
    if (b?.email) await kp.zugangAnfordern(b.email);
  });
}

// ---------- Vertrieb: Besuchsbericht nach dem Besuch ----------

export async function besuchErfassen(f: FormData) {
  await ausfuehren(text(f, "zurueck") || "/leads", "Besuch gespeichert", async (wer) => {
    await (await import("@/lib/ablauf/vertrieb")).besuchErfassen(
      {
        betriebId: zahl(f, "betriebId"),
        // Angetroffen ergibt sich aus dem Ergebnis (nur „Inhaber nicht da“ heißt nein); altes Häkchen gilt weiter
        inhaberAngetroffen: f.get("angetroffen") === "ja" || (f.get("angetroffen") === null && text(f, "ergebnis") !== "nicht_angetroffen"),
        dauerMin: zahl(f, "dauer") || null,
        einwand: text(f, "einwand"),
        paket: text(f, "paket"),
        variante: text(f, "variante"),
        ergebnis: text(f, "ergebnis"),
        ruecktritt: f.get("ruecktritt") === "ja",
        einwilligungKontakt: text(f, "kontakt"),
        art14Info: f.get("art14") === "ja",
        preistest: text(f, "preistest"),
      },
      wer,
    );
    // Wiedervorlage: Erinnerung in „Mein Tag“
    const wv = datumAus(f, "wiedervorlage");
    if (wv) {
      const crm = await import("@/lib/ablauf/crm");
      await crm.aktivitaetAnlegen({ betriebId: zahl(f, "betriebId"), art: "aufgabe", titel: "Nachfassen nach Besuch", text: text(f, "einwand"), faelligAm: wv }, wer);
    }
  });
}

// ---------- Pipeline: Karte auf eine andere Stufe ziehen ----------

export async function stufeVerschieben(id: number, ziel: string): Promise<{ fehler?: string }> {
  const b = await brauchtBenutzer();
  if (!darf(b, "aendern")) return { fehler: "Dein Konto darf nur lesen." };
  try {
    await (await import("@/lib/pipeline")).stufeWechseln(Number(id), String(ziel), b.name);
    revalidatePath("/pipeline");
    return {};
  } catch (e) {
    return { fehler: e instanceof Error ? e.message : "Verschieben fehlgeschlagen" };
  }
}

// ---------- Marketing: Beiträge und Bewertungsantworten ----------

export async function beitragAnlegen(f: FormData) {
  const id = zahl(f, "betriebId");
  await ausfuehren(`/leads/${id}?tab=dokumente#beitraege`, "Entwurf angelegt.", async (wer) => {
    const bild = f.get("bild");
    const geplant = text(f, "geplantAm");
    await (await import("@/lib/beitraege")).beitragAnlegen({ betriebId: id, art: text(f, "art"), kanaele: f.getAll("kanal").map(String), text: text(f, "text"), bezug: text(f, "bezug"), geplantAm: geplant ? (await import("@/lib/format")).berlinZeit(geplant) : null, bild: bild instanceof File ? bild : null }, wer);
  });
}

export async function beitraegeVorlegen(f: FormData) {
  const id = zahl(f, "betriebId");
  await ausfuehren(`/leads/${id}?tab=dokumente#beitraege`, "Vorlage-Mail liegt in den Freigaben. Nach dem Versand sieht der Betrieb die Entwürfe im Portal.", async (wer) => {
    const eintrag = await (await import("@/lib/beitraege")).beitraegeVorlegen(id, wer);
    return { ziel: `/freigaben/${eintrag}` };
  });
}

export async function beitragUeberarbeiten(f: FormData) {
  const id = zahl(f, "betriebId");
  await ausfuehren(`/leads/${id}?tab=dokumente#beitraege`, "Entwurf geändert.", async (wer) => (await import("@/lib/beitraege")).beitragUeberarbeiten(zahl(f, "beitragId"), text(f, "text"), wer));
}

export async function beitragVeroeffentlicht(f: FormData) {
  const id = zahl(f, "betriebId");
  await ausfuehren(`/leads/${id}?tab=dokumente#beitraege`, "Als veröffentlicht markiert.", async (wer) => (await import("@/lib/beitraege")).beitragVeroeffentlicht(zahl(f, "beitragId"), wer));
}

export async function beitragLoeschen(f: FormData) {
  const id = zahl(f, "betriebId");
  await ausfuehren(`/leads/${id}?tab=dokumente#beitraege`, "Entwurf gelöscht.", async (wer) => (await import("@/lib/beitraege")).beitragLoeschen(zahl(f, "beitragId"), wer));
}

export async function protokollAusfuellen(f: FormData) {
  const id = zahl(f, "eintragId");
  const zeilen = (k: string) => text(f, k).split(/\r?\n/);
  await ausfuehren(`/freigaben/${id}`, "Protokoll ergänzt. Die Prüfung läuft neu.", (wer) => post.protokollAusfuellen(id, zahl(f, "dokumentId"), { ziele: zeilen("ziele"), probleme: zeilen("probleme") }, wer));
}

export async function anhangEntfernen(f: FormData) {
  const id = zahl(f, "eintragId");
  await ausfuehren(`/freigaben/${id}`, "Anhang entfernt. Die Prüfung läuft neu.", (wer) => post.anhangEntfernen(id, zahl(f, "dokumentId"), wer));
}

export async function angebotMailVorlegen(f: FormData) {
  const id = zahl(f, "betriebId");
  const angebotId = zahl(f, "angebotId");
  await ausfuehren(`/leads/${id}/angebot/${angebotId}`, "E-Mail liegt in den Freigaben. Nach der Prüfung freigeben, dann geht sie an den Kunden.", async (wer) => {
    const { angebotMailVorlegen: vorlegen } = await import("@/lib/ablauf/verkauf");
    const eintrag = await vorlegen({ angebotId, empfaenger: text(f, "empfaenger"), betreff: text(f, "betreff"), text: String(f.get("text") ?? ""), wer });
    return { ziel: `/freigaben/${eintrag}` };
  });
}

// ---------- Dateien mit dem Kunden ----------

export async function dateiAnKunden(f: FormData) {
  const id = zahl(f, "betriebId");
  await ausfuehren(`/leads/${id}?tab=dokumente#dateien`, "Datei hochgeladen. Mit „Im Portal bereitstellen“ geht die Hinweis-Mail in die Freigaben.", async (wer) => {
    const datei = f.get("datei");
    await (await import("@/lib/dateien")).dateiAnKunden(id, datei instanceof File ? datei : (null as unknown as File), text(f, "notiz"), wer);
  });
}

export async function dateiFreigeben(f: FormData) {
  const id = zahl(f, "betriebId");
  await ausfuehren(`/leads/${id}?tab=dokumente#dateien`, "Hinweis-Mail liegt in den Freigaben. Nach dem Versand sieht der Kunde die Datei.", async (wer) => {
    const eintrag = await (await import("@/lib/dateien")).dateiFreigeben(zahl(f, "dateiId"), wer);
    return { ziel: `/freigaben/${eintrag}` };
  });
}

export async function dateiLoeschen(f: FormData) {
  const id = zahl(f, "betriebId");
  await ausfuehren(`/leads/${id}?tab=dokumente#dateien`, "Datei gelöscht.", async (wer) => (await import("@/lib/dateien")).dateiLoeschen(zahl(f, "dateiId"), wer));
}
