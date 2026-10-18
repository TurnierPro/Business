import fs from "node:fs";
import path from "node:path";
import { datenOrdner } from "../pfade";

// Qualitätsprüfung vor dem Livegang. Nur wenn alles grün ist, darf Max den Livegang freigeben.
// Lighthouse und axe-core ergänzen diese Prüfung in Modul 11; die Ergebnisliste bleibt gleich aufgebaut.

export type Pruefung = { name: string; ok: boolean; detail: string };

export function pruefeSeite(slug: string): Pruefung[] {
  const ordner = path.join(datenOrdner("sites"), slug);
  const dateien = fs.readdirSync(ordner).filter((f) => f.endsWith(".html"));
  const ergebnis: Pruefung[] = [];
  const sammeln = (name: string, fehler: string[], gut: string) =>
    ergebnis.push({ name, ok: fehler.length === 0, detail: fehler.length ? fehler.join(" · ") : gut });

  const seiten = dateien.map((f) => ({ f, html: fs.readFileSync(path.join(ordner, f), "utf8") }));
  const fehlt = (pruef: (h: string) => boolean) => seiten.filter((s) => !pruef(s.html)).map((s) => s.f);

  sammeln("Pflichtseiten", ["index", "kontakt", "impressum", "datenschutz"].filter((n) => !dateien.includes(`${n}.html`)).map((n) => `${n} fehlt`), "Start, Kontakt, Impressum, Datenschutz vorhanden");
  sammeln("Sprache", fehlt((h) => /<html lang="de"/.test(h)).map((f) => `${f}: lang fehlt`), "Alle Seiten auf Deutsch ausgezeichnet");
  sammeln("Handy-Ansicht", fehlt((h) => h.includes('name="viewport"')).map((f) => `${f}: viewport fehlt`), "Alle Seiten fürs Handy eingerichtet");
  sammeln("Titel und Beschreibung", fehlt((h) => /<title>[^<]{5,}<\/title>/.test(h) && /name="description" content="[^"]{20,}"/.test(h)).map((f) => `${f}: Titel oder Beschreibung fehlt`), "Titel und Beschreibung auf allen Seiten");
  sammeln(
    "Bildbeschreibungen",
    seiten.flatMap((s) => (s.html.match(/<img\b[^>]*>/g) ?? []).filter((i) => !/alt="[^"]+"/.test(i)).map(() => `${s.f}: Bild ohne Beschreibung`)),
    "Alle Bilder beschrieben",
  );
  // Jedes Eingabefeld muss in einem <label> stehen: Labels entfernen, dann darf kein Feld übrig sein.
  sammeln(
    "Formular beschriftet",
    fehlt((h) => !/<(input(?![^>]*type="hidden")|textarea|select)\b/.test(h.replace(/<label[\s\S]*?<\/label>/g, ""))).map((f) => `${f}: Feld ohne Beschriftung`),
    "Alle Formularfelder beschriftet",
  );
  sammeln("Anruf per Klick", fehlt((h) => h.includes('href="tel:')).map((f) => `${f}: kein Telefon-Link`), "Telefon überall anklickbar");
  sammeln("Rechtstexte verlinkt", fehlt((h) => /impressum/.test(h) && /datenschutz/.test(h)).map((f) => `${f}: Link fehlt`), "Impressum und Datenschutz überall verlinkt");
  sammeln("Keine fremden Skripte", fehlt((h) => !/<script[^>]+src=/.test(h) && !/fonts\.googleapis/.test(h)).map((f) => `${f}: externes Skript oder Google Fonts`), "Keine fremden Skripte, keine Cookies");
  sammeln("Seitengröße", seiten.filter((s) => Buffer.byteLength(s.html) > 100_000).map((s) => `${s.f}: über 100 KB`), "Alle Seiten unter 100 KB");
  return ergebnis;
}
