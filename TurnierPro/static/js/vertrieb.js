// Vertrieb: Vereine, Kontakte (Anrufe, Mails …), Pipeline und Wiedervorlagen.
import {
  S, X, $, esc, num, ikon, gv, HEUTE, plusTage, datum, eur, prozent, komma, isoWoche, merk,
  neu, aendere, schreibe, melde, fehler, frage, oeffneBlatt, erneuereBlatt, schliesse, blatt, blattKopf,
  person, avatar, teamSortiert, optionen, name, saeulen, aktionen, absenden, aenderungen, eingaben,
} from "./kern.js";
import {
  KANAELE, STATUS, STm, ERG, ERGm, GEWONNEN, VERLOREN, BUNDESLAENDER, VERBAENDE, ARTEN, LOESUNGEN, FUNKTIONEN,
  istOffen, wvZustand, faelligeVereine, aktivitaetenVon, letzterKontakt, terminText, statusPille, wvPille,
  ergebnisText, ergebnisOptionen, summe,
} from "./stammdaten.js";

const ZEITRAEUME = [["month", "Dieser Monat"], ["7", "Letzte 7 Tage"], ["30", "Letzte 30 Tage"], ["90", "Letzte 90 Tage"], ["year", "Dieses Jahr"], ["all", "Gesamt"]];
const V = {
  zeitraum: merk.get("v_zeitraum", "30"), wer: "all",
  f: merk.get("v_filter", { q: "", status: "", bl: "", prio: "", betreuer: "", offen: true, sort: "wv" }),
  af: { q: "", von: "", kanal: "" },
  form: null,
};
const merkeFilter = () => merk.set("v_filter", { ...V.f, q: "" });

export function reiter() {
  const faellig = faelligeVereine().length;
  return [["uebersicht", "Übersicht"], ["vereine", "Vereine"], ["wiedervorlagen", "Wiedervorlagen", faellig], ["aktivitaeten", "Aktivitäten"]];
}

export function ansicht(unter) {
  const kopf = `<button class="knopf" data-a="exportMenue" data-v="vertrieb">${ikon("export")}<span class="text">Export</span></button>
    <button class="knopf haupt" data-a="kontaktNeu">${ikon("plus")}<span class="text">Kontakt erfassen</span></button>`;
  const html = { vereine: vVereine, wiedervorlagen: vWiedervorlagen, aktivitaeten: vAktivitaeten }[unter] || vUebersicht;
  return { titel: "Vertrieb", aktionen: kopf, html: html() };
}

/* ── Kennzahlen ──────────────────────────────────────────────────────── */
function zeitraumStart() {
  const r = V.zeitraum;
  if (r === "all") return null;
  if (r === "month") return HEUTE.slice(0, 8) + "01";
  if (r === "year") return HEUTE.slice(0, 4) + "-01-01";
  return plusTage(HEUTE, -(Number(r) - 1));
}
function kennzahlen() {
  const von = zeitraumStart(), wer = V.wer;
  const akts = S.d.aktivitaeten.filter((a) => (!von || a.datum >= von) && (wer === "all" || a.von === wer));
  const erreicht = akts.filter((a) => ERGm[a.ergebnis]?.e).length, quali = akts.filter((a) => ERGm[a.ergebnis]?.q).length;
  const neuV = S.d.vereine.filter((v) => { const l = aktivitaetenVon(v.id); if (!l.length) return false; const erster = l[l.length - 1]; return (!von || erster.datum >= von) && (wer === "all" || erster.von === wer); }).length;
  const offen = S.d.vereine.filter(istOffen), gewonnen = S.d.vereine.filter((v) => v.status === GEWONNEN);
  const wv = { ueber: 0, heute: 0, woche: 0 };
  S.d.vereine.forEach((v) => { const z = wvZustand(v); if (z in wv) wv[z]++; });
  return { von, akts, erreicht, quali, neuV, offen, gewonnen, wv, offenWert: summe(offen, (v) => v.potenzial), gewonnenWert: summe(gewonnen, (v) => v.potenzial) };
}
function wochen() {
  const dow = (new Date(HEUTE + "T12:00:00Z").getUTCDay() + 6) % 7, mo = plusTage(HEUTE, -dow), zeilen = [];
  for (let i = 7; i >= 0; i--) {
    const s = plusTage(mo, -7 * i), e = plusTage(s, 6);
    const l = S.d.aktivitaeten.filter((a) => a.datum >= s && a.datum <= e && (V.wer === "all" || a.von === V.wer));
    zeilen.push({ kw: isoWoche(s), a: l.length, e: l.filter((a) => ERGm[a.ergebnis]?.e).length });
  }
  return zeilen;
}
const kpi = (k, v, s, kl = "", a = "") => `<${a ? "button" : "div"} class="kpi"${a}><span class="k">${k}</span><span class="v ${kl}">${v}</span><span class="s">${s}</span></${a ? "button" : "div"}>`;

