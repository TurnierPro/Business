// Finanzen: Jahresübersicht aus der Finanzübersicht_JAHR.xlsx (nur lesen) und
// Monatsabschluss für den Steuerberater (Belege holen, KI-Prüfung, Bericht + Belegpaket).
import {
  S, X, $, esc, num, ikon, gv, JAHR, MONAT, MONATE, MON, eur, eur2, eurGanz, komma, merk, api,
  aendere, schreibe, melde, fehler, arbeit, oeffneBlatt, schliesse, blattKopf, saeulen, linie, balken, ring,
  aktionen, absenden, aenderungen,
} from "./kern.js";

export const F = {
  jahr: merk.get("f_jahr", JAHR),
  zeitraum: { a: 1, b: 12 },
  // Monatsabschluss
  modus: "monat", monat: MONAT === 1 ? 12 : MONAT - 1, quartal: Math.ceil(MONAT / 3),
  abschlussJahr: MONAT === 1 ? JAHR - 1 : JAHR,
  status: null, pruefung: null, stripe: null, downloads: null, laedt: false,
};
const QUARTALE = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [9, 10, 11]];

/* ── Daten aus der Excel ─────────────────────────────────────────────── */
export async function ladeFinanzen(jahr = F.jahr, neu = false) {
  if (!neu && S.fin[jahr] && Date.now() - S.fin[jahr].zeit < 60000) return S.fin[jahr];
  try { const d = await api("/api/dashboard?jahr=" + jahr); S.fin[jahr] = { ok: true, d, zeit: Date.now() }; }
  catch (e) { S.fin[jahr] = { ok: false, fehler: e.message, zeit: Date.now() }; }
  return S.fin[jahr];
}

/* Umsatzziel (geteilt): einstellungen/ziel-JAHR = {betrag, keinUmsatz:[Kategorien], manuell} */
export const zielDoc = (jahr = JAHR) => X.einst["ziel-" + jahr] || null;
export function umsatz(jahr = JAHR) {
  const f = S.fin[jahr], z = zielDoc(jahr) || {};
  if (!f || !f.ok) return z.manuell != null ? num(z.manuell) : null;
  const ohne = new Set(z.keinUmsatz || []);
  return f.d.einnahmen_kategorien.filter((k) => !ohne.has(k.name)).reduce((s, k) => s + k.summe, 0);
}
export function zielKarte(jahr = JAHR) {
  const z = zielDoc(jahr), ziel = num(z?.betrag), ist = umsatz(jahr);
  const knopf = `<button class="knopf klein" data-a="zielBearbeiten" data-v="${jahr}">${ziel ? "Anpassen" : "Ziel festlegen"}</button>`;
  if (!ziel) return `<section class="karte"><div class="karte-kopf"><h2>Umsatzziel ${jahr}</h2>${knopf}</div><p class="leise">Noch kein Ziel festgelegt. Mit Ziel siehst du hier jederzeit, wie weit ihr seid.</p></section>`;
  const p = ist ? (ist / ziel) * 100 : 0, fehlt = Math.max(0, ziel - (ist || 0));
  const tage = Math.max(0, Math.round((new Date(jahr, 11, 31) - new Date()) / 864e5)), monate = Math.max(1, tage / 30.44);
  return `<section class="karte"><div class="karte-kopf"><h2>Umsatzziel ${jahr}</h2>${knopf}</div>
    <div class="ziel">${ring(p, 112)}<div class="ziel-zahlen">
      <div><span class="k">Ziel</span><span class="v">${eurGanz(ziel)}</span></div>
      <div><span class="k">Aktuell</span><span class="v">${ist == null ? "–" : eurGanz(ist)}</span></div>
      <div><span class="k">Es fehlen</span><span class="v ${fehlt ? "schlecht" : "gut"}">${fehlt ? eurGanz(fehlt) : "Ziel erreicht"}</span></div></div></div>
    <div class="ziel-fuss"><span>${komma(p)} % erreicht</span><span>${tage > 0 && fehlt ? `ca. ${eurGanz(fehlt / monate)} pro Monat nötig` : jahr < JAHR ? "Jahr abgeschlossen" : ""}</span></div></section>`;
}

/* ── Kopf: Jahr, Reiter ──────────────────────────────────────────────── */
export function reiter() {
  return [["uebersicht", "Übersicht"], ["einnahmen", "Einnahmen"], ["ausgaben", "Ausgaben"], ["zusammenfassung", "Zusammenfassung"], ["abschluss", "Monatsabschluss"]];
}
const jahre = () => { const l = []; for (let j = Math.min(2026, JAHR); j <= JAHR + 1; j++) l.push(j); return l; };

