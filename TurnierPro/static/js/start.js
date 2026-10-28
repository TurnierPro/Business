// Startseite: Was ist heute wichtig? Aufgaben, Wiedervorlagen, Umsatzziel, Abschluss, Kalender.
import {
  S, X, esc, num, ikon, HEUTE, JAHR, MONAT, MONATE, WT, WT_LANG, wochentag, pad, datum, eur, eurGanz, zahl, api,
  ichMitglied, aktionen,
} from "./kern.js";
import { faelligeVereine, istOffen, offeneAufgaben, aufgabeZustand, termine, summe, GEWONNEN } from "./stammdaten.js";
import { wvEintrag } from "./vertrieb.js";
import { kachel as aufgabenKachel } from "./aufgaben.js";
import { zielKarte, ladeFinanzen } from "./finanzen.js";

const ST = { kal: { j: JAHR, m: MONAT - 1 }, abschluss: null, abschlussZeit: 0, folie: 0 };
const VORMONAT = MONAT === 1 ? { j: JAHR - 1, m: 12 } : { j: JAHR, m: MONAT - 1 };

function gruss() {
  const h = new Date().getHours();
  return h < 11 ? "Guten Morgen" : h < 18 ? "Hallo" : "Guten Abend";
}

export function reiter() { return []; }
export function ansicht(_u, neuZeichnen) {
  // Finanzen und Abschluss-Status im Hintergrund nachladen
  if (!S.fin[JAHR]) ladeFinanzen(JAHR).then(neuZeichnen);
  if (Date.now() - ST.abschlussZeit > 120000) {
    ST.abschlussZeit = Date.now();
    api(`/api/status?jahr=${VORMONAT.j}&monat=${VORMONAT.m}`).then((r) => { ST.abschluss = r; neuZeichnen(); }).catch((e) => { ST.abschluss = { fehler: e.message }; neuZeichnen(); });
  }
  const ich = ichMitglied();
  const faellig = faelligeVereine();
  const meine = offeneAufgaben(S.start?.ich || "");
  const ueber = meine.filter((t) => aufgabeZustand(t) === "ueber").length;
  const offen = S.d.vereine.filter(istOffen);
  const fin = S.fin[JAHR];
  const erg = fin?.ok ? fin.d.jahr_summe.ergebnis : null;
  const heute = new Date();

  let h = `<div class="gruss"><div class="wachsen"><div class="datum">${WT_LANG[heute.getDay()]}, ${heute.getDate()}. ${MONATE[heute.getMonth()]} ${heute.getFullYear()}</div>
    <h1>${gruss()}${ich ? ", " + esc(ich.name.split(" ")[0]) : ""}</h1></div>
    <button class="knopf" data-a="geheZu" data-v="aufgaben">${ikon("aufgaben")}Aufgabe</button>
    <button class="knopf haupt" data-a="kontaktNeu">${ikon("plus")}Kontakt erfassen</button></div>`;

  const kpi = (ziel, ik, k, v, s, kl = "") => `<button class="kpi" data-a="geheZu" data-v="${ziel}"><span class="k">${ikon(ik)}${k}</span><span class="v ${kl}">${v}</span><span class="s">${s}</span></button>`;
  h += `<div class="kpi-zeile">
    ${kpi("vertrieb/wiedervorlagen", "glocke", "Heute dran", faellig.length, faellig.length ? `<b>${faellig.filter((v) => v.wiedervorlage < HEUTE).length}</b> überfällige Wiedervorlagen` : "Keine Wiedervorlagen fällig", faellig.length ? "schlecht" : "gut")}
    ${kpi("aufgaben", "aufgaben", S.start?.ich ? "Meine Aufgaben" : "Offene Aufgaben", meine.length, ueber ? `<b>${ueber}</b> überfällig` : "nichts überfällig", ueber ? "schlecht" : "")}
    ${kpi("vertrieb", "vertrieb", "Pipeline", eurGanz(summe(offen, (v) => v.potenzial)), `${offen.length} ${offen.length === 1 ? "offener Verein" : "offene Vereine"} · ${S.d.vereine.filter((v) => v.status === GEWONNEN).length} gewonnen`)}
    ${kpi("finanzen", "finanzen", "Ergebnis " + JAHR, erg == null ? "–" : (erg > 0 ? "+" : "") + eurGanz(erg), fin?.ok ? `${eurGanz(fin.d.jahr_summe.einnahmen)} Einnahmen` : fin ? "Finanzübersicht nicht gefunden" : "lädt …", erg == null ? "" : erg < 0 ? "schlecht" : "gut")}
  </div><div class="abstand"></div>`;

  h += `<div class="raster raster-21"><div class="stapel">${aufgabenKachel()}
      <section class="karte"><div class="karte-kopf"><h2>Heute dran im Vertrieb</h2>${faellig.length ? `<span class="pille rot">${faellig.length} fällig</span>` : ""}<button class="link" data-a="geheZu" data-v="vertrieb/wiedervorlagen">Alle Wiedervorlagen</button></div>
        ${faellig.length ? faellig.slice(0, 4).map((v) => wvEintrag(v, true)).join("") : '<div class="leer klein">Nichts überfällig und nichts für heute geplant.</div>'}</section>
    </div><div class="stapel">${zielKarte(JAHR)}${abschlussKarte()}${teamKarte()}</div></div><div class="abstand"></div>`;
  h += kalender();
  h += `<div class="abstand"></div><div class="raster raster-2">${rekordKarte()}${besucherKarte()}</div>`;
  return { titel: "Start", aktionen: "", html: h, ohneKopf: true };
}