function vUebersicht() {
  if (!S.d.vereine.length) return leerZustand();
  const K = kennzahlen(), w = wochen();
  const werOpt = `<option value="all"${V.wer === "all" ? " selected" : ""}>Ganzes Team</option>` + teamSortiert().map((t) => `<option value="${esc(t.id)}"${V.wer === t.id ? " selected" : ""}>${esc(t.name)}</option>`).join("");
  let h = `<div class="filterleiste"><select id="v-zeitraum" aria-label="Zeitraum">${optionen(ZEITRAEUME, V.zeitraum)}</select><select id="v-wer" aria-label="Mitarbeiter">${werOpt}</select></div>`;
  h += `<div class="abschnitt-titel">Aktivität im Zeitraum</div><div class="kpi-zeile">`
    + kpi("Aktivitäten", K.akts.length, "Anrufe, Mails, Gespräche")
    + kpi("Neue Vereine", K.neuV, "Erstkontakt im Zeitraum")
    + kpi("Erreichquote", prozent(K.erreicht, K.akts.length), `${K.erreicht} Gespräche geführt`)
    + kpi("Qualifiziert", K.quali, "Demo, Angebot, Abschluss")
    + kpi("Überfällig", K.wv.ueber, `heute ${K.wv.heute} · diese Woche ${K.wv.woche}`, K.wv.ueber ? "schlecht" : "", ' data-a="geheZu" data-v="vertrieb/wiedervorlagen"')
    + `</div>`;
  h += `<div class="abschnitt-titel">Pipeline (aktueller Stand)</div><div class="kpi-zeile">`
    + kpi("Vereine", S.d.vereine.length, "insgesamt erfasst", "", ' data-a="geheZu" data-v="vertrieb/vereine"')
    + kpi("Offen", K.offen.length, "noch nicht entschieden")
    + kpi("Offenes Potenzial", eur(K.offenWert), "Summe der offenen Vereine")
    + kpi("Gewonnen", K.gewonnen.length, eur(K.gewonnenWert) + " Volumen", K.gewonnen.length ? "gut" : "")
    + kpi("Abschlussquote", prozent(K.gewonnen.length, S.d.vereine.length), "gewonnen / alle Vereine")
    + `</div><div class="abstand"></div>`;

  const faellig = faelligeVereine();
  const zaehl = STATUS.map((s) => { const l = S.d.vereine.filter((v) => v.status === s.n); return { s, n: l.length, w: summe(l, (v) => v.potenzial) }; });
  const max = Math.max(1, ...zaehl.map((x) => x.n));
  h += `<div class="raster raster-2">
    <section class="karte"><div class="karte-kopf"><h2>Heute dran</h2><button class="link" data-a="geheZu" data-v="vertrieb/wiedervorlagen">Alle Wiedervorlagen</button></div>
      ${faellig.length ? `<div class="liste">${faellig.slice(0, 6).map((v) => wvEintrag(v, true)).join("")}</div>` : '<div class="leer klein">Nichts überfällig und nichts für heute geplant.</div>'}</section>
    <section class="karte"><div class="karte-kopf"><h2>Pipeline nach Status</h2><span class="unter">Klick zeigt die Vereine</span></div>
      ${zaehl.map((x) => `<button class="balken-zeile" data-a="nachStatus" data-v="${esc(x.s.n)}"><span class="n">${esc(x.s.n)}</span><span class="balken"><i class="${x.s.n === VERLOREN ? "zwei" : ""}" style="width:${(x.n / max) * 100}%"></i></span><span class="w">${x.n}${x.w ? ` · <span class="leise">${eur(x.w)}</span>` : ""}</span></button>`).join("")}</section>
    <section class="karte"><div class="karte-kopf"><h2>Wochenverlauf</h2><span class="unter">letzte 8 Wochen</span></div>
      <div class="diagramm">${saeulen(w.map((r) => "KW " + r.kw), [
        { name: "Aktivitäten", werte: w.map((r) => r.a), farbe: "var(--serie-1)" },
        { name: "Gespräche geführt", werte: w.map((r) => r.e), farbe: "var(--serie-2)" }], { hoehe: 220, formatiere: (v) => String(v) })}</div>
      <div class="legende"><span><i style="background:var(--serie-1)"></i>Aktivitäten</span><span><i style="background:var(--serie-2)"></i>Gespräche geführt</span></div></section>
    <section class="karte"><div class="karte-kopf"><h2>Kontaktarten</h2><span class="unter">im Zeitraum</span></div>
      <table><thead><tr><th>Kontaktart</th><th class="r">Aktivitäten</th><th class="r">Erreicht</th><th class="r">Quote</th></tr></thead><tbody>
      ${KANAELE.map((k) => { const l = K.akts.filter((a) => a.kanal === k), r = l.filter((a) => ERGm[a.ergebnis]?.e).length; return `<tr><td>${esc(k)}</td><td class="r num">${l.length}</td><td class="r num">${r}</td><td class="r num">${prozent(r, l.length)}</td></tr>`; }).join("")}
      </tbody></table></section>
    <section class="karte"><div class="karte-kopf"><h2>Team</h2><span class="unter">im Zeitraum</span></div>
      <table><thead><tr><th>Mitarbeiter</th><th class="r">Aktivitäten</th><th class="r">Erreicht</th><th class="r">Qualifiziert</th><th class="r">Gewonnen</th></tr></thead><tbody>
      ${teamSortiert().map((t) => { const l = S.d.aktivitaeten.filter((a) => (!K.von || a.datum >= K.von) && a.von === t.id); return `<tr><td>${person(t.id)}</td><td class="r num">${l.length}</td><td class="r num">${l.filter((a) => ERGm[a.ergebnis]?.e).length}</td><td class="r num">${l.filter((a) => ERGm[a.ergebnis]?.q).length}</td><td class="r num">${S.d.vereine.filter((v) => v.betreuer === t.id && v.status === GEWONNEN).length}</td></tr>`; }).join("") || '<tr><td colspan="5" class="leise">Noch kein Team angelegt.</td></tr>'}
      </tbody></table></section>
    <section class="karte"><div class="karte-kopf"><h2>Vereine nach Bundesland</h2></div>${bundeslaender()}</section>
  </div>`;
  return h;
}
function bundeslaender() {
  const bl = {};
  S.d.vereine.forEach((v) => { const k = v.bundesland || "Ohne Angabe"; bl[k] = bl[k] || { n: 0, o: 0, g: 0, w: 0 }; bl[k].n++; if (istOffen(v)) { bl[k].o++; bl[k].w += num(v.potenzial); } if (v.status === GEWONNEN) bl[k].g++; });
  const keys = Object.keys(bl).sort((a, b) => bl[b].n - bl[a].n || a.localeCompare(b));
  return `<table><thead><tr><th>Bundesland</th><th class="r">Vereine</th><th class="r">Offen</th><th class="r">Gewonnen</th><th class="r">Potenzial</th></tr></thead><tbody>${keys.slice(0, 10).map((k) => `<tr><td>${esc(k)}</td><td class="r num">${bl[k].n}</td><td class="r num">${bl[k].o}</td><td class="r num">${bl[k].g}</td><td class="r num">${eur(bl[k].w)}</td></tr>`).join("")}</tbody></table>`;
}
function leerZustand() {
  return `<div class="karte leer"><h2>Noch keine Vereine erfasst</h2><p>Lege den ersten Verein an oder übernimm die Daten aus dem bisherigen Artefakt (Einstellungen › Import).</p>
    <button class="knopf haupt" data-a="kontaktNeu">${ikon("plus")}Ersten Kontakt erfassen</button> <button class="knopf" data-a="geheZu" data-v="einstellungen/import">${ikon("upload")}Daten importieren</button></div>`;
}