export function ansicht(unter, neuZeichnen) {
  unter = unter || "uebersicht";
  if (unter === "abschluss") return abschlussAnsicht(neuZeichnen);
  const f = S.fin[F.jahr];
  const kopf = `<select id="fin-jahr" aria-label="Jahr" style="width:110px">${jahre().map((j) => `<option${j === F.jahr ? " selected" : ""}>${j}</option>`).join("")}</select>
    <button class="knopf" data-a="finNeuLaden">${ikon("wdh")}<span class="text">Neu laden</span></button>`;
  if (!f) { ladeFinanzen(F.jahr).then(neuZeichnen); return { titel: "Finanzen", aktionen: kopf, html: '<div class="laden">Lade Finanzübersicht …</div>' }; }
  if (!f.ok) return { titel: "Finanzen", aktionen: kopf, html: excelFehlt(f.fehler) };
  const d = f.d;
  const html = { einnahmen: () => matrixSeite(d, "ein"), ausgaben: () => matrixSeite(d, "aus"), zusammenfassung: () => zusammenfassung(d) }[unter] || (() => uebersicht(d));
  return { titel: "Finanzen", aktionen: kopf, html: html() + `<p class="leise klein" style="margin-top:18px">Quelle: ${esc(d.quelle)} · nur gelesen. Beträge brutto inkl. MwSt. Änderungen bitte direkt in der Excel eintragen.</p>` };
}
function excelFehlt(text) {
  return `<div class="karte leer"><h2>Keine Finanzübersicht gefunden</h2><p>${esc(text)}</p>
    <p class="leise klein" style="margin-top:8px">Unter Einstellungen › Zugänge den Pfad zum Ordner „02_Finanzen“ eintragen. Dort muss die Finanzübersicht_${F.jahr}.xlsx liegen.</p>
    <button class="knopf" data-a="geheZu" data-v="einstellungen/zugaenge">${ikon("einstellungen")}Finanzordner einstellen</button></div>`;
}

/* ── Übersicht ───────────────────────────────────────────────────────── */
const reihe = (monate, k) => monate.map((m) => m[k]);
const summeVon = (arr, a, b) => arr.slice(a - 1, b).reduce((s, v) => s + v, 0);
function zeitraumLabel(a, b) {
  if (a === 1 && b === 12) return "Gesamtjahr " + F.jahr;
  if (a === b) return MONATE[a - 1] + " " + F.jahr;
  if (a % 3 === 1 && b - a === 2) return `Quartal ${(a + 2) / 3} ${F.jahr}`;
  return `${MON[a - 1]} bis ${MON[b - 1]} ${F.jahr}`;
}
function uebersicht(d) {
  const { a, b } = F.zeitraum, ein = reihe(d.monate, "einnahmen"), aus = reihe(d.monate, "ausgaben");
  const E = summeVon(ein, a, b), A = summeVon(aus, a, b), R = E - A;
  const ohne = new Set(zielDoc(F.jahr)?.keinUmsatz || []);
  const U = d.einnahmen_kategorien.filter((k) => !ohne.has(k.name)).reduce((s, k) => s + summeVon(k.monate, a, b), 0);
  const ziel = num(zielDoc(F.jahr)?.betrag);
  const aktiv = d.monate.filter((m, i) => i + 1 >= a && i + 1 <= b && (m.einnahmen || m.ausgaben)).length || 1;
  let bester = a; for (let m = a; m <= b; m++) if (ein[m - 1] > ein[bester - 1]) bester = m;
  const chip = (x, y, l) => `<button class="chip" data-a="finZeitraum" data-v="${x}-${y}" aria-pressed="${a === x && b === y}">${l}</button>`;
  let h = `<div class="zeitraum">${chip(1, 12, "Gesamtjahr")}<span class="trenner"></span>${[1, 2, 3, 4].map((q) => chip(q * 3 - 2, q * 3, "Q" + q)).join("")}<span class="trenner"></span>${MON.map((m, i) => chip(i + 1, i + 1, m)).join("")}</div>`;
  const k = (t, v, s, kl = "") => `<div class="kpi"><span class="k">${t}</span><span class="v ${kl}">${v}</span><span class="s">${s}</span></div>`;
  h += `<div class="kpi-zeile">${k("Ergebnis", (R > 0 ? "+" : "") + eurGanz(R), R < 0 ? "Verlust · " + zeitraumLabel(a, b) : "Gewinn · " + zeitraumLabel(a, b), R < 0 ? "schlecht" : "gut")}
    ${k("Einnahmen", eurGanz(E), a === b ? "im Monat" : "Ø " + eurGanz(E / aktiv) + " pro Monat")}
    ${k("Ausgaben", eurGanz(A), a === b ? "im Monat" : "Ø " + eurGanz(A / aktiv) + " pro Monat")}
    ${k("Umsatz", eurGanz(U), ziel && a === 1 && b === 12 ? komma((U / ziel) * 100) + " % vom Umsatzziel" : "ohne Positionen „kein Umsatz“")}
    ${k("Deckungsgrad", A ? Math.round((E / A) * 100) + " %" : "–", "Einnahmen ÷ Ausgaben", A && E >= A ? "gut" : "")}
    ${k(a === b ? "Monat" : "Bester Monat", ein[bester - 1] > 0 ? MONATE[bester - 1] : "–", ein[bester - 1] > 0 ? eurGanz(ein[bester - 1]) + " Einnahmen" : "keine Einnahmen")}</div><div class="abstand"></div>`;
  const hervor = F.jahr === JAHR ? MONAT - 1 : -1;
  const kum = []; let s = 0; const letzt = d.monate.reduce((l, m, i) => (m.einnahmen || m.ausgaben ? i : l), -1);
  d.monate.forEach((m, i) => { s += m.ergebnis; kum.push(i <= letzt ? s : null); });
  h += `<div class="raster raster-2">
    <section class="karte"><div class="karte-kopf"><h2>Einnahmen und Ausgaben pro Monat</h2><div class="legende"><span><i style="background:var(--serie-1)"></i>Einnahmen</span><span><i style="background:var(--serie-2)"></i>Ausgaben</span></div></div>
      <div class="diagramm">${saeulen(MON, [
        { name: "Einnahmen", werte: ein, farbe: "var(--serie-1)", tipps: d.monate.map((m) => `${m.name}: Einnahmen ${eur2(m.einnahmen)}`) },
        { name: "Ausgaben", werte: aus, farbe: "var(--serie-2)", tipps: d.monate.map((m) => `${m.name}: Ausgaben ${eur2(m.ausgaben)}`) }], { hervor })}</div></section>
    <section class="karte"><div class="karte-kopf"><h2>Ergebnis kumuliert</h2><span class="unter">Jahresverlauf</span></div>
      <div class="diagramm">${linie(MON, kum, { farbe: (v) => (v < 0 ? "var(--rot)" : "var(--gruen)") })}</div></section>
    <section class="karte"><div class="karte-kopf"><h2>Einnahmen nach Quelle</h2><span class="unter">${esc(zeitraumLabel(a, b))}</span></div>
      ${balken(d.einnahmen_kategorien.map((x) => [x.name, summeVon(x.monate, a, b)]).filter((x) => x[1]).sort((p, q) => q[1] - p[1]))}</section>
    <section class="karte"><div class="karte-kopf"><h2>Ausgaben nach Kategorie</h2><span class="unter">${esc(zeitraumLabel(a, b))}</span></div>
      ${balken(d.ausgaben_kategorien.map((x) => [x.name, summeVon(x.monate, a, b)]).filter((x) => x[1]).sort((p, q) => q[1] - p[1]).slice(0, 10), { farbe: "zwei" })}</section>
  </div>`;
  return h;
}