function abschlussKarte() {
  const a = ST.abschluss, titel = `Monatsabschluss ${MONATE[VORMONAT.m - 1]}`;
  const kopf = `<div class="karte-kopf"><h2>${titel}</h2><button class="link" data-a="geheZu" data-v="finanzen/abschluss">Öffnen</button></div>`;
  if (!a) return `<section class="karte">${kopf}<div class="laden" style="padding:12px">Prüfe Ordner …</div></section>`;
  if (a.fehler) return `<section class="karte">${kopf}<p class="leise">${esc(a.fehler)}</p></section>`;
  const liste = a.checkliste || [], fertig = liste.filter((c) => c.erledigt).length;
  return `<section class="karte">${kopf}<div class="abschluss-schritte">${liste.map((c) => `<div class="schritt"><span class="haken ${c.erledigt ? "ja" : "nein"}">${ikon(c.erledigt ? "haken" : "x")}</span><span>${esc(c.aufgabe.replace(/ \(.*\)/, ""))}</span></div>`).join("")}</div>
    <p class="leise klein" style="margin-top:8px">${fertig === liste.length ? "Alle Unterlagen da. Bericht und Belegpaket können erstellt werden." : `${liste.length - fertig} von ${liste.length} Punkten fehlen noch.`}</p></section>`;
}
function teamKarte() {
  if (S.geraete.length < 2 && S.d.team.length < 2) return "";
  return `<section class="karte"><div class="karte-kopf"><h2>Team</h2><span class="unter">${S.geraete.length} ${S.geraete.length === 1 ? "Mac" : "Macs"} verbunden</span></div>
    ${S.geraete.map((g) => { const on = Date.now() - num(g.zuletzt) < 3 * 60000; return `<div class="schritt"><span class="punkt ${on ? "ok" : ""}"></span><span class="wachsen"><b>${esc(X.team[g.mitglied]?.name || g.name)}</b> <span class="leise klein">${esc(g.name)}${g.dieser ? " · dieser Mac" : ""}</span></span><span class="leise klein">${on ? "aktiv" : "zuletzt " + new Date(num(g.zuletzt)).toLocaleDateString("de-DE")}</span></div>`; }).join("")}</section>`;
}