/* ── Wiedervorlagen ──────────────────────────────────────────────────── */
export function wvEintrag(v, kompakt) {
  const l = aktivitaetenVon(v.id);
  const kontakt = [v.person && esc(v.person) + (v.funktion ? ` (${esc(v.funktion)})` : ""), v.telefon && `${ikon("telefon", "i-s")} ${esc(v.telefon)}`, v.email && esc(v.email)].filter(Boolean).join(" · ");
  return `<div class="wv"><div><span class="titel" data-a="verein" data-id="${esc(v.id)}">${esc(v.name)}</span> ${statusPille(v.status)}
      ${v.naechsterSchritt ? `<div class="unter" style="color:var(--text)">${esc(v.naechsterSchritt)}</div>` : ""}
      <div class="unter">${kontakt || "Keine Kontaktdaten"}${v.veranstaltung ? " · " + esc(v.veranstaltung) : ""}</div>
      ${!kompakt && l[0]?.notiz ? `<div class="unter">Zuletzt: ${esc(l[0].notiz.slice(0, 160))}</div>` : ""}</div>
    <div>${wvPille(v)}</div>
    <div class="aktionen"><button class="knopf klein" data-a="kontaktFuer" data-id="${esc(v.id)}">${ikon("plus")}Kontakt erfassen</button>
      <span class="leise klein">Verschieben:</span>
      <button class="knopf klein" data-a="verschiebe" data-id="${esc(v.id)}" data-n="1">+1 Tag</button>
      <button class="knopf klein" data-a="verschiebe" data-id="${esc(v.id)}" data-n="3">+3 Tage</button>
      <button class="knopf klein" data-a="verschiebe" data-id="${esc(v.id)}" data-n="7">+1 Woche</button></div></div>`;
}
function vWiedervorlagen() {
  const l = S.d.vereine.filter((v) => wvZustand(v)).sort((a, b) => a.wiedervorlage.localeCompare(b.wiedervorlage));
  const ohne = S.d.vereine.filter((v) => istOffen(v) && !v.wiedervorlage);
  if (!l.length && !ohne.length) return '<div class="karte leer"><h2>Keine Wiedervorlagen</h2>Sobald ein offener Verein ein Wiedervorlage-Datum hat, erscheint er hier.</div>';
  let h = "";
  [["ueber", "Überfällig", "rot"], ["heute", "Heute", ""], ["woche", "Diese Woche", ""], ["spaeter", "Später", ""]].forEach(([z, t, kl]) => {
    const e = l.filter((v) => wvZustand(v) === z);
    if (e.length) h += `<div class="gruppe-kopf ${kl}">${t} <span class="pille ohne-punkt">${e.length}</span></div><div class="karte" style="padding-top:4px;padding-bottom:4px;margin-bottom:16px">${e.map((v) => wvEintrag(v)).join("")}</div>`;
  });
  if (ohne.length) h += `<div class="gruppe-kopf">Offen ohne Termin <span class="pille ohne-punkt">${ohne.length}</span></div><div class="karte" style="padding-top:4px;padding-bottom:4px">${ohne.map((v) => wvEintrag(v)).join("")}</div>`;
  return h;
}