/* ── Matrix Einnahmen / Ausgaben (wie in der Excel) ──────────────────── */
const betrag = (n) => (n ? eur2(n).replace(/\s?€/, "") : "–");
function kopfzeile(erste) {
  const akt = F.jahr === JAHR ? MONAT - 1 : -1;
  let th = `<th>${erste}</th>`;
  QUARTALE.forEach((q, qi) => { q.forEach((m) => { th += `<th class="${m === akt ? "aktuell" : ""}">${MON[m]}</th>`; }); th += `<th class="q">Q${qi + 1}</th>`; });
  return `<thead><tr>${th}<th class="gesamt">Gesamt</th></tr></thead>`;
}
function zellen(werte, kl = "") {
  let td = "";
  QUARTALE.forEach((q) => { q.forEach((m) => { td += `<td class="num ${werte[m] ? kl : "leer"}">${betrag(werte[m])}</td>`; }); td += `<td class="num q">${betrag(q.reduce((s, m) => s + werte[m], 0))}</td>`; });
  return td + `<td class="num gesamt">${betrag(werte.reduce((s, v) => s + v, 0))}</td>`;
}
function matrix(zeilen, typ) {
  const gesamt = Array(12).fill(0);
  zeilen.filter((z) => z.art === "kategorie").forEach((z) => z.monate.forEach((v, i) => { gesamt[i] += v; }));
  const body = zeilen.map((z) => z.art === "abschnitt" ? `<tr class="abschnitt"><td colspan="18">${esc(z.name)}</td></tr>`
    : `<tr class="${z.art === "summe" ? "summe" : ""}"><td>${esc(z.name)}</td>${zellen(z.monate)}</tr>`).join("");
  return `<table class="matrix">${kopfzeile(typ === "ein" ? "Einnahmequelle" : "Ausgabenkategorie")}<tbody>${body}</tbody><tfoot><tr class="endsumme"><td>${typ === "ein" ? "Gesamt Einnahmen" : "Gesamt Ausgaben"}</td>${zellen(gesamt)}</tr></tfoot></table>`;
}
function matrixSeite(d, typ) {
  const ein = typ === "ein", zeilen = ein ? d.einnahmen_tabelle : d.ausgaben_tabelle, kats = ein ? d.einnahmen_kategorien : d.ausgaben_kategorien;
  const ges = kats.reduce((s, k) => s + k.summe, 0), monate = d.jahr_summe.aktive_monate || 1, top = kats.slice().sort((a, b) => b.summe - a.summe)[0];
  const arr = reihe(d.monate, ein ? "einnahmen" : "ausgaben"); let spitze = 0; arr.forEach((v, i) => { if (v > arr[spitze]) spitze = i; });
  const k = (t, v, s) => `<div class="kpi"><span class="k">${t}</span><span class="v">${v}</span><span class="s">${s}</span></div>`;
  return `<div class="kpi-zeile">${k(ein ? "Einnahmen gesamt" : "Ausgaben gesamt", eur(ges), "Ø " + eur(ges / monate) + " pro Monat")}
    ${k(ein ? "Stärkste Quelle" : "Größter Posten", top ? esc(top.name) : "–", top ? eur(top.summe) + ` · ${ges ? Math.round((top.summe / ges) * 100) : 0} %` : "")}
    ${k(ein ? "Bester Monat" : "Teuerster Monat", arr[spitze] > 0 ? MONATE[spitze] : "–", arr[spitze] > 0 ? eur(arr[spitze]) : "")}
    ${k("Positionen", kats.length, "mit Beträgen im Jahr")}</div><div class="abstand"></div>
    <section class="karte flach"><div class="karte-kopf"><h2>${ein ? "Einnahmenübersicht" : "Ausgabenübersicht"} ${F.jahr}</h2><span class="unter">brutto inkl. MwSt. · wie in der Finanzübersicht</span></div>
      <div class="matrix-wrap" style="margin-top:12px">${zeilen && zeilen.length ? matrix(zeilen, typ) : '<div class="leer klein">Keine Daten.</div>'}</div></section>`;
}

