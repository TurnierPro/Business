import fs from "node:fs";
import path from "node:path";
import { datenOrdner } from "../pfade";

// Branchenvorlage für Kunden-Websites: Startseite, Leistungen, Kontakt. Statisches HTML, ohne Cookies,
// ohne externe Schriften oder Skripte. Später als Astro-Vorlage, die Inhalte bleiben dasselbe JSON.

export type SeitenInhalt = {
  firma: string;
  gewerk: string;
  ort: string;
  telefon: string;
  email?: string;
  strasse?: string;
  plz?: string;
  claim: string;
  einleitung: string;
  leistungen: { titel: string; text: string }[];
  ueberUns: string;
  bilder: { datei: string; alt: string }[];
  farbe?: string;
  demo: boolean;
  karriere?: { titel: string; text: string }[];
};

const GEWERK_TEXTE: Record<string, { claim: string; leistungen: { titel: string; text: string }[] }> = {
  SHK: {
    claim: "Bad, Heizung, Sanitär. Sauber gemacht.",
    leistungen: [
      { titel: "Heizung", text: "Neue Heizung, Wartung und Reparatur. Wir beraten auch zu Wärmepumpen und Förderung." },
      { titel: "Bad", text: "Vom Austausch der Armatur bis zum kompletten Bad. Alles aus einer Hand." },
      { titel: "Notdienst", text: "Rohrbruch oder Heizungsausfall: Wir kommen schnell." },
    ],
  },
  Elektro: {
    claim: "Strom, Licht, Technik. Zuverlässig verlegt.",
    leistungen: [
      { titel: "Elektroinstallation", text: "Neubau, Altbau, Umbau. Sauber geplant und dokumentiert." },
      { titel: "Photovoltaik und Wallbox", text: "Strom vom eigenen Dach und Laden zu Hause." },
      { titel: "Prüfung", text: "E-Check und Prüfung nach DGUV V3 für Betriebe." },
    ],
  },
  Schreiner: {
    claim: "Möbel und Innenausbau nach Maß.",
    leistungen: [
      { titel: "Möbel nach Maß", text: "Küchen, Schränke, Einbauten. Geplant für Ihren Raum." },
      { titel: "Innenausbau", text: "Türen, Treppen, Böden und Verkleidungen." },
      { titel: "Fenster", text: "Austausch und Reparatur von Holzfenstern." },
    ],
  },
  Maler: {
    claim: "Farbe, Putz, Fassade. Ordentlich gemacht.",
    leistungen: [
      { titel: "Innenräume", text: "Streichen, Tapezieren, Spachteltechniken." },
      { titel: "Fassade", text: "Anstrich, Dämmung und Putzarbeiten." },
      { titel: "Böden", text: "Bodenbeläge verlegen und erneuern." },
    ],
  },
  Kfz: {
    claim: "Ihre freie Werkstatt. Ehrlich und schnell.",
    leistungen: [
      { titel: "Inspektion", text: "Nach Herstellervorgaben, Garantie bleibt erhalten." },
      { titel: "HU/AU", text: "Hauptuntersuchung direkt bei uns im Haus." },
      { titel: "Reparatur", text: "Bremsen, Kupplung, Elektrik. Mit Kostenvoranschlag vorab." },
    ],
  },
};