/* ── Vereine ─────────────────────────────────────────────────────────── */
function gefilterteVereine() {
  const f = V.f, q = f.q.toLowerCase();
  const l = S.d.vereine.filter((v) => {
    if (f.offen && !istOffen(v)) return false;
    if (f.status && v.status !== f.status) return false;
    if (f.bl && v.bundesland !== f.bl) return false;
    if (f.prio && v.prio !== f.prio) return false;
    if (f.betreuer && v.betreuer !== f.betreuer) return false;
    if (q && ![v.name, v.ort, v.person, v.veranstaltung, v.verband, v.email, v.telefon].some((x) => x && String(x).toLowerCase().includes(q))) return false;
    return true;
  });
  const sort = {
    wv: (a, b) => (a.wiedervorlage || "9999").localeCompare(b.wiedervorlage || "9999") || a.name.localeCompare(b.name, "de"),
    letzter: (a, b) => letzterKontakt(b).localeCompare(letzterKontakt(a)),
    wert: (a, b) => num(b.potenzial) - num(a.potenzial),
    name: (a, b) => String(a.name).localeCompare(String(b.name), "de"),
  }[f.sort] || ((a, b) => 0);
  return l.sort(sort);
}
function vereinTabelle() {
  const l = gefilterteVereine();
  if (!l.length) return '<div class="karte leer klein">Keine Vereine passen zu diesen Filtern.</div>';
  const vorname = (id) => (X.team[id] ? String(X.team[id].name).split(" ")[0] : "");
  return `<div class="tabelle-wrap"><table class="vereine"><thead><tr><th>Verein</th><th>Turnier / Camp</th><th>Ansprechperson</th><th>Status</th><th>Wiedervorlage</th><th class="r">Potenzial</th><th>Prio</th><th>Betreuer</th></tr></thead><tbody>
    ${l.map((v) => { const lk = letzterKontakt(v), n = aktivitaetenVon(v.id).length; return `<tr class="klick" data-a="verein" data-id="${esc(v.id)}">
      <td><div class="name">${esc(v.name)}</div><div class="unter">${esc(v.ort || v.bundesland || "")}${lk ? ` · ${n} ${n === 1 ? "Kontakt" : "Kontakte"}, zuletzt ${datum(lk).slice(0, 6)}` : ""}</div></td>
      <td>${v.veranstaltung ? esc(v.veranstaltung) + `<div class="unter">${esc([v.art, terminText(v)].filter(Boolean).join(" · "))}</div>` : '<span class="leise">–</span>'}</td>
      <td>${v.person ? esc(v.person) + `<div class="unter">${esc(v.funktion || "")}</div>` : '<span class="leise">–</span>'}</td>
      <td>${statusPille(v.status)}</td>
      <td>${wvPille(v)}${v.naechsterSchritt && istOffen(v) ? `<div class="unter">${esc(v.naechsterSchritt)}</div>` : ""}</td>
      <td class="r num">${v.potenzial ? eur(v.potenzial) : '<span class="leise">–</span>'}</td>
      <td>${v.prio ? `<span class="prio ${esc(v.prio)}">${esc(v.prio)}</span>` : ""}</td>
      <td>${v.betreuer ? `<span class="person" title="${esc(name(v.betreuer))}">${avatar(v.betreuer)}${esc(vorname(v.betreuer))}</span>` : '<span class="leise">–</span>'}</td></tr>`; }).join("")}
    </tbody></table></div><div class="tabelle-fuss">${l.length} von ${S.d.vereine.length} Vereinen</div>`;
}
function vVereine() {
  if (!S.d.vereine.length) return leerZustand();
  const f = V.f;
  return `<div class="filterleiste"><div class="suchfeld">${ikon("suche")}<input type="search" id="v-q" placeholder="Verein, Ort, Person, Turnier …" value="${esc(f.q)}"></div>
    <select id="v-status" aria-label="Status">${optionen(STATUS.map((s) => s.n), f.status, "Alle Status")}</select>
    <select id="v-bl" aria-label="Bundesland">${optionen(BUNDESLAENDER, f.bl, "Alle Bundesländer")}</select>
    <select id="v-prio" aria-label="Priorität">${optionen(["A", "B", "C"], f.prio, "Alle Prioritäten")}</select>
    <select id="v-betreuer" aria-label="Betreuer">${optionen(teamSortiert().map((t) => [t.id, t.name]), f.betreuer, "Alle Betreuer")}</select>
    <label class="check"><input type="checkbox" id="v-offen" ${f.offen ? "checked" : ""}> nur offene</label>
    <span class="wachsen"></span>
    <select id="v-sort" aria-label="Sortierung">${optionen([["wv", "Sortiert nach Wiedervorlage"], ["letzter", "… letztem Kontakt"], ["wert", "… Potenzial"], ["name", "… Name"]], f.sort)}</select></div>
    <div id="v-tabelle">${vereinTabelle()}</div>`;
}