/* ── Zusammenfassung / GuV ───────────────────────────────────────────── */
function zusammenfassung(d) {
  const ein = reihe(d.monate, "einnahmen"), aus = reihe(d.monate, "ausgaben"), erg = reihe(d.monate, "ergebnis"), js = d.jahr_summe;
  const qAkt = F.jahr === JAHR ? Math.ceil(MONAT / 3) : 0;
  let h = `<div class="raster raster-4">${d.quartale.map((q) => `<div class="q-karte${q.quartal === qAkt ? " aktuell" : ""}"><div class="k">Quartal ${q.quartal}${q.quartal === qAkt ? " · aktuell" : ""}</div>
    <div class="v ${q.ergebnis < 0 ? "schlecht" : q.ergebnis > 0 ? "gut" : ""}">${q.ergebnis > 0 ? "+" : ""}${eur(q.ergebnis)}</div>
    <div class="z"><span>Einnahmen</span><b>${eur(q.einnahmen)}</b></div><div class="z"><span>Ausgaben</span><b>${eur(q.ausgaben)}</b></div>
    <div class="z"><span>Kostenquote</span><b>${q.einnahmen ? Math.round((q.ausgaben / q.einnahmen) * 100) + " %" : "–"}</b></div></div>`).join("")}</div><div class="abstand"></div>`;
  const letzt = d.monate.reduce((l, m, i) => (m.einnahmen || m.ausgaben ? i : l), -1);
  h += `<div class="raster raster-2"><section class="karte"><div class="karte-kopf"><h2>Ergebnis pro Monat</h2></div><div class="diagramm">${saeulen(MON, [{ name: "Ergebnis", werte: erg, farbe: (v) => (v < 0 ? "var(--rot)" : "var(--gruen)") }])}</div></section>
    <section class="karte"><div class="karte-kopf"><h2>Jahresergebnis</h2><span class="unter">${eur(js.einnahmen)} Einnahmen · ${eur(js.ausgaben)} Ausgaben</span></div>
      <div class="kpi-zeile" style="margin-bottom:10px"><div><span class="leise klein">Ergebnis ${F.jahr}</span><div class="v ${js.ergebnis < 0 ? "schlecht" : "gut"}" style="font:700 30px var(--f-titel)">${js.ergebnis > 0 ? "+" : ""}${eur(js.ergebnis)}</div></div>
      <div><span class="leise klein">Ø pro aktivem Monat</span><div style="font:700 22px var(--f-titel)">${eur(js.schnitt_ergebnis)}</div></div></div>
      <div class="diagramm">${linie(MON, erg.map((_, i) => (i <= letzt ? erg.slice(0, i + 1).reduce((s, v) => s + v, 0) : null)), { hoehe: 180, farbe: (v) => (v < 0 ? "var(--rot)" : "var(--gruen)") })}</div></section></div><div class="abstand"></div>`;
  const kum = (arr) => arr.map((_, i) => arr.slice(0, i + 1).reduce((s, v) => s + v, 0));
  const zeile = (n, w, kl = "") => `<tr class="${kl}"><td>${n}</td>${zellen(w, kl === "endsumme" ? "" : "")}</tr>`;
  h += `<section class="karte flach"><div class="karte-kopf"><h2>Gewinn- und Verlustrechnung ${F.jahr}</h2><span class="unter">monatlich und quartalsweise</span></div>
    <div class="matrix-wrap" style="margin-top:12px"><table class="matrix">${kopfzeile("Position")}<tbody>${zeile("Einnahmen", ein)}${zeile("Ausgaben", aus)}${zeile("Ergebnis (GuV)", erg, "endsumme")}
    <tr class="abschnitt"><td colspan="18">Kumuliert (laufend)</td></tr>
    <tr><td>Einnahmen kumuliert</td>${kum(ein).map((v, i) => `<td class="num${i > letzt ? " leer" : ""}">${i > letzt ? "" : betrag(v)}</td>${i % 3 === 2 ? '<td class="q"></td>' : ""}`).join("")}<td class="gesamt num">${betrag(js.einnahmen)}</td></tr>
    <tr><td>Ausgaben kumuliert</td>${kum(aus).map((v, i) => `<td class="num${i > letzt ? " leer" : ""}">${i > letzt ? "" : betrag(v)}</td>${i % 3 === 2 ? '<td class="q"></td>' : ""}`).join("")}<td class="gesamt num">${betrag(js.ausgaben)}</td></tr>
    <tr class="summe"><td>Ergebnis kumuliert</td>${kum(erg).map((v, i) => `<td class="num ${v < 0 ? "neg" : "pos"}">${i > letzt ? "" : betrag(v)}</td>${i % 3 === 2 ? '<td class="q"></td>' : ""}`).join("")}<td class="gesamt num">${betrag(js.ergebnis)}</td></tr>
    </tbody></table></div></section>`;
  return h;
}

