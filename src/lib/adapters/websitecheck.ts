// Online-Check einer Website. Prüft, was ohne Zusatzdienst prüfbar ist.
// Lighthouse und axe kommen in Modul 8 dazu; die Struktur der Ergebnisse bleibt gleich.

import { sicheresFetch } from "../sicherheit";

export type Pruefpunkt = { name: string; ampel: "gruen" | "gelb" | "rot"; befund: string };

export async function pruefeWebsite(url: string | null | undefined): Promise<{ punkte: Pruefpunkt[]; erreichbar: boolean; ladezeitMs?: number }> {
  if (!url) {
    return {
      erreichbar: false,
      punkte: [{ name: "Website", ampel: "rot", befund: "Keine Website gefunden. Kunden, die online suchen, finden den Betrieb nicht." }],
    };
  }
  const ziel = url.startsWith("http") ? url : `https://${url}`;
  const start = Date.now();
  let html = "";
  let endUrl = ziel;
  try {
    // Nur öffentliche Adressen (eine Lead-Website darf nie auf unser internes Netz zeigen)
    const res = await sicheresFetch(ziel, { timeoutMs: 15000, headers: { "User-Agent": "Stelax-Online-Check/0.1" } });
    html = await res.text();
    endUrl = res.url;
  } catch {
    return {
      erreichbar: false,
      punkte: [{ name: "Erreichbarkeit", ampel: "rot", befund: `Die Seite ${ziel} war beim Check nicht erreichbar.` }],
    };
  }
  const ladezeitMs = Date.now() - start;
  const h = html.toLowerCase();
  const kb = Math.round(Buffer.byteLength(html) / 1024);
  const bilder = html.match(/<img\b[^>]*>/gi) ?? [];
  const ohneAlt = bilder.filter((b) => !/\balt\s*=\s*["'][^"']+["']/i.test(b)).length;
  const p = (name: string, ok: boolean, gut: string, schlecht: string, mittel = false): Pruefpunkt => ({
    name,
    ampel: ok ? "gruen" : mittel ? "gelb" : "rot",
    befund: ok ? gut : schlecht,
  });
  const punkte: Pruefpunkt[] = [
    p("Verschlüsselung", endUrl.startsWith("https://"), "Die Seite ist verschlüsselt (https).", "Die Seite ist nicht verschlüsselt. Browser zeigen eine Warnung."),
    p("Handy-Ansicht", h.includes('name="viewport"') || h.includes("name='viewport'"), "Die Seite ist für Handys eingerichtet.", "Die Seite ist nicht fürs Handy eingerichtet. Die meisten Kunden suchen am Handy."),
    p("Ladezeit", ladezeitMs < 2500, `Die Startseite lädt in ${(ladezeitMs / 1000).toFixed(1)} Sekunden.`, `Die Startseite braucht ${(ladezeitMs / 1000).toFixed(1)} Sekunden. Viele Besucher springen vorher ab.`, ladezeitMs < 5000),
    p("Anruf per Klick", h.includes("href=\"tel:") || h.includes("href='tel:"), "Kunden können am Handy direkt anrufen.", "Die Telefonnummer ist nicht anklickbar. Am Handy kostet das Anrufe."),
    p("Anfrageformular", h.includes("<form"), "Es gibt ein Formular für Anfragen.", "Kein Anfrageformular. Anfragen außerhalb der Bürozeiten gehen verloren."),
    p("Impressum", h.includes("impressum"), "Impressum ist verlinkt.", "Kein Impressum gefunden. Das ist abmahnfähig."),
    p("Datenschutz", h.includes("datenschutz"), "Datenschutzerklärung ist verlinkt.", "Keine Datenschutzerklärung gefunden. Das ist abmahnfähig."),
    p("Karriereseite", /karriere|jobs|stellenangebot|ausbildung/.test(h), "Es gibt einen Bereich für Stellen.", "Keine Karriereseite. Bewerber finden keine offenen Stellen.", true),
    p("Bildbeschreibungen", ohneAlt === 0, "Alle Bilder haben eine Beschreibung.", `${ohneAlt} von ${bilder.length} Bildern ohne Beschreibung. Das schadet Barrierefreiheit und Google.`, ohneAlt <= 2),
    p("Seitengröße", kb < 300, `Startseite ${kb} KB.`, `Startseite ${kb} KB (ohne Bilder). Das bremst am Handy.`, kb < 800),
  ];
  return { punkte, erreichbar: true, ladezeitMs };
}