/* ── Aktivitäten ─────────────────────────────────────────────────────── */
function gefilterteAkt() {
  const f = V.af, q = f.q.toLowerCase();
  return S.d.aktivitaeten.filter((a) => (!f.von || a.von === f.von) && (!f.kanal || a.kanal === f.kanal)
    && (!q || [X.verein[a.vereinId]?.name, a.notiz, ergebnisText(a.kanal, a.ergebnis)].some((x) => x && String(x).toLowerCase().includes(q))))
    .sort((a, b) => String(b.datum).localeCompare(String(a.datum)) || num(b.angelegt) - num(a.angelegt));
}
function aktTabelle() {
  const alle = gefilterteAkt(), l = alle.slice(0, 400);
  if (!S.d.aktivitaeten.length) return '<div class="karte leer"><h2>Noch keine Aktivitäten</h2>Jeder erfasste Anruf und jede Mail erscheint hier als Protokoll.</div>';
  if (!l.length) return '<div class="karte leer klein">Keine Aktivitäten für diese Filter.</div>';
  return `<div class="tabelle-wrap"><table class="breit"><thead><tr><th>Datum</th><th>Verein</th><th>Mitarbeiter</th><th>Kontaktart</th><th>Ergebnis</th><th>Notiz</th></tr></thead><tbody>
    ${l.map((a) => { const v = X.verein[a.vereinId]; return `<tr class="${v ? "klick" : ""}" ${v ? `data-a="verein" data-id="${esc(v.id)}"` : ""}><td class="num">${datum(a.datum)}</td><td class="name">${esc(v ? v.name : "(gelöscht)")}</td><td>${person(a.von)}</td><td>${esc(a.kanal)}</td><td>${esc(ergebnisText(a.kanal, a.ergebnis))}</td><td class="notiz-zelle umbruch">${esc(a.notiz || "")}</td></tr>`; }).join("")}
    </tbody></table></div><div class="tabelle-fuss">${l.length}${alle.length > l.length ? " von " + alle.length : ""} Einträge</div>`;
}
function vAktivitaeten() {
  const f = V.af;
  return `<div class="filterleiste"><div class="suchfeld">${ikon("suche")}<input type="search" id="a-q" placeholder="Verein, Notiz, Ergebnis …" value="${esc(f.q)}"></div>
    <select id="a-von" aria-label="Mitarbeiter">${optionen(teamSortiert().map((t) => [t.id, t.name]), f.von, "Alle Mitarbeiter")}</select>
    <select id="a-kanal" aria-label="Kontaktart">${optionen(KANAELE, f.kanal, "Alle Kontaktarten")}</select></div><div id="a-tabelle">${aktTabelle()}</div>`;
}

/* ── Vereinsdetails ──────────────────────────────────────────────────── */
function detailHtml(v) {
  const l = aktivitaetenVon(v.id);
  const fakt = (k, w) => `<div><dt>${k}</dt><dd>${w || '<span class="leise">–</span>'}</dd></div>`;
  return blattKopf(esc(v.name), `${statusPille(v.status)} ${v.prio ? `<span class="prio ${esc(v.prio)}">Prio ${esc(v.prio)}</span>` : ""}`)
    + `<div class="blatt-inhalt"><dl class="fakten">
      ${fakt("Wiedervorlage", v.wiedervorlage && istOffen(v) ? wvPille(v) + (v.naechsterSchritt ? `<div style="margin-top:4px">${esc(v.naechsterSchritt)}</div>` : "") : "")}
      ${fakt("Potenzial", v.potenzial ? eur(v.potenzial) : "")}
      ${fakt("Ansprechperson", v.person ? esc(v.person) + (v.funktion ? ` (${esc(v.funktion)})` : "") + (v.entscheider ? `<div class="leise klein">Entscheider: ${esc(v.entscheider)}</div>` : "") : "")}
      ${fakt("Betreuer", v.betreuer ? person(v.betreuer) : "")}
      ${fakt("Telefon", v.telefon && `<a href="tel:${esc(v.telefon.replace(/[^\d+]/g, ""))}">${esc(v.telefon)}</a>`)}
      ${fakt("E-Mail", v.email && `<a href="mailto:${esc(v.email)}">${esc(v.email)}</a>`)}
      ${fakt("Adresse", [v.strasse, [v.plz, v.ort].filter(Boolean).join(" ")].filter(Boolean).map(esc).join("<br>"))}
      ${fakt("Verband", [v.verband, v.bundesland].filter(Boolean).map(esc).join("<br>"))}
      ${fakt("Turnier / Camp", v.veranstaltung ? esc(v.veranstaltung) + `<div class="leise klein">${esc([v.art, terminText(v), v.groesse && "ca. " + v.groesse + " Teilnehmer/Teams"].filter(Boolean).join(" · "))}</div>` : "")}
      ${fakt("Aktuelle Lösung", v.loesung && esc(v.loesung))}
    </dl>
    <div class="karte-kopf"><h2>Verlauf</h2><span class="unter">${l.length} ${l.length === 1 ? "Kontakt" : "Kontakte"}</span></div>
    ${l.length ? `<ul class="verlauf">${l.map((a) => `<li><div class="kopf-z"><b>${datum(a.datum)}</b><span>${esc(a.kanal)}</span>${person(a.von, "")}<button class="link leise" style="margin-left:auto" data-a="aktLoeschen" data-id="${esc(a.id)}">Löschen</button></div>
      <div style="margin-top:6px"><span class="pille ${ERGm[a.ergebnis]?.e ? "gruen" : ""}">${esc(ergebnisText(a.kanal, a.ergebnis))}</span></div>${a.notiz ? `<p>${esc(a.notiz)}</p>` : ""}</li>`).join("")}</ul>` : '<p class="leise">Noch kein Kontakt protokolliert.</p>'}
    </div><div class="blatt-fuss"><button class="knopf gefahr" data-a="vereinLoeschen" data-id="${esc(v.id)}">${ikon("muell")}Löschen</button><span class="wachsen"></span>
      <button class="knopf" data-a="vereinBearbeiten" data-id="${esc(v.id)}">${ikon("stift")}Stammdaten</button>
      <button class="knopf haupt" data-a="kontaktFuer" data-id="${esc(v.id)}">${ikon("plus")}Kontakt erfassen</button></div>`;
}
export function oeffneVerein(id) {
  const v = X.verein[id];
  if (!v) return;
  oeffneBlatt(detailHtml(v), { art: "verein", id });
}
export function erneuere() {
  if (blatt.offen?.art === "verein") {
    const v = X.verein[blatt.offen.id];
    if (v) erneuereBlatt(detailHtml(v)); else schliesse();
  }
}