export function standardInhalt(b: { name: string; gewerk: string; ort?: string | null; telefon?: string | null; email?: string | null; strasse?: string | null; plz?: string | null }, demo: boolean): SeitenInhalt {
  const g = GEWERK_TEXTE[b.gewerk] ?? GEWERK_TEXTE.SHK;
  return {
    firma: b.name,
    gewerk: b.gewerk,
    ort: b.ort ?? "",
    telefon: b.telefon ?? "",
    email: b.email ?? undefined,
    strasse: b.strasse ?? undefined,
    plz: b.plz ?? undefined,
    claim: g.claim,
    einleitung: `${b.name} ist Ihr ${b.gewerk === "Kfz" ? "Meisterbetrieb für Ihr Auto" : `${b.gewerk}-Betrieb`} in ${b.ort ?? "Ihrer Nähe"}. Schicken Sie uns Ihre Anfrage mit Fotos, wir melden uns mit einem Termin.`,
    leistungen: g.leistungen,
    ueberUns: `Wir sind ein eingespieltes Team aus ${b.ort ?? "der Region"}. Kurze Wege, feste Ansprechpartner, saubere Arbeit.`,
    bilder: [],
    demo,
  };
}

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function rahmen(i: SeitenInhalt, titel: string, beschreibung: string, inhalt: string, link: (s: string) => string): string {
  const farbe = i.farbe ?? "#1F4E5F";
  const tel = i.telefon.replace(/[^\d+]/g, "");
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titel)}</title><meta name="description" content="${esc(beschreibung)}">${i.demo ? '<meta name="robots" content="noindex, nofollow">' : ""}
<style>
*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;font-size:18px;line-height:1.6;color:#1b1f1e;background:#fbfaf7}
a{color:${farbe}}header,main,footer{max-width:1080px;margin:0 auto;padding:0 20px}
header{display:flex;justify-content:space-between;align-items:center;gap:16px;padding-top:20px;padding-bottom:20px;flex-wrap:wrap}
.marke{font-weight:700;font-size:20px;color:#1b1f1e;text-decoration:none}
nav a{margin-left:18px;text-decoration:none;color:#1b1f1e;font-weight:500}nav a:first-child{margin-left:0}
.held{padding:56px 0 40px;border-bottom:1px solid #e3e0d8}.held h1{font-size:clamp(30px,5vw,48px);line-height:1.15;margin:0 0 16px}
.knopf{display:inline-block;background:${farbe};color:#fff;padding:14px 22px;border-radius:6px;text-decoration:none;font-weight:600;margin:8px 12px 0 0}
.knopf.hell{background:transparent;color:${farbe};border:2px solid ${farbe}}
.raster{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:20px;margin:32px 0}
.karte{background:#fff;border:1px solid #e3e0d8;border-radius:6px;padding:22px}.karte h3{margin:0 0 8px}
form{display:grid;gap:14px;max-width:560px}label{font-weight:600;display:grid;gap:6px}
input,textarea{font:inherit;padding:12px;border:1px solid #9a968d;border-radius:6px;background:#fff}
textarea{min-height:140px}footer{border-top:1px solid #e3e0d8;margin-top:56px;padding-top:24px;padding-bottom:40px;font-size:15px;color:#4a4d4b}
.demo{background:#1b1f1e;color:#f5f3ee;text-align:center;padding:8px 12px;font-size:14px}
img{max-width:100%;height:auto;border-radius:6px}
:focus-visible{outline:3px solid ${farbe};outline-offset:2px}
</style></head><body>
${i.demo ? '<div class="demo" role="note">Unverbindlicher Entwurf von Nexova Consulting. Texte mit Unterstützung von KI erstellt. Nicht öffentlich, wird nach 60 Tagen gelöscht.</div>' : ""}
<header><a class="marke" href="${link("index")}">${esc(i.firma)}</a>
<nav aria-label="Hauptmenü"><a href="${link("index")}">Start</a><a href="${link("leistungen")}">Leistungen</a>${i.karriere?.length ? `<a href="${link("karriere")}">Karriere</a>` : ""}<a href="${link("kontakt")}">Kontakt</a></nav></header>
<main>${inhalt}</main>
<footer><p><strong>${esc(i.firma)}</strong><br>${esc(i.strasse ?? "")} ${esc(i.plz ?? "")} ${esc(i.ort)}<br>Telefon <a href="tel:${esc(tel)}">${esc(i.telefon)}</a>${i.email ? ` · <a href="mailto:${esc(i.email)}">${esc(i.email)}</a>` : ""}</p>
<p><a href="${link("impressum")}">Impressum</a> · <a href="${link("datenschutz")}">Datenschutz</a></p></footer>
</body></html>`;
}

export function seitenDateien(i: SeitenInhalt, link: (s: string) => string): Record<string, string> {
  const tel = i.telefon.replace(/[^\d+]/g, "");
  const bilder = i.bilder.length
    ? `<div class="raster">${i.bilder.map((b) => `<img src="${link("bild/" + b.datei)}" alt="${esc(b.alt)}" loading="lazy" width="800" height="600">`).join("")}</div>`
    : "";
  const dateien: Record<string, string> = {
    index: rahmen(
      i,
      `${i.firma} – ${i.gewerk} in ${i.ort}`,
      i.einleitung,
      `<section class="held"><h1>${esc(i.claim)}</h1><p>${esc(i.einleitung)}</p>
<a class="knopf" href="${link("kontakt")}">Anfrage mit Fotos senden</a><a class="knopf hell" href="tel:${esc(tel)}">Anrufen: ${esc(i.telefon)}</a></section>
<h2>Was wir für Sie tun</h2><div class="raster">${i.leistungen.map((l) => `<div class="karte"><h3>${esc(l.titel)}</h3><p>${esc(l.text)}</p></div>`).join("")}</div>
${bilder}<h2>Über uns</h2><p>${esc(i.ueberUns)}</p>`,
      link,
    ),
    leistungen: rahmen(
      i,
      `Leistungen – ${i.firma}`,
      `Leistungen von ${i.firma} in ${i.ort}`,
      `<section class="held"><h1>Leistungen</h1><p>Alles, was wir für Sie übernehmen.</p></section>
${i.leistungen.map((l) => `<h2>${esc(l.titel)}</h2><p>${esc(l.text)}</p>`).join("")}
<p><a class="knopf" href="${link("kontakt")}">Anfrage senden</a></p>`,
      link,
    ),
    kontakt: rahmen(
      i,
      `Kontakt – ${i.firma}`,
      `So erreichen Sie ${i.firma}`,
      `<section class="held"><h1>Anfrage senden</h1><p>Beschreiben Sie kurz, worum es geht, und hängen Sie Fotos an. Wir melden uns am nächsten Werktag.</p></section>
<form method="post" action="${link("kontakt")}" enctype="multipart/form-data">
<div style="position:absolute;left:-9999px" aria-hidden="true"><label>Bitte leer lassen<input name="webseite" tabindex="-1" autocomplete="off"></label></div>
<label>Name<input name="name" autocomplete="name" required></label>
<label>Telefon<input name="telefon" type="tel" autocomplete="tel" required></label>
<label>E-Mail<input name="email" type="email" autocomplete="email"></label>
<label>Worum geht es?<textarea name="nachricht" required></textarea></label>
<label>Fotos (optional)<input name="fotos" type="file" accept="image/*" multiple></label>
<p style="font-size:15px">Mit dem Absenden willigen Sie ein, dass wir Ihre Angaben zur Bearbeitung der Anfrage verwenden. Mehr in der <a href="${link("datenschutz")}">Datenschutzerklärung</a>.</p>
<button class="knopf" type="submit" style="border:0;cursor:pointer;font:inherit">Anfrage senden</button></form>`,
      link,
    ),
    danke: rahmen(i, `Danke – ${i.firma}`, `Ihre Anfrage an ${i.firma} ist angekommen`, `<section class="held"><h1>Danke für Ihre Anfrage</h1><p>${i.demo ? "Das ist eine Vorschau. Hier wurde nichts verschickt." : "Wir melden uns am nächsten Werktag."}</p></section><p><a class="knopf" href="${link("index")}">Zur Startseite</a></p>`, link),
    impressum: rahmen(i, `Impressum – ${i.firma}`, `Impressum ${i.firma}`, `<h1>Impressum</h1><p>Wird über den lizenzierten Rechtstexte-Anbieter eingebunden.</p>`, link),
    datenschutz: rahmen(i, `Datenschutz – ${i.firma}`, `Datenschutz ${i.firma}`, `<h1>Datenschutzerklärung</h1><p>Wird über den lizenzierten Rechtstexte-Anbieter eingebunden.</p>`, link),
  };
  if (i.karriere?.length) {
    dateien.karriere = rahmen(
      i,
      `Karriere – ${i.firma}`,
      `Offene Stellen bei ${i.firma}`,
      `<section class="held"><h1>Arbeiten bei ${esc(i.firma)}</h1><p>Bewerben geht in zwei Minuten, ohne Lebenslauf.</p></section>
${i.karriere.map((k) => `<div class="karte" style="margin-bottom:16px"><h2>${esc(k.titel)}</h2><p>${esc(k.text)}</p><a class="knopf" href="${link("kontakt")}">Kurz bewerben</a></div>`).join("")}`,
      link,
    );
  }
  return dateien;
}

export function schreibeSeite(slug: string, i: SeitenInhalt): string {
  const ordner = datenOrdner("sites", slug);
  // Platzhalter werden beim Ausliefern ersetzt (Pfad und Zugangscode), siehe app/vorschau.
  const link = (s: string) => `{{BASIS}}/${s === "index" ? "" : s}{{Q}}`;
  const dateien = seitenDateien(i, link);
  for (const [name, html] of Object.entries(dateien)) fs.writeFileSync(path.join(ordner, `${name}.html`), html);
  fs.writeFileSync(path.join(ordner, "inhalt.json"), JSON.stringify(i, null, 2));
  return ordner;
}

export function loescheSeite(slug: string): void {
  fs.rmSync(path.join(datenOrdner("sites"), slug), { recursive: true, force: true });
}
