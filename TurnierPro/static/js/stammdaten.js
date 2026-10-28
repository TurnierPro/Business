// Feste Listen für den Vertrieb (aus dem bisherigen TurnierPro-Artefakt übernommen)
// und Ableitungen, die mehrere Bereiche brauchen (Start, Vertrieb, Suche).
import { S, X, HEUTE, tageBis, datum, datumKurz, esc, num } from "./kern.js";

export const KANAELE = ["Telefon (Cold Call)", "E-Mail", "WhatsApp", "Social Media", "Persönlicher Kontakt", "Kontaktformular", "Sonstiges"];

// open: zählt zur offenen Pipeline · rang: Reihenfolge im Ablauf (9 = Abschluss)
export const STATUS = [
  { n: "Erstkontakt erfolgt", open: 1, rang: 1, farbe: "" },
  { n: "In Kontakt / Nachfassen", open: 1, rang: 2, farbe: "blau" },
  { n: "Interesse bekundet", open: 1, rang: 3, farbe: "gruen" },
  { n: "Demo / Termin vereinbart", open: 1, rang: 4, farbe: "amber" },
  { n: "Angebot gesendet", open: 1, rang: 5, farbe: "amber" },
  { n: "Gewonnen", open: 0, rang: 9, farbe: "voll" },
  { n: "Verloren / kein Interesse", open: 0, rang: 0, farbe: "rot" },
  { n: "Pausiert (später aufgreifen)", open: 1, rang: 0, farbe: "" },
];
export const GEWONNEN = "Gewonnen", VERLOREN = "Verloren / kein Interesse";
export const STm = Object.fromEntries(STATUS.map((s, i) => [s.n, { ...s, i }]));

// e: Gespräch zustande gekommen (erreicht) · q: qualifiziert · s: vorgeschlagener Status
export const ERG = [
  { n: "Keine Rückmeldung", e: 0, q: 0, s: "Erstkontakt erfolgt" },
  { n: "Rückmeldung und Interesse", e: 1, q: 0, s: "Interesse bekundet" },
  { n: "Rückmeldung und kein Interesse", e: 1, q: 0, s: VERLOREN },
  { n: "Möchte Demo-Session", e: 1, q: 1, s: "Demo / Termin vereinbart" },
  { n: "Abschluss", e: 1, q: 1, s: GEWONNEN },
  { n: "Folgetermin vereinbart", e: 1, q: 0, s: "In Kontakt / Nachfassen" },
];
export const ERGm = Object.fromEntries(ERG.map((e) => [e.n, e]));
// Anzeigetexte je Kontaktart; gespeichert wird immer der Grundwert aus ERG.
const ERGTXT = {
  "Telefon (Cold Call)": ["Keine Rückmeldung (nicht erreicht / Mailbox)", "Gespräch geführt, Interesse", "Gespräch geführt, kein Interesse", "Möchte Demo-Session (im Gespräch vereinbart)", "Abschluss (im Gespräch)", "Folgetermin vereinbart (Rückruf oder Gesprächstermin)"],
  "E-Mail": ["Keine Rückmeldung auf die E-Mail", "E-Mail-Antwort mit Interesse", "E-Mail-Antwort ohne Interesse", "Möchte Demo-Session (per E-Mail angefragt)", "Abschluss (per E-Mail bestätigt)", "Folgetermin per E-Mail vereinbart"],
  "WhatsApp": ["Keine Rückmeldung auf die WhatsApp-Nachricht", "WhatsApp-Antwort mit Interesse", "WhatsApp-Antwort ohne Interesse", "Möchte Demo-Session (per WhatsApp angefragt)", "Abschluss (per WhatsApp bestätigt)", "Folgetermin per WhatsApp vereinbart"],
  "Social Media": ["Keine Antwort auf die Nachricht", "Antwort mit Interesse", "Antwort ohne Interesse", "Möchte Demo-Session (per Nachricht angefragt)", "Abschluss (per Nachricht bestätigt)", "Folgetermin per Nachricht vereinbart"],
  "Persönlicher Kontakt": ["Keine Rückmeldung (nicht angetroffen)", "Gespräch vor Ort, Interesse", "Gespräch vor Ort, kein Interesse", "Möchte Demo-Session (vor Ort vereinbart)", "Abschluss (vor Ort)", "Folgetermin vor Ort vereinbart"],
  "Kontaktformular": ["Keine Rückmeldung auf die Formularanfrage", "Antwort auf die Anfrage mit Interesse", "Antwort auf die Anfrage ohne Interesse", "Möchte Demo-Session (über Formular angefragt)", "Abschluss (über Formular)", "Folgetermin nach Formularanfrage vereinbart"],
};
export const ergebnisText = (kanal, e) => { const i = ERG.findIndex((x) => x.n === e), t = ERGTXT[kanal]; return i >= 0 && t ? t[i] : e; };
export const ergebnisOptionen = (kanal, wert) => !kanal ? '<option value="">Bitte zuerst die Kontaktart wählen</option>'
  : '<option value="">Bitte wählen</option>' + ERG.map((e) => `<option value="${esc(e.n)}"${e.n === wert ? " selected" : ""}>${esc(ergebnisText(kanal, e.n))}</option>`).join("");