/* ── Kontakt erfassen / Stammdaten bearbeiten ────────────────────────── */
const feld = (label, id, typ, wert, o = {}) => `<label class="f${o.ganz ? " ganz" : ""}">${label}<input id="${id}" type="${typ || "text"}" value="${esc(wert == null ? "" : wert)}"${o.liste ? ` list="${o.liste}" autocomplete="off"` : ""}${o.ph ? ` placeholder="${esc(o.ph)}"` : ""}${o.min !== undefined ? ` min="${o.min}"` : ""}${o.step ? ` step="${o.step}"` : ""}${o.auto ? " autofocus" : ""}></label>`;
const auswahl = (label, id, liste, wert, leer = "–") => `<label class="f">${label}<select id="${id}">${optionen(liste, wert, leer)}</select></label>`;

function oeffneFormular(v, modus) {
  V.form = { vereinId: v ? v.id : null, beruehrt: false, modus };
  const c = v || {};
  const html = `<form id="kontaktform" autocomplete="off">${blattKopf(modus === "bearbeiten" ? "Stammdaten bearbeiten" : "Kontakt erfassen", v ? "Bestehender Verein" : "Namen eintippen. Gibt es den Verein schon, werden seine Daten geladen.")}
  <div class="blatt-inhalt">
    <div class="gruppe"><div class="gruppe-titel">Verein</div><div class="fg">
      <label class="f ganz">Vereinsname *<input id="f-name" type="text" value="${esc(c.name || "")}" list="dl-vereine" autocomplete="off"${v ? "" : " autofocus"}></label>
      <datalist id="dl-vereine">${S.d.vereine.map((x) => `<option value="${esc(x.name)}">`).join("")}</datalist>
      ${auswahl("Landesverband", "f-verband", VERBAENDE, c.verband || "")}${auswahl("Bundesland", "f-bl", BUNDESLAENDER, c.bundesland || "")}
      ${feld("Straße, Nr.", "f-strasse", "text", c.strasse, { ganz: true })}${feld("PLZ", "f-plz", "text", c.plz)}${feld("Ort", "f-ort", "text", c.ort)}
    </div></div>
    <div class="gruppe"><div class="gruppe-titel">Ansprechperson</div><div class="fg">
      ${feld("Name", "f-person", "text", c.person)}${auswahl("Funktion", "f-funktion", FUNKTIONEN, c.funktion || "")}
      ${feld("Telefon", "f-telefon", "text", c.telefon)}${feld("E-Mail", "f-email", "email", c.email)}
      ${auswahl("Ist Entscheider/in?", "f-entscheider", ["Ja", "Nein"], c.entscheider || "")}
      <label class="f">Betreuer<select id="f-betreuer">${optionen(teamSortiert().map((t) => [t.id, t.name]), c.betreuer || (!v ? S.start?.ich || "" : ""), "–")}</select></label>
    </div></div>
    <div class="gruppe"><div class="gruppe-titel">Turnier / Camp</div><div class="fg">
      ${feld("Name der Veranstaltung", "f-veranstaltung", "text", c.veranstaltung, { ganz: true })}
      ${auswahl("Art", "f-art", ARTEN, c.art || "")}${feld("Teilnehmer / Teams (ca.)", "f-groesse", "number", c.groesse, { min: 0 })}
      ${feld("Termin von", "f-von", "date", c.terminVon)}${feld("Termin bis (bei mehreren Tagen)", "f-bis", "date", c.terminBis, { min: c.terminVon || "" })}
      <label class="check ganz"><input type="checkbox" id="f-offen"${c.terminOffen ? " checked" : ""}> Termin noch nicht bekannt</label>
      ${auswahl("Aktuelle Lösung", "f-loesung", LOESUNGEN, c.loesung || "")}
    </div></div>
    ${modus === "bearbeiten" ? "" : `<div class="gruppe"><div class="gruppe-titel">Dieser Kontakt</div><div class="fg">
      ${feld("Datum *", "f-datum", "date", HEUTE)}
      <label class="f">Kontaktart *<select id="f-kanal">${optionen(KANAELE, KANAELE[0], "Bitte wählen")}</select></label>
      <label class="f ganz">Ergebnis *<select id="f-ergebnis">${ergebnisOptionen(KANAELE[0], "")}</select></label>
      <label class="f ganz">Rückmeldung / Notiz<textarea id="f-notiz" placeholder="Was wurde gesagt? Bedarf, Einwände, Entscheider, nächste Schritte …"></textarea></label>
    </div></div>`}
    <div class="gruppe"><div class="gruppe-titel">Pipeline &amp; Wiedervorlage</div><div class="fg">
      <label class="f">Status<select id="f-status">${optionen(STATUS.map((s) => s.n), c.status || STATUS[0].n)}</select></label>
      ${feld("Potenzial (€)", "f-potenzial", "number", c.potenzial || "", { min: 0, step: "0.01" })}
      ${auswahl("Priorität", "f-prio", ["A", "B", "C"], c.prio || "")}${feld("Wiedervorlage am", "f-wv", "date", c.wiedervorlage)}
      <div class="ganz chips"><span class="leise klein">Wiedervorlage in</span>${[[1, "1 Tag"], [3, "3 Tagen"], [7, "1 Woche"], [14, "2 Wochen"], [30, "1 Monat"]].map((x) => `<button type="button" class="chip" data-a="wvSetzen" data-n="${x[0]}">${x[1]}</button>`).join("")}</div>
      ${feld("Nächster Schritt", "f-schritt", "text", c.naechsterSchritt, { ganz: true, ph: "z. B. Demo anbieten, Angebot nachfassen" })}
    </div></div>
  </div>
  <div class="blatt-fuss"><span class="fehler-text wachsen" id="f-fehler"></span>
    ${modus === "bearbeiten" ? '<button type="button" class="knopf" data-a="schliessen">Abbrechen</button><button type="submit" class="knopf haupt">Speichern</button>'
      : '<button type="button" class="knopf" data-a="nurStammdaten">Nur Stammdaten speichern</button><button type="submit" class="knopf haupt">Kontakt speichern</button>'}
  </div></form>`;
  oeffneBlatt(html, { breit: true, art: "formular" });
  syncTerminOffen();
}
function fuelle(c) {
  const set = (id, w) => { const e = document.getElementById(id); if (e) e.value = w == null ? "" : w; };
  set("f-verband", c.verband); set("f-bl", c.bundesland); set("f-strasse", c.strasse); set("f-plz", c.plz); set("f-ort", c.ort);
  set("f-person", c.person); set("f-funktion", c.funktion); set("f-telefon", c.telefon); set("f-email", c.email); set("f-entscheider", c.entscheider); set("f-betreuer", c.betreuer);
  set("f-veranstaltung", c.veranstaltung); set("f-art", c.art); set("f-von", c.terminVon); set("f-bis", c.terminBis); set("f-groesse", c.groesse); set("f-loesung", c.loesung);
  const o = $("#f-offen"); if (o) { o.checked = !!c.terminOffen; syncTerminOffen(); }
  set("f-status", c.status || STATUS[0].n); set("f-potenzial", c.potenzial || ""); set("f-prio", c.prio); set("f-wv", c.wiedervorlage); set("f-schritt", c.naechsterSchritt);
}
function syncTerminOffen() { const o = $("#f-offen"); if (!o) return; ["f-von", "f-bis"].forEach((id) => { const e = $("#" + id); if (e) { e.disabled = o.checked; if (o.checked) e.value = ""; } }); }
function namePruefen() {
  const n = gv("f-name").toLowerCase(), c = S.d.vereine.find((x) => String(x.name).toLowerCase() === n), st = $("#blatt-unter");
  if (!st || !V.form) return;
  if (c && c.id !== V.form.vereinId) { V.form.vereinId = c.id; fuelle(c); V.form.beruehrt = false; st.className = "unter ok"; st.textContent = `Bestehender Verein · ${aktivitaetenVon(c.id).length} bisherige Kontakte. Daten wurden geladen.`; }
  else if (!c && V.form.vereinId && V.form.modus !== "bearbeiten") { V.form.vereinId = null; st.className = "unter"; st.textContent = "Neuer Verein"; }
  else if (!c && n) { st.className = "unter"; st.textContent = "Neuer Verein"; }
}
function statusVorschlagen() {
  const e = ERGm[gv("f-ergebnis")];
  if (!e || V.form?.beruehrt) return;
  const akt = STm[gv("f-status")], ziel = STm[e.s];
  if (!akt || !akt.open || ziel.rang === 9 || !ziel.open || ziel.rang > akt.rang || akt.rang === 0) $("#f-status").value = e.s;
}
async function speichereFormular(mitKontakt) {
  const fehlerText = (m) => { $("#f-fehler").textContent = m; };
  const n = gv("f-name");
  if (!n) return fehlerText("Bitte den Vereinsnamen eintragen.");
  if (gv("f-bis") && !gv("f-von")) return fehlerText("Bitte zuerst das Startdatum der Veranstaltung eintragen.");
  if (gv("f-bis") && gv("f-bis") < gv("f-von")) return fehlerText("Das Enddatum liegt vor dem Startdatum.");
  if (mitKontakt) {
    if (!gv("f-datum")) return fehlerText("Bitte das Datum eintragen.");
    if (!gv("f-kanal")) return fehlerText("Bitte die Kontaktart wählen.");
    if (!gv("f-ergebnis")) return fehlerText("Bitte das Ergebnis wählen.");
  }
  const vorhanden = X.verein[V.form.vereinId] || S.d.vereine.find((c) => String(c.name).toLowerCase() === n.toLowerCase());
  const w = {
    name: n, verband: gv("f-verband"), bundesland: gv("f-bl"), strasse: gv("f-strasse"), plz: gv("f-plz"), ort: gv("f-ort"),
    person: gv("f-person"), funktion: gv("f-funktion"), telefon: gv("f-telefon"), email: gv("f-email"), entscheider: gv("f-entscheider"), betreuer: gv("f-betreuer"),
    veranstaltung: gv("f-veranstaltung"), art: gv("f-art"), terminVon: gv("f-von"), terminBis: gv("f-bis"), terminOffen: !!$("#f-offen")?.checked,
    groesse: gv("f-groesse") === "" ? "" : num(gv("f-groesse")), loesung: gv("f-loesung"),
    status: gv("f-status"), potenzial: gv("f-potenzial") === "" ? 0 : Math.round(num(gv("f-potenzial")) * 100) / 100, prio: gv("f-prio"),
    wiedervorlage: gv("f-wv"), naechsterSchritt: gv("f-schritt"),
  };
  if (mitKontakt) { const d = gv("f-datum"); const alt = vorhanden?.letzterKontakt || ""; if (!alt || d > alt) w.letzterKontakt = d; }
  const knoepfe = [...document.querySelectorAll("#kontaktform .blatt-fuss .knopf")];
  knoepfe.forEach((b) => (b.disabled = true));
  try {
    const id = vorhanden ? vorhanden.id : null;
    const aend = [id ? { k: "vereine", a: "upd", id, w } : { k: "vereine", a: "set", w: { ...w, angelegt: Date.now(), angelegtVon: S.start?.ich || "" } }];
    const ids = await schreibe(aend);
    const vid = id || ids[0];
    if (mitKontakt) await neu("aktivitaeten", { vereinId: vid, datum: gv("f-datum"), von: S.start?.ich || "", kanal: gv("f-kanal"), ergebnis: gv("f-ergebnis"), notiz: gv("f-notiz") });
    const zurueck = V.form.ausDetail;
    schliesse();
    melde(mitKontakt ? "Kontakt gespeichert" : "Gespeichert");
    if (zurueck) oeffneVerein(vid);
  } catch (e) {
    knoepfe.forEach((b) => (b.disabled = false));
    fehlerText(e.message);
  }
}