/* ── Monatsabschluss (Steuerberater) ─────────────────────────────────── */
const zeitraumText = () => (F.modus === "monat" ? `${MONATE[F.monat - 1]} ${F.abschlussJahr}` : `Quartal ${F.quartal} ${F.abschlussJahr}`);
async function ladeStatus(neuZeichnen) {
  F.laedt = true; F.status = null; F.pruefung = null; F.stripe = null; F.downloads = null;
  const p = new URLSearchParams({ jahr: F.abschlussJahr });
  if (F.modus === "monat") p.set("monat", F.monat); else p.set("quartal", F.quartal);
  try { F.status = await api("/api/status?" + p); } catch (e) { F.status = { fehler: e.message }; }
  await ladeFinanzen(F.abschlussJahr);
  F.laedt = false;
  neuZeichnen();
}
function abschlussAnsicht(neuZeichnen) {
  if (!F.status && !F.laedt) ladeStatus(neuZeichnen);
  const jahrOpt = jahre().map((j) => `<option${j === F.abschlussJahr ? " selected" : ""}>${j}</option>`).join("");
  const kopf = `<select id="ab-jahr" aria-label="Jahr" style="width:110px">${jahrOpt}</select>`;
  const chip = (modus, wert, label) => `<button class="chip" data-a="abschlussZeitraum" data-v="${modus}-${wert}" aria-pressed="${F.modus === modus && (modus === "monat" ? F.monat : F.quartal) === wert}">${label}</button>`;
  let h = `<div class="zeitraum">${[1, 2, 3, 4].map((q) => chip("quartal", q, "Q" + q)).join("")}<span class="trenner"></span>${MON.map((m, i) => chip("monat", i + 1, m)).join("")}</div>`;
  // Kennzahlen aus der Excel für den Zeitraum
  const f = S.fin[F.abschlussJahr]; let E = null, A = null;
  if (f?.ok) { if (F.modus === "monat") { const m = f.d.monate[F.monat - 1]; E = m.einnahmen; A = m.ausgaben; } else { const q = f.d.quartale[F.quartal - 1]; E = q.einnahmen; A = q.ausgaben; } }
  const pr = F.pruefung;
  const k = (t, v, s, kl = "") => `<div class="kpi"><span class="k">${t}</span><span class="v ${kl}">${v}</span><span class="s">${s}</span></div>`;
  h += `<div class="kpi-zeile">${k("Einnahmen", E == null ? "–" : eurGanz(E), "laut Finanzübersicht")}${k("Ausgaben", A == null ? "–" : eurGanz(A), "laut Finanzübersicht")}
    ${k("Ergebnis", E == null ? "–" : eurGanz(E - A), zeitraumText(), E != null && E - A < 0 ? "schlecht" : "gut")}
    ${k("USt-Zahllast", pr ? eur(num(pr.vereinnahmte_umsatzsteuer) - num(pr.vorsteuer)) : "–", pr ? "aus der KI-Prüfung" : "nach der KI-Prüfung")}</div><div class="abstand"></div>`;
  const kz = S.konfig || {};
  const fehltZugang = (ok, t) => (ok ? "" : ` title="${esc(t)} ist noch nicht eingerichtet (Einstellungen › Zugänge)"`);
  h += `<section class="karte"><div class="karte-kopf"><h2>Abschluss ${esc(zeitraumText())}</h2>${F.downloads ? '<span class="pille voll">Paket erstellt</span>' : pr ? `<span class="pille ${pr.vollstaendig ? "gruen" : "amber"}">${pr.vollstaendig ? "Vollständig" : "Bitte prüfen"}</span>` : '<span class="pille">Bereit</span>'}</div>
    <div class="schritte">
      <div class="schritt-gruppe"><h3><span class="nr">1</span>Belege abrufen</h3><div class="knoepfe">
        <button class="knopf" data-a="mailImport"${fehltZugang(kz.hat_mail, "Das E-Mail-Postfach")}>${ikon("fach")}E-Mail-Postfach</button>
        <button class="knopf" data-a="stripeAbruf"${fehltZugang(kz.hat_stripe_key, "Stripe")}>${ikon("karte")}Stripe</button>
        <button class="knopf" data-a="qontoAuszug"${fehltZugang(kz.hat_qonto, "Qonto")}>${ikon("bank")}Qonto-Kontoauszug</button>
        <button class="knopf" data-a="qontoGebuehr"${fehltZugang(kz.hat_qonto, "Qonto")}>${ikon("doc")}Qonto-Gebührenrechnung</button></div></div>
      <div class="schritt-gruppe"><h3><span class="nr">2</span>Prüfen und abschließen</h3><div class="knoepfe">
        <button class="knopf" data-a="kiPruefung"${fehltZugang(kz.hat_anthropic_key, "Der Claude-Schlüssel")}>${ikon("funken")}Vollständigkeit prüfen (KI)</button>
        <button class="knopf haupt" data-a="berichtErstellen">${ikon("archiv")}Bericht &amp; Belegpaket erstellen</button></div></div>
    </div>
    ${F.downloads ? `<div class="downloads"><a class="knopf" href="${esc(F.downloads.bericht_url)}" download>${ikon("doc")}${esc(F.downloads.bericht)}</a><a class="knopf" href="${esc(F.downloads.paket_url)}" download>${ikon("ordner")}${esc(F.downloads.paket)}</a><a class="knopf" href="${esc(F.downloads.mail_url)}" download>${ikon("mail")}E-Mail an Steuerberater</a><span class="leise klein">Mail-Entwurf mit PDF und ZIP im Anhang. Öffnen, prüfen, senden. Empfänger: ${esc(F.downloads.empfaenger)}</span></div>` : ""}
  </section><div class="abstand"></div>`;
  h += `<div class="raster raster-2"><section class="karte"><div class="karte-kopf"><h2>Checkliste Steuerberater</h2></div>${checkliste()}</section>
    <section class="karte"><div class="karte-kopf"><h2>Prüfergebnis</h2></div>${pruefErgebnis()}</section></div>`;
  if (F.stripe) h += `<div class="abstand"></div><section class="karte"><div class="karte-kopf"><h2>Stripe-Report</h2><span class="pille gruen">${MONATE[F.stripe.monat - 1]} ${F.stripe.jahr}</span></div><div class="kpi-zeile">
    ${[["Bruttoumsatz", F.stripe.bruttoumsatz], ["Gebühren", -num(F.stripe.gebuehren)], ["Erstattungen", -num(F.stripe.erstattungen)], ["Netto-Einnahmen", F.stripe.netto], ["Auszahlungen (Bank)", F.stripe.auszahlungen]].map(([t, v]) => k(t, eur(v), "")).join("")}${k("Zahlungen", F.stripe.anzahl_zahlungen, "")}</div></section>`;
  if (pr?.belege?.length) h += `<div class="abstand"></div><section class="karte flach"><div class="karte-kopf"><h2>Belegübersicht</h2><span class="unter">${pr.belege.length} Belege</span></div><div class="tabelle-wrap ohne-rand" style="margin-top:10px"><table><thead><tr><th>Datum</th><th>Typ</th><th>Aussteller</th><th class="r">Brutto</th><th class="r">USt</th></tr></thead><tbody>
    ${pr.belege.map((b) => `<tr><td>${esc(b.datum || "–")}</td><td>${esc(b.typ || "–")}</td><td>${esc(b.aussteller || "–")}</td><td class="r num">${eur2(b.betrag_brutto)}</td><td class="r num">${b.umsatzsteuer != null ? eur2(b.umsatzsteuer) : "–"}</td></tr>`).join("")}</tbody></table></div></section>`;
  h += `<div class="abstand"></div><section class="karte"><div class="karte-kopf"><h2>Beleg ablegen</h2><span class="unter">Wird im passenden Monatsordner gespeichert</span></div>
    <form id="beleg-form" class="upload"><div class="segment" role="group" aria-label="Art"><button type="button" data-a="belegTyp" data-v="ausgaben" aria-pressed="${(F.belegTyp || "ausgaben") === "ausgaben"}">Ausgabe</button><button type="button" data-a="belegTyp" data-v="einnahmen" aria-pressed="${F.belegTyp === "einnahmen"}">Einnahme</button></div>
      <select id="beleg-monat" aria-label="Monat">${MONATE.map((m, i) => `<option value="${i + 1}"${i + 1 === (F.modus === "monat" ? F.monat : MONAT) ? " selected" : ""}>${m} ${F.abschlussJahr}</option>`).join("")}</select>
      <label class="datei-knopf${F.belegDatei ? " gewaehlt" : ""}" id="beleg-label">${ikon("upload")}<span id="beleg-text">${F.belegDatei ? esc(F.belegDatei.name) : "PDF oder Foto wählen"}</span><input type="file" id="beleg-datei" accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.txt" hidden></label>
      <button class="knopf" type="submit">${ikon("plus")}Ablegen</button></form></section>`;
  return { titel: "Finanzen", aktionen: kopf, html: h };
}
function checkliste() {
  const s = F.status;
  if (!s || F.laedt) return '<div class="laden">Prüfe Ordner …</div>';
  if (s.fehler) return `<div class="banner fehler">${ikon("warn")}<span>${esc(s.fehler)}</span></div>`;
  const haken = (ok) => `<span class="haken ${ok ? "ja" : "nein"}">${ok ? ikon("haken") : ikon("x")}</span>`;
  if (s.modus === "monat") return `<ul class="checkliste">${s.checkliste.map((c) => `<li>${haken(c.erledigt)}<div><span class="t">${esc(c.aufgabe)}</span><span class="h">${esc(c.hinweis)}</span></div></li>`).join("")}</ul>`;
  return `<ul class="checkliste">${s.monate.map((m) => `<li>${haken(!!m.kontoauszug)}<div><span class="t">${esc(m.monatsname)} ${m.jahr}</span><span class="h">Kontoauszug ${m.kontoauszug ? "vorhanden" : "fehlt"} · ${m.anzahl_eingang} Eingang · ${m.anzahl_ausgang} Ausgang</span></div></li>`).join("")}</ul>`;
}
function pruefErgebnis() {
  const a = F.pruefung;
  if (!a) return `<div class="leer klein">Noch keine Prüfung. „Vollständigkeit prüfen“ gleicht Kontoauszug und Rechnungen automatisch ab${F.modus === "quartal" ? " (je Monat)" : ""}.</div>`;
  const f = a.fehlende_belege || [], hw = a.hinweise || [];
  return `<div style="margin-bottom:10px"><span class="pille ${a.vollstaendig ? "gruen" : "amber"}">${a.vollstaendig ? "Vollständig" : "Bitte prüfen"}</span></div>
    ${f.length ? `<h3 class="schlecht">Fehlende Belege</h3><ul class="ergebnis-liste">${f.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
    ${hw.length ? `<h3>Hinweise</h3><ul class="ergebnis-liste">${hw.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
    ${!f.length && !hw.length ? '<p class="leise">Keine fehlenden Belege und keine Hinweise.</p>' : ""}`;
}

/* ── Umsatzziel bearbeiten ───────────────────────────────────────────── */
async function zielBearbeiten(jahr) {
  const z = zielDoc(jahr) || {}, f = await ladeFinanzen(jahr);
  const kats = f.ok ? f.d.einnahmen_kategorien.map((k) => k.name) : [];
  const ohne = new Set(z.keinUmsatz || []);
  oeffneBlatt(`<form id="ziel-form" data-jahr="${jahr}">${blattKopf("Umsatzziel " + jahr)}
    <div class="blatt-inhalt"><div class="fg"><label class="f ganz">Umsatzziel ${jahr} (€)<input id="z-betrag" type="number" min="0" step="100" value="${esc(z.betrag || "")}" placeholder="z. B. 50000" autofocus></label>
    ${f.ok ? "" : `<label class="f ganz">Aktueller Umsatz (€, von Hand)<input id="z-manuell" type="number" min="0" step="0.01" value="${esc(z.manuell ?? "")}"><span class="hinweis">Die Finanzübersicht ${jahr} wurde nicht gefunden, daher von Hand.</span></label>`}</div>
    ${kats.length ? `<div class="gruppe" style="margin-top:24px"><div class="gruppe-titel">Zählt zum Umsatz</div><p class="leise klein" style="margin-bottom:10px">Der aktuelle Umsatz kommt aus der Finanzübersicht. Haken weg bei Einnahmen, die kein Umsatz sind (z. B. Umsatzsteuer-Erstattung, Einlagen, durchlaufende Posten).</p>
      <div class="liste">${kats.map((n) => `<label class="check" style="padding:6px 0"><input type="checkbox" data-kat="${esc(n)}"${ohne.has(n) ? "" : " checked"}> ${esc(n)}</label>`).join("")}</div></div>` : ""}</div>
    <div class="blatt-fuss"><span class="fehler-text wachsen" id="z-fehler"></span><button type="button" class="knopf" data-a="schliessen">Abbrechen</button><button type="submit" class="knopf haupt">Speichern</button></div></form>`, { art: "ziel" });
}

/* ── Aktionen ────────────────────────────────────────────────────────── */
async function lauf(titel, text, fn, neuZeichnen) {
  arbeit(titel, text);
  try { await fn(); } catch (e) { fehler(e); } finally { arbeit(); neuZeichnen(); }
}
const zeitraumJson = () => (F.modus === "monat" ? { jahr: F.abschlussJahr, monat: F.monat } : { jahr: F.abschlussJahr, quartal: F.quartal });
const nurMonat = () => { if (F.modus !== "monat") { melde("Bitte dafür einen einzelnen Monat wählen.", "fehler"); return false; } return true; };

Object.assign(aktionen, {
  finZeitraum: (el, neuZeichnen) => { const [a, b] = el.dataset.v.split("-").map(Number); F.zeitraum = { a, b }; neuZeichnen(); },
  finNeuLaden: async (el, neuZeichnen) => { await ladeFinanzen(F.jahr, true); neuZeichnen(); melde("Finanzübersicht neu geladen"); },
  zielBearbeiten: (el) => zielBearbeiten(Number(el.dataset.v) || JAHR),
  abschlussZeitraum: (el, neuZeichnen) => { const [m, w] = el.dataset.v.split("-"); F.modus = m; if (m === "monat") F.monat = Number(w); else F.quartal = Number(w); ladeStatus(neuZeichnen); },
  belegTyp: (el) => { F.belegTyp = el.dataset.v; el.parentElement.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b === el))); },
  mailImport: (el, neuZeichnen) => lauf("Rechnungen aus dem Postfach holen …", `Anhänge für ${zeitraumText()} werden geladen.`, async () => {
    const d = await api("/api/mail-import", { json: zeitraumJson() });
    melde(d.abgelegt_gesamt ? `${d.abgelegt_gesamt} Rechnung(en) aus der Mail abgelegt.` : "Keine neuen Rechnungen in den Mail-Ordnern.");
    (d.ordner || []).forEach((o) => o.fehler?.length && melde(o.fehler[0], "fehler"));
    await ladeStatus(() => {});
  }, neuZeichnen),
  stripeAbruf: (el, neuZeichnen) => nurMonat() && lauf("Stripe-Abruf läuft …", "Rechnungen, Belege und Auszahlungen des Monats werden geholt.", async () => {
    const d = await api("/api/stripe/sync", { json: zeitraumJson() });
    melde(`${d.abgelegt.length} neu abgelegt, ${d.uebersprungen.length} bereits vorhanden.`);
    if (d.fehler.length) melde(d.fehler[0], "fehler");
    await ladeStatus(() => {}); F.stripe = d.report;
  }, neuZeichnen),
  qontoAuszug: (el, neuZeichnen) => nurMonat() && lauf("Kontoauszug wird abgerufen …", "Der Qonto-Kontoauszug wird geladen und abgelegt.", async () => {
    const d = await api("/api/qonto/kontoauszug", { json: zeitraumJson() });
    melde(d.uebersprungen ? "Kontoauszug war schon vorhanden." : `Kontoauszug abgelegt${d.anzahl_buchungen != null ? ` (${d.anzahl_buchungen} Buchungen)` : ""}.`);
    await ladeStatus(() => {});
  }, neuZeichnen),
  qontoGebuehr: (el, neuZeichnen) => nurMonat() && lauf("Gebührenrechnung wird geholt …", "", async () => {
    const r = await api("/api/qonto/rechnungen", { json: zeitraumJson() });
    if (r.abgelegt.length) melde(`Gebührenrechnung abgelegt: ${r.abgelegt.join(", ")}`);
    else if (r.schon_vorhanden.length) melde(`Lag schon im Ordner: ${r.schon_vorhanden.join(", ")}`);
    else if (r.ohne_beleg) { const d = r.faellig_ab || "", tag = d ? `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}` : "dem 1. des Folgemonats";
      melde(r.faellig_erreicht ? `${r.ohne_beleg} Gebührenbuchungen (${r.summe} €) ohne Rechnung, obwohl sie seit ${tag} vorliegen müsste. Bitte in Qonto nachsehen.` : `${r.summe} € Gebühren gebucht. Qonto stellt die Rechnung erst am ${tag} aus.`, r.faellig_erreicht ? "fehler" : "ok"); }
    else melde("Keine Gebührenbuchungen in diesem Monat gefunden.");
    await ladeStatus(() => {});
  }, neuZeichnen),
  kiPruefung: (el, neuZeichnen) => nurMonat() && lauf("KI-Prüfung läuft …", "Claude liest Kontoauszug und alle Rechnungen. Bei vielen Belegen dauert das 1–2 Minuten.", async () => {
    const d = await api("/api/analyse", { json: zeitraumJson() });
    F.pruefung = d.analyse;
    melde(`${d.anzahl_pdfs} PDF(s) ausgewertet${d.aus_cache ? " (schon geprüft, ohne neue Kosten)" : ""}.`);
  }, neuZeichnen),
  berichtErstellen: (el, neuZeichnen) => lauf("Bericht wird erstellt …", "PDF-Bericht und ZIP-Belegpaket werden zusammengestellt.", async () => {
    F.downloads = await api("/api/bericht", { json: zeitraumJson() });
    melde("Bericht, Belegpaket und Mail-Entwurf erstellt.");
  }, neuZeichnen),
});
Object.assign(absenden, {
  "ziel-form": async (form) => {
    const jahr = Number(form.dataset.jahr), b = num(gv("z-betrag"));
    if (b <= 0) { $("#z-fehler").textContent = "Bitte ein Umsatzziel größer 0 eintragen."; return; }
    const keinUmsatz = [...form.querySelectorAll("input[data-kat]")].filter((e) => !e.checked).map((e) => e.dataset.kat);
    const w = { betrag: b, keinUmsatz, jahr };
    if ($("#z-manuell")) w.manuell = gv("z-manuell") === "" ? null : num(gv("z-manuell"));
    try { await schreibe([{ k: "einstellungen", a: zielDoc(jahr) ? "upd" : "set", id: "ziel-" + jahr, w }]); schliesse(); melde("Umsatzziel gespeichert"); } catch (e) { fehler(e); }
  },
  "beleg-form": async () => {
    const datei = F.belegDatei;
    if (!datei) return melde("Bitte zuerst einen Beleg auswählen.", "fehler");
    const fd = new FormData();
    fd.append("datei", datei); fd.append("jahr", F.abschlussJahr); fd.append("typ", F.belegTyp || "ausgaben"); fd.append("monat", gv("beleg-monat"));
    try { const r = await api("/api/beleg-upload", { method: "POST", body: fd }); melde(`Beleg „${r.datei}“ abgelegt`); F.belegDatei = null; $("#beleg-datei").value = ""; $("#beleg-text").textContent = "PDF oder Foto wählen"; $("#beleg-label").classList.remove("gewaehlt"); }
    catch (e) { fehler(e); }
  },
});
Object.assign(aenderungen, {
  "fin-jahr": (el, neuZeichnen) => { F.jahr = Number(el.value); merk.set("f_jahr", F.jahr); F.zeitraum = { a: 1, b: 12 }; ladeFinanzen(F.jahr).then(neuZeichnen); },
  "ab-jahr": (el, neuZeichnen) => { F.abschlussJahr = Number(el.value); ladeStatus(neuZeichnen); },
  "beleg-datei": (el) => { const f = el.files?.[0]; F.belegDatei = f || null; $("#beleg-text").textContent = f ? f.name : "PDF oder Foto wählen"; $("#beleg-label").classList.toggle("gewaehlt", !!f); },
});