export const BUNDESLAENDER = ["Baden-Württemberg", "Bayern", "Berlin", "Brandenburg", "Bremen", "Hamburg", "Hessen", "Mecklenburg-Vorpommern", "Niedersachsen", "Nordrhein-Westfalen", "Rheinland-Pfalz", "Saarland", "Sachsen", "Sachsen-Anhalt", "Schleswig-Holstein", "Thüringen"];
export const VERBAENDE = ["Badischer Fußballverband", "Bayerischer Fußball-Verband", "Berliner Fußball-Verband", "Bremer Fußball-Verband", "Fußball- und Leichtathletik-Verband Westfalen", "Fußball-Landesverband Brandenburg", "Fußball-Verband Mittelrhein", "Fußballverband Niederrhein", "Fußballverband Rheinland", "Fußballverband Sachsen-Anhalt", "Hamburger Fußball-Verband", "Hessischer Fußball-Verband", "Landesfußballverband Mecklenburg-Vorpommern", "Niedersächsischer Fußballverband", "Saarländischer Fußballverband", "Sächsischer Fußball-Verband", "Schleswig-Holsteinischer Fußballverband", "Südbadischer Fußballverband", "Südwestdeutscher Fußballverband", "Thüringer Fußball-Verband", "Württembergischer Fußballverband", "Sonstiges"];
export const ARTEN = ["Turnier", "Hallenturnier", "Spielfest", "Camp", "Liga / Spielbetrieb", "Sonstiges"];
export const LOESUNGEN = ["Excel / Papier", "Eigene Lösung", "Konkurrenzprodukt", "Keine / unbekannt"];
export const FUNKTIONEN = ["Vorstand", "Jugendleiter", "Turnierleitung", "Geschäftsstelle", "Trainer", "Sonstiges"];

/* ── Ableitungen ─────────────────────────────────────────────────────── */
export const istOffen = (v) => !(STm[v.status] && !STm[v.status].open);
export const wvZustand = (v) => {
  if (!v.wiedervorlage || !istOffen(v)) return null;
  const d = tageBis(v.wiedervorlage, HEUTE);
  return d < 0 ? "ueber" : d === 0 ? "heute" : d <= 7 ? "woche" : "spaeter";
};
export const faelligeVereine = () => S.d.vereine.filter((v) => { const z = wvZustand(v); return z === "ueber" || z === "heute"; })
  .sort((a, b) => a.wiedervorlage.localeCompare(b.wiedervorlage));
export const aktivitaetenVon = (id) => X.aktVonVerein[id] || [];
export const letzterKontakt = (v) => { const l = aktivitaetenVon(v.id); return l.length ? l[0].datum : v.letzterKontakt || ""; };
export const terminText = (v) => v.terminOffen && !v.terminVon ? "Termin noch offen" : v.terminVon ? (v.terminBis && v.terminBis > v.terminVon ? `${datum(v.terminVon)} – ${datum(v.terminBis)}` : datum(v.terminVon)) : "";

export const statusPille = (n) => n ? `<span class="pille ${STm[n] ? STm[n].farbe : ""}">${esc(n)}</span>` : '<span class="leise">–</span>';
export function wvPille(v) {
  const z = wvZustand(v);
  if (!z) return v.wiedervorlage && !istOffen(v) ? '<span class="leise">erledigt</span>' : '<span class="leise">–</span>';
  const d = tageBis(v.wiedervorlage, HEUTE);
  if (z === "ueber") return `<span class="pille rot">${-d} ${d === -1 ? "Tag" : "Tage"} überfällig</span>`;
  if (z === "heute") return '<span class="pille amber">Heute</span>';
  return `<span class="pille ${z === "woche" ? "blau" : ""}">${esc(datumKurz(v.wiedervorlage))}</span>`;
}

/* ── Aufgaben ────────────────────────────────────────────────────────── */
export const WIEDERHOLUNG = [["", "Einmalig"], ["daily", "Täglich"], ["weekdays", "Werktags (Mo–Fr)"], ["weekly", "Wöchentlich"], ["biweekly", "Alle 2 Wochen"], ["monthly", "Monatlich"], ["quarterly", "Vierteljährlich"], ["yearly", "Jährlich"]];
export const wdhText = (r) => (WIEDERHOLUNG.find((x) => x[0] === r) || [0, ""])[1];
export const aufgabeZustand = (t) => !t.faellig ? "ohne" : t.faellig < HEUTE ? "ueber" : t.faellig === HEUTE ? "heute" : tageBis(t.faellig, HEUTE) <= 7 ? "woche" : "spaeter";
export const offeneAufgaben = (wer) => S.d.aufgaben.filter((t) => !t.erledigt && (!wer || t.zustaendig === wer));

/* ── Projekte ────────────────────────────────────────────────────────── */
export const PROJEKT_STATUS = ["Idee", "Geplant", "In Arbeit", "Erledigt"];
export const PRIOS = [["hoch", "Hoch"], ["normal", "Normal"], ["niedrig", "Niedrig"]];

/* ── Turniere und Camps für den Kalender ─────────────────────────────── */
export function termine(von, bis) {
  const liste = [];
  for (const t of S.d.termine) {
    if (!t.datum) continue;
    const b = t.ende && t.ende > t.datum ? t.ende : t.datum;
    liste.push({ id: t.id, titel: t.titel || "Ohne Titel", a: t.datum, b, ort: t.ort || "", art: t.art === "camp" ? "camp" : "turnier",
      url: /^https:\/\/(www\.)?turnierpro\.de\//.test(t.url || "") ? t.url : "", quelle: "termin" });
  }
  // Veranstaltungen aus dem Vertrieb (Termin der Vereine) mit anzeigen
  for (const v of S.d.vereine) {
    if (!v.terminVon || !v.veranstaltung) continue;
    const b = v.terminBis && v.terminBis > v.terminVon ? v.terminBis : v.terminVon;
    liste.push({ id: v.id, titel: v.veranstaltung, a: v.terminVon, b, ort: v.ort || "", art: "verein", verein: v.name, quelle: "verein" });
  }
  return liste.filter((e) => e.a <= bis && e.b >= von).sort((x, y) => x.a.localeCompare(y.a) || x.titel.localeCompare(y.titel));
}
export const summe = (l, f) => l.reduce((a, x) => a + num(f(x)), 0);
