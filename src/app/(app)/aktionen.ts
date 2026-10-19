"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { brauchtBenutzer, COOKIE, hashPasswort, pruefePasswort } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { einreihen, wiederholen } from "@/lib/jobs/warteschlange";
import * as akquise from "@/lib/ablauf/akquise";
import * as post from "@/lib/ablauf/postausgang";
import * as verkauf from "@/lib/ablauf/verkauf";
import { protokolliere } from "@/lib/protokoll";

// Alle Knöpfe der Oberfläche landen hier. Jede Aktion meldet Erfolg oder Fehler zurück.

type Ergebnis = { ziel?: string; ok?: string } | void | unknown;

async function ausfuehren(ziel: string, ok: string, fn: (wer: string) => Promise<Ergebnis>): Promise<never> {
  const b = await brauchtBenutzer();
  let fehler: string | null = null;
  try {
    const r = (await fn(b.name)) as { ziel?: string; ok?: string } | undefined;
    if (r && typeof r === "object") {
      ziel = r.ziel ?? ziel;
      ok = r.ok ?? ok;
    }
  } catch (e) {
    fehler = e instanceof Error ? e.message : String(e);
  }
  revalidatePath("/", "layout");
  const trenner = ziel.includes("?") ? "&" : "?";
  redirect(`${ziel}${trenner}${fehler ? `fehler=${encodeURIComponent(fehler)}` : `ok=${encodeURIComponent(ok)}`}`);
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

export async function leadAnlegen(f: FormData) {
  await ausfuehren("/leads", "Lead angelegt", async (wer) => {
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
        website: text(f, "website"),
        mitarbeiter: f.get("mitarbeiter") ? zahl(f, "mitarbeiter") : undefined,
        score: f.get("score") ? zahl(f, "score") : 50,
        scoreGrund: text(f, "notizen") || "manuell angelegt",
        notizen: text(f, "notizen"),
      },
      "manuell",
      wer,
    );
    if (!r.id) throw new Error(`Nicht angelegt: Betrieb ${r.grund}.`);
    return { ziel: `/leads/${r.id}` };
  });
}

export async function betriebSpeichern(f: FormData) {
  const id = zahl(f, "id");
  await ausfuehren(`/leads/${id}`, "Gespeichert", async (wer) => {
    const db = await getDb();
    await db
      .update(schema.betriebe)
      .set({
        name: text(f, "name"),
        gewerk: text(f, "gewerk"),
        anrede: text(f, "anrede"),
        inhaber: text(f, "inhaber") || null,
        strasse: text(f, "strasse") || null,
        plz: text(f, "plz") || null,
        ort: text(f, "ort") || null,
        telefon: text(f, "telefon") || null,
        email: text(f, "email") || null,
        website: text(f, "website") || null,
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
    if (empfaenger) await db.update(schema.postausgang).set({ empfaenger }).where(eq(schema.postausgang.id, id));
    await post.bearbeiten(id, text(f, "betreff"), String(f.get("text") ?? ""), wer);
  });
}

export async function terminHochladen(f: FormData) {
  const id = zahl(f, "id");
  await ausfuehren(`/leads/${id}`, "Aufnahme gespeichert. Protokoll und Angebot werden erstellt.", (wer) =>
    verkauf.terminAufnehmen({ betriebId: id, datei: f.get("aufnahme") as File, einwilligung: f.get("einwilligung") === "ja", wer }),
  );
}

export async function unterschriftSimulieren(f: FormData) {
  const id = zahl(f, "betriebId");
  await ausfuehren(`/leads/${id}`, "Unterschrift eingetragen. Rechnung über die Anzahlung liegt zur Freigabe.", (wer) => verkauf.unterschriftEingegangen(zahl(f, "angebotId"), `${wer} (Simulator)`));
}

export async function zahlungSimulieren(f: FormData) {
  const id = zahl(f, "betriebId");
  await ausfuehren(`/leads/${id}`, "Zahlung eingetragen. Projekt angelegt, Start-Mail liegt zur Freigabe.", (wer) => verkauf.zahlungEingegangen(zahl(f, "angebotId"), `${wer} (Simulator)`));
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

export async function passwortAendern(f: FormData) {
  await ausfuehren("/system", "Passwort geändert", async (wer) => {
    const neu = String(f.get("neu") ?? "");
    if (neu.length < 12) throw new Error("Das neue Passwort braucht mindestens 12 Zeichen.");
    const db = await getDb();
    const [b] = await db.select().from(schema.benutzer).where(eq(schema.benutzer.name, wer));
    if (!b || !pruefePasswort(String(f.get("alt") ?? ""), b.passwortHash)) throw new Error("Das bisherige Passwort stimmt nicht.");
    await db.update(schema.benutzer).set({ passwortHash: hashPasswort(neu) }).where(eq(schema.benutzer.id, b.id));
    await protokolliere(wer, "Passwort geändert");
  });
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
  await ausfuehren("/finanzen", f.get("nurBeleg") === "ja" ? "Beleg hochgeladen. Der Beleg-Agent liest ihn aus, bitte danach prüfen." : "Ausgabe gespeichert", async (wer) => {
    const neu = await speichern(f, wer, id);
    if (f.get("nurBeleg") === "ja") return { ziel: `/finanzen/ausgabe/${neu}` };
  });
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
  await ausfuehren(`/leads/${id}/angebot`, "Angebot erstellt. Qualitätskontrolle läuft, danach freigeben.", async (wer) => {
    const db = await getDb();
    const email = text(f, "email");
    if (email) await db.update(schema.betriebe).set({ email }).where(eq(schema.betriebe.id, id));
    const preis8 = text(f, "preisModul8");
    const { eintragId } = await erstelleAngebot({
      betriebId: id,
      auswahl: {
        paket: text(f, "paket") as import("@/lib/pakete").PaketKey,
        module: f.getAll("module").map(String),
        zusaetze: f.getAll("zusaetze").map(String),
        preisModul8: preis8 ? Math.round(Number(preis8.replace(/\./g, "").replace(",", ".")) * 100) : undefined,
        prozessCheckAnrechnen: f.get("prozessCheckAnrechnen") === "ja",
      },
      einleitung: text(f, "einleitung") || undefined,
      wer,
    });
    return { ziel: `/freigaben/${eintragId}` };
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