/* ── Aktionen ────────────────────────────────────────────────────────── */
Object.assign(aktionen, {
  kontaktNeu: () => oeffneFormular(null, "kontakt"),
  kontaktFuer: (el) => oeffneFormular(X.verein[el.dataset.id], "kontakt"),
  vereinBearbeiten: (el) => { oeffneFormular(X.verein[el.dataset.id], "bearbeiten"); V.form.ausDetail = true; },
  verein: (el) => oeffneVerein(el.dataset.id),
  nurStammdaten: () => speichereFormular(false),
  wvSetzen: (el) => { $("#f-wv").value = plusTage(HEUTE, Number(el.dataset.n)); },
  verschiebe: async (el) => {
    const v = X.verein[el.dataset.id]; if (!v) return;
    const basis = v.wiedervorlage && v.wiedervorlage > HEUTE ? v.wiedervorlage : HEUTE;
    try { await aendere("vereine", v.id, { wiedervorlage: plusTage(basis, Number(el.dataset.n)) }); melde("Wiedervorlage verschoben"); } catch (e) { fehler(e); }
  },
  nachStatus: (el) => { V.f = { ...V.f, status: el.dataset.v, offen: false, q: "", bl: "", prio: "", betreuer: "" }; location.hash = "#/vertrieb/vereine"; },
  vereinLoeschen: async (el) => {
    const v = X.verein[el.dataset.id]; if (!v) return;
    const l = aktivitaetenVon(v.id);
    if (!(await frage("Verein löschen?", `„${v.name}“ und ${l.length} protokollierte Kontakte werden für alle gelöscht.`))) return;
    try { await schreibe([...l.map((a) => ({ k: "aktivitaeten", a: "del", id: a.id })), { k: "vereine", a: "del", id: v.id }]); schliesse(); melde("Verein gelöscht"); } catch (e) { fehler(e); }
  },
  aktLoeschen: async (el) => {
    if (!(await frage("Eintrag löschen?", "Dieser Kontakt wird aus dem Verlauf entfernt."))) return;
    try { await schreibe([{ k: "aktivitaeten", a: "del", id: el.dataset.id }]); melde("Eintrag gelöscht"); } catch (e) { fehler(e); }
  },
});
absenden.kontaktform = () => speichereFormular(V.form?.modus !== "bearbeiten");
Object.assign(eingaben, {
  "f-name": namePruefen,
  "v-q": (el) => { V.f.q = el.value; $("#v-tabelle").innerHTML = vereinTabelle(); },
  "a-q": (el) => { V.af.q = el.value; $("#a-tabelle").innerHTML = aktTabelle(); },
});
Object.assign(aenderungen, {
  "f-offen": syncTerminOffen,
  "f-von": (el) => { const e = $("#f-bis"); if (e) { e.min = el.value; if (e.value && el.value && e.value < el.value) e.value = el.value; } },
  "f-kanal": (el) => { const r = $("#f-ergebnis"); if (r) r.innerHTML = ergebnisOptionen(el.value, r.value); },
  "f-ergebnis": statusVorschlagen,
  "f-status": () => { if (V.form) V.form.beruehrt = true; },
  "v-zeitraum": (el, neuZeichnen) => { V.zeitraum = el.value; merk.set("v_zeitraum", el.value); neuZeichnen(); },
  "v-wer": (el, neuZeichnen) => { V.wer = el.value; neuZeichnen(); },
  "v-status": (el) => { V.f.status = el.value; merkeFilter(); $("#v-tabelle").innerHTML = vereinTabelle(); },
  "v-bl": (el) => { V.f.bl = el.value; merkeFilter(); $("#v-tabelle").innerHTML = vereinTabelle(); },
  "v-prio": (el) => { V.f.prio = el.value; merkeFilter(); $("#v-tabelle").innerHTML = vereinTabelle(); },
  "v-betreuer": (el) => { V.f.betreuer = el.value; merkeFilter(); $("#v-tabelle").innerHTML = vereinTabelle(); },
  "v-sort": (el) => { V.f.sort = el.value; merkeFilter(); $("#v-tabelle").innerHTML = vereinTabelle(); },
  "v-offen": (el) => { V.f.offen = el.checked; merkeFilter(); $("#v-tabelle").innerHTML = vereinTabelle(); },
  "a-von": (el) => { V.af.von = el.value; $("#a-tabelle").innerHTML = aktTabelle(); },
  "a-kanal": (el) => { V.af.kanal = el.value; $("#a-tabelle").innerHTML = aktTabelle(); },
});