/* ── Kalender: Turniere und Camps ────────────────────────────────────── */
function kalender() {
  const { j, m } = ST.kal, erster = new Date(Date.UTC(j, m, 1)), vor = (erster.getUTCDay() + 6) % 7, tage = new Date(Date.UTC(j, m + 1, 0)).getUTCDate();
  const iso = (y, mo, d) => { const x = new Date(Date.UTC(y, mo, d)); return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`; };
  const zellen = Math.ceil((vor + tage) / 7) * 7, von = iso(j, m, 1 - vor), bis = iso(j, m, zellen - vor);
  const ev = termine(von, bis), imMonat = termine(iso(j, m, 1), iso(j, m, tage));
  const chip = (e) => {
    const kl = `ev ${e.art === "camp" ? "camp" : e.art === "verein" ? "verein" : ""}`, titel = esc(e.titel + (e.ort ? " · " + e.ort : "") + (e.verein ? " · " + e.verein : ""));
    if (e.url) return `<a class="${kl}" href="${esc(e.url)}" target="_blank" rel="noopener" title="${titel}">${esc(e.titel)}</a>`;
    return `<button class="${kl}" ${e.quelle === "verein" ? `data-a="verein" data-id="${esc(e.id)}"` : ""} title="${titel}">${esc(e.titel)}</button>`;
  };
  let g = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((w) => `<div class="kal-w">${w}</div>`).join("");
  for (let i = 0; i < zellen; i++) {
    const d = iso(j, m, 1 - vor + i), drin = +d.slice(5, 7) - 1 === m, l = ev.filter((e) => e.a <= d && e.b >= d);
    g += `<div class="kal-t${drin ? "" : " aus"}${d === HEUTE ? " heute" : ""}"><span class="n">${+d.slice(8, 10)}</span>${l.slice(0, 3).map(chip).join("")}${l.length > 3 ? `<div class="ev-mehr">+${l.length - 3} weitere</div>` : ""}</div>`;
  }
  const aktuell = j === JAHR && m === MONAT - 1;
  const quelle = X.einst.termine?.stand ? ` · turnierpro.de Stand ${datum(X.einst.termine.stand)}` : "";
  return `<section class="karte"><div class="kal-kopf"><h2>Turniere und Camps · ${MONATE[m]} ${j}</h2>
    <span class="leise klein">${imMonat.length} ${imMonat.length === 1 ? "Termin" : "Termine"}</span>
    <button class="ikon-knopf" data-a="kalender" data-v="-1" aria-label="Vorheriger Monat">${ikon("links")}</button>
    ${aktuell ? "" : '<button class="knopf klein" data-a="kalender" data-v="0">Heute</button>'}
    <button class="ikon-knopf" data-a="kalender" data-v="1" aria-label="Nächster Monat">${ikon("rechts")}</button></div>
    <div class="kal">${g}</div>
    <div class="kal-legende"><span><i style="background:var(--gruen-100)"></i>Turnier</span><span><i style="background:#FBF0DD"></i>Camp</span><span><i style="background:var(--blau-50)"></i>Veranstaltung aus dem Vertrieb</span><span style="margin-left:auto">${S.d.termine.length ? "Quelle: Termine-Import" + quelle : "Turniere von turnierpro.de lassen sich unter Einstellungen › Import übernehmen."}</span></div></section>`;
}

/* Rekord-Vereine aus den importierten Terminen (wer stellt die meisten Turniere/Camps ein) */
function rekordKarte() {
  const zaehle = (art) => { const m = {}; S.d.termine.forEach((t) => { if (t.veranstalter && (t.art === "camp" ? "camp" : "turnier") === art) m[t.veranstalter] = (m[t.veranstalter] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])); };
  const t = zaehle("turnier"), c = zaehle("camp");
  if (!t.length && !c.length) return "";
  const kuerzel = (n) => String(n || "?").replace(/\b(e\.?\s?v\.?|von|der|die|das)\b/gi, "").split(/[\s/-]+/).filter((w) => /^[A-Za-zÄÖÜäöü]/.test(w)).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "?";
  const block = (titel, l, einheit) => l.length ? `<div style="display:flex;gap:14px;align-items:center;padding:8px 0"><span class="wappen">${esc(kuerzel(l[0][0]))}</span><div><div class="leise klein">${titel}</div><b style="font-family:var(--f-titel)">${esc(l[0][0])}</b> · ${l[0][1]} ${einheit}
    ${l.length > 1 ? `<div class="leise klein">${l.slice(1, 3).map((r, i) => `${i + 2}. ${esc(r[0])} (${r[1]})`).join(" · ")}</div>` : ""}</div></div>` : "";
  return `<section class="karte"><div class="karte-kopf"><h2>Rekord-Vereine</h2><span class="unter">aus den Terminen</span></div>${block("Meiste Turniere eingestellt", t, "Turniere")}${block("Meiste Camps durchgeführt", c, "Camps")}</section>`;
}

/* Besucher und Klicks auf turnierpro.de (nur mit echten, importierten Zahlen) */
function besucherKarte() {
  if (!S.d.besuche.length) return "";
  const nach = Object.fromEntries(S.d.besuche.map((b) => [b.datum || b.id, b]));
  const tage = []; for (let i = 29; i >= 0; i--) { const d = new Date(Date.now() - i * 864e5); tage.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`); }
  const v = tage.map((d) => num(nach[d]?.besucher)), k = tage.map((d) => num(nach[d]?.klicks));
  const max = Math.max(1, ...v, ...k), B = 600, H = 120, pl = 8, ih = H - 22;
  const x = (i) => pl + (i * (B - pl * 2)) / (tage.length - 1), y = (w) => 6 + ih - (w / max) * ih;
  const pfad = (arr) => arr.map((w, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(w).toFixed(1)}`).join(" ");
  return `<section class="karte"><div class="karte-kopf"><h2>Besucher &amp; Klicks</h2><span class="unter">letzte 30 Tage</span></div>
    <div class="kpi-zeile" style="margin-bottom:10px"><div><span class="leise klein">Besucher</span><div style="font:700 22px var(--f-titel)">${zahl(v.reduce((a, b) => a + b, 0))}</div></div><div><span class="leise klein">Klicks</span><div style="font:700 22px var(--f-titel)">${zahl(k.reduce((a, b) => a + b, 0))}</div></div></div>
    <div class="diagramm"><svg viewBox="0 0 ${B} ${H}"><path d="${pfad(v)}" fill="none" stroke="var(--serie-1)" stroke-width="2.2"/><path d="${pfad(k)}" fill="none" stroke="var(--serie-2)" stroke-width="2.2"/>
    ${tage.map((d, i) => `<rect x="${x(i) - 8}" y="0" width="16" height="${H}" fill="transparent" data-tip="${esc(datum(d))}: ${v[i]} Besucher · ${k[i]} Klicks"/>`).join("")}</svg></div>
    <div class="legende"><span><i style="background:var(--serie-1)"></i>Besucher</span><span><i style="background:var(--serie-2)"></i>Klicks</span></div></section>`;
}

Object.assign(aktionen, {
  kalender: (el, neuZeichnen) => {
    const v = Number(el.dataset.v);
    if (!v) ST.kal = { j: JAHR, m: MONAT - 1 };
    else { let m = ST.kal.m + v, j = ST.kal.j; if (m < 0) { m = 11; j--; } if (m > 11) { m = 0; j++; } ST.kal = { j, m }; }
    neuZeichnen();
  },
});
