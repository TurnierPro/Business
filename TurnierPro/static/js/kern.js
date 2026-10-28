// TurnierPro · Kern: Zustand, Datenabgleich, Hilfsfunktionen, Dialoge.
// Alle Bereiche (start.js, vertrieb.js …) bauen darauf auf.

/* ── Zustand ─────────────────────────────────────────────────────────── */
export const S = {
  start: null,          // Infos vom Server: Gerät, Datenordner, „ich“
  stand: "",            // Versionsstand der geteilten Daten
  d: { vereine: [], aktivitaeten: [], aufgaben: [], projekte: [], kommentare: [], team: [], termine: [], besuche: [], einstellungen: [] },
  geraete: [],
  icloud: [],
  bereit: false,
  fehler: "",
  route: { bereich: "start", unter: "", id: "" },
  fin: {},              // Finanzdaten aus der Excel je Jahr
  konfig: null,         // Status der Zugänge (Claude, Stripe …)
};

/* ── Kleine Helfer ───────────────────────────────────────────────────── */
export const $ = (s, el) => (el || document).querySelector(s);
export const $$ = (s, el) => [...(el || document).querySelectorAll(s)];
export const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const num = (n) => Number(n) || 0;
export const pad = (n) => String(n).padStart(2, "0");
export const ikon = (name, kl = "") => `<svg class="i ${kl}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
export const gv = (id) => { const e = document.getElementById(id); return e ? String(e.value).trim() : ""; };

/* Datum: intern immer JJJJ-MM-TT */
const jetzt = new Date();
export const HEUTE = `${jetzt.getFullYear()}-${pad(jetzt.getMonth() + 1)}-${pad(jetzt.getDate())}`;
export const JAHR = jetzt.getFullYear();
export const MONAT = jetzt.getMonth() + 1;
const parse = (s) => new Date(s + "T12:00:00Z");
export const plusTage = (s, n) => { const d = parse(s); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const tageBis = (a, b) => Math.round((parse(a) - parse(b)) / 864e5);
export const wochentag = (s) => parse(s).getUTCDay();
export const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
export const MON = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
export const WT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
export const WT_LANG = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
export const datum = (s) => (s ? `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}` : "");
export const datumKurz = (s) => (s ? `${WT[wochentag(s)]}, ${s.slice(8, 10)}.${s.slice(5, 7)}.` : "");
export const datumZeit = (ms) => { const d = new Date(ms); return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) + ", " + d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) + " Uhr"; };
export const vorZeit = (ms) => {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 90) return "gerade eben";
  if (s < 3600) return `vor ${Math.round(s / 60)} Min.`;
  if (s < 86400) return `vor ${Math.round(s / 3600)} Std.`;
  return `vor ${Math.round(s / 86400)} Tagen`;
};
export const isoWoche = (s) => { const d = parse(s); const dn = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - dn + 3); const ft = new Date(Date.UTC(d.getUTCFullYear(), 0, 4)); return 1 + Math.round(((d - ft) / 864e5 - 3 + ((ft.getUTCDay() + 6) % 7)) / 7); };

/* Geld und Prozent */
const EUR0 = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const EUR2 = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const eur = (n) => { const v = Math.round(num(n) * 100) / 100; return (Number.isInteger(v) ? EUR0 : EUR2).format(v); };
export const eur2 = (n) => EUR2.format(num(n));
export const eurGanz = (n) => EUR0.format(Math.round(num(n)));
export const zahl = (n) => Math.round(num(n)).toLocaleString("de-DE");
export const prozent = (a, b) => (b ? Math.round((a / b) * 100) + " %" : "0 %");
export const komma = (n, s = 1) => num(n).toFixed(s).replace(".", ",");

/* Kleiner Speicher im Browser (nur Bequemlichkeit: Filter, gewählter Reiter) */
export const merk = {
  get(k, std) { try { const v = localStorage.getItem("tp_" + k); return v == null ? std : JSON.parse(v); } catch (e) { return std; } },
  set(k, v) { try { localStorage.setItem("tp_" + k, JSON.stringify(v)); } catch (e) { /* egal */ } },
};

/* ── Server ──────────────────────────────────────────────────────────── */
export async function api(pfad, opts = {}) {
  const o = { ...opts, headers: { "X-TurnierPro": "1", ...(opts.headers || {}) } };
  if (o.json !== undefined) {
    o.method = o.method || "POST";
    o.headers["Content-Type"] = "application/json";
    o.body = JSON.stringify(o.json);
    delete o.json;
  }
  let res;
  try { res = await fetch(pfad, o); } catch (e) { throw new Error("Der TurnierPro-Server antwortet nicht. Läuft die App noch?"); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw new Error(data.fehler || `Fehler ${res.status}`);
  return data;
}

/* Geteilte Daten laden und schreiben */
const beobachter = [];
export const beiAenderung = (fn) => beobachter.push(fn);

/** art "fern": Änderung kam vom anderen Mac → Eingaben auf dem Bildschirm behalten */
export async function ladeDaten(art = "") {
  const r = await api("/api/daten");
  S.d = { ...S.d, ...r.daten };
  S.stand = r.stand;
  S.geraete = r.geraete || [];
  S.icloud = r.icloud_wartet || [];
  S.bereit = true;
  S.fehler = "";
  baueIndex();
  beobachter.forEach((fn) => fn(art));
}

/** Änderungen schreiben. Beispiel: schreibe([{k:"aufgaben", a:"set", w:{titel:"…"}}]) */
export async function schreibe(aenderungen) {
  const r = await api("/api/daten", { json: { aenderungen } });
  await ladeDaten();
  return r.ids;
}
export const neu = (k, w) => schreibe([{ k, a: "set", w: { ...w, angelegt: Date.now(), angelegtVon: S.start?.ich || "" } }]).then((ids) => ids[0]);
export const aendere = (k, id, w) => schreibe([{ k, a: "upd", id, w }]);
export const loesche = (k, id) => schreibe([{ k, a: "del", id }]);

/* Regelmäßig prüfen, ob der andere Mac etwas geändert hat */
let pruefTimer = 0;
export function starteAbgleich() {
  clearInterval(pruefTimer);
  pruefTimer = setInterval(async () => {
    if (document.hidden) return;
    try {
      const r = await api("/api/daten/stand");
      S.icloud = r.icloud_wartet || [];
      S.fehler = "";
      if (r.stand !== S.stand) await ladeDaten("fern");
      else beobachter.forEach((fn) => fn("leise"));
    } catch (e) {
      S.fehler = e.message;
      beobachter.forEach((fn) => fn("leise"));
    }
  }, 4000);
}

/* Nachschlage-Tabellen, nach jedem Laden neu */
export const X = { verein: {}, team: {}, aktVonVerein: {}, kommVonProjekt: {}, einst: {} };
function baueIndex() {
  X.verein = Object.fromEntries(S.d.vereine.map((v) => [v.id, v]));
  X.team = Object.fromEntries(S.d.team.map((t) => [t.id, t]));
  X.einst = Object.fromEntries(S.d.einstellungen.map((t) => [t.id, t]));
  X.aktVonVerein = {};
  for (const a of S.d.aktivitaeten) (X.aktVonVerein[a.vereinId] = X.aktVonVerein[a.vereinId] || []).push(a);
  for (const k in X.aktVonVerein) X.aktVonVerein[k].sort((x, y) => String(y.datum).localeCompare(String(x.datum)) || num(y.angelegt) - num(x.angelegt));
  X.kommVonProjekt = {};
  for (const c of S.d.kommentare) (X.kommVonProjekt[c.projektId] = X.kommVonProjekt[c.projektId] || []).push(c);
  for (const k in X.kommVonProjekt) X.kommVonProjekt[k].sort((a, b) => num(a.zeit) - num(b.zeit));
}

/* ── Team ────────────────────────────────────────────────────────────── */
export const teamSortiert = () => S.d.team.slice().sort((a, b) => String(a.name).localeCompare(String(b.name), "de"));
export const ichMitglied = () => X.team[S.start?.ich] || null;
export const name = (id) => (X.team[id] ? X.team[id].name : id ? "Unbekannt" : "–");
export const kuerzel = (n) => String(n || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join("").toUpperCase();
const farbe = (id) => { let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return "f" + ((h % 5) + 1); };
export const avatar = (id, gross) => (id && X.team[id] ? `<span class="av ${farbe(id)}${gross ? " gross" : ""}" aria-hidden="true">${esc(kuerzel(X.team[id].name))}</span>` : "");
export const person = (id, leer = "–") => (id && X.team[id] ? `<span class="person">${avatar(id)}${esc(X.team[id].name)}</span>` : `<span class="leise">${esc(leer)}</span>`);
export const teamOptionen = (wert, leer = "Nicht zugewiesen") => `<option value="">${esc(leer)}</option>` + teamSortiert().map((t) => `<option value="${esc(t.id)}"${t.id === wert ? " selected" : ""}>${esc(t.name)}</option>`).join("");
export const optionen = (liste, wert, leer) => (leer !== undefined ? `<option value="">${esc(leer)}</option>` : "") + liste.map((x) => { const v = Array.isArray(x) ? x[0] : x, l = Array.isArray(x) ? x[1] : x; return `<option value="${esc(v)}"${v === wert ? " selected" : ""}>${esc(l)}</option>`; }).join("");

/* ── Meldungen ───────────────────────────────────────────────────────── */
export function melde(text, art = "ok") {
  const el = document.createElement("div");
  el.className = "meldung " + art;
  el.textContent = text;
  $("#meldungen").appendChild(el);
  setTimeout(() => el.remove(), art === "fehler" ? 6500 : 3200);
}
export const fehler = (e) => melde(e && e.message ? e.message : String(e), "fehler");

/* Arbeits-Schleier für längere Vorgänge (KI-Prüfung, Stripe …) */
export function arbeit(titel, text = "") {
  let el = $("#arbeit");
  if (!titel) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement("div"); el.id = "arbeit"; el.className = "arbeit"; document.body.appendChild(el); }
  el.innerHTML = `<div class="arbeit-karte"><div class="kreisel"></div><b>${esc(titel)}</b><span>${esc(text)}</span></div>`;
}

/* ── Seitenblatt (Bearbeiten, Details) und Rückfragen ────────────────── */
export const blatt = { offen: null };
export function oeffneBlatt(html, { breit = false, art = "", id = "" } = {}) {
  blatt.offen = { art, id };
  $("#ebene").innerHTML = `<div class="schleier" data-a="schliessen"></div><div class="blatt${breit ? " breit" : ""}" role="dialog" aria-modal="true">${html}</div>`;
  const f = $("#ebene [autofocus]") || $("#ebene .blatt-inhalt input, #ebene .blatt-inhalt textarea");
  if (f && !f.disabled) setTimeout(() => f.focus(), 30);
}
export function erneuereBlatt(html) {
  const b = $("#ebene .blatt");
  if (!b) return;
  const inhalt = b.querySelector(".blatt-inhalt"), pos = inhalt ? inhalt.scrollTop : 0;
  b.innerHTML = html;
  const n = b.querySelector(".blatt-inhalt");
  if (n) n.scrollTop = pos;
}
export function schliesse() { $("#ebene").innerHTML = ""; blatt.offen = null; }
export const blattKopf = (titel, unter = "") => `<div class="blatt-kopf"><div class="wachsen"><h2>${titel}</h2>${unter ? `<div class="unter" id="blatt-unter">${unter}</div>` : ""}</div><button type="button" class="ikon-knopf" data-a="schliessen" aria-label="Schließen">${ikon("x")}</button></div>`;

/** Rückfrage mit zwei Knöpfen. Gibt true zurück, wenn bestätigt. */
export function frage(titel, text, { ja = "Löschen", gefahr = true } = {}) {
  return new Promise((ok) => {
    const ebene = document.createElement("div");
    ebene.innerHTML = `<div class="schleier"></div><div class="dialog" role="alertdialog" aria-modal="true"><div class="d-inhalt"><h2>${esc(titel)}</h2><p>${esc(text)}</p></div><div class="d-fuss"><button class="knopf" data-x="nein">Abbrechen</button><button class="knopf ${gefahr ? "gefahr bestaetigen" : "haupt"}" data-x="ja">${esc(ja)}</button></div></div>`;
    document.body.appendChild(ebene);
    const fertig = (w) => { ebene.remove(); document.removeEventListener("keydown", taste, true); ok(w); };
    const taste = (e) => { if (e.key === "Escape") { e.stopPropagation(); fertig(false); } if (e.key === "Enter") { e.preventDefault(); fertig(true); } };
    document.addEventListener("keydown", taste, true);
    ebene.addEventListener("click", (e) => { const b = e.target.closest("[data-x]"); if (b) fertig(b.dataset.x === "ja"); else if (e.target.classList.contains("schleier")) fertig(false); });
    ebene.querySelector('[data-x="ja"]').focus();
  });
}

/* ── Menü (z. B. Export) ─────────────────────────────────────────────── */
export function menue(knopf, eintraege) {
  schliesseMenue();
  const m = document.createElement("div");
  m.className = "menue"; m.id = "menue";
  m.innerHTML = eintraege.map((e) => e.href
    ? `<a href="${esc(e.href)}" download>${ikon(e.ikon || "export")}${esc(e.text)}</a>`
    : `<button type="button" data-a="${esc(e.a)}" ${e.v ? `data-v="${esc(e.v)}"` : ""}>${ikon(e.ikon || "export")}${esc(e.text)}</button>`).join("");
  document.body.appendChild(m);
  const r = knopf.getBoundingClientRect();
  m.style.top = r.bottom + 6 + "px";
  m.style.right = Math.max(8, document.documentElement.clientWidth - r.right) + "px";
}
export function schliesseMenue() { const m = $("#menue"); if (m) m.remove(); }

/* ── Diagramm-Helfer (SVG, ohne fremde Bibliothek) ───────────────────── */
export function schritt(spanne, n = 4) {
  const roh = (spanne || 1) / n, p = Math.pow(10, Math.floor(Math.log10(roh))), f = roh / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}
export const achse = (n) => Math.abs(n) >= 1000 ? (n / 1000).toLocaleString("de-DE", { maximumFractionDigits: 1 }) + " T" : Math.round(n).toLocaleString("de-DE");

/** Säulen pro Monat mit ein bis zwei Reihen. reihen: [{werte:[12], farbe, name}] */
export function saeulen(labels, reihen, { hoehe = 240, hervor = -1, formatiere = eur } = {}) {
  const B = 720, H = hoehe, pl = 54, pr = 8, pt = 12, pb = 28, ib = B - pl - pr, ih = H - pt - pb;
  const alle = reihen.flatMap((r) => r.werte), max = Math.max(1, ...alle), min = Math.min(0, ...alle);
  const st = schritt(max - min, 4), oben = Math.ceil(max / st) * st, unten = Math.floor(min / st) * st;
  const y = (v) => pt + ih - ((v - unten) / (oben - unten || 1)) * ih;
  const gw = ib / labels.length, n = reihen.length, bw = Math.min(26, (gw * 0.62) / n);
  let s = `<svg viewBox="0 0 ${B} ${H}" role="img">`;
  for (let t = unten; t <= oben + 1e-9; t += st) s += `<line class="${Math.abs(t) < 1e-9 && unten < 0 ? "null" : "gitter"}" x1="${pl}" x2="${B - pr}" y1="${y(t)}" y2="${y(t)}"/><text x="${pl - 8}" y="${y(t) + 4}" text-anchor="end">${achse(t)}</text>`;
  labels.forEach((l, i) => {
    const mitte = pl + gw * i + gw / 2, start = mitte - (bw * n + 3 * (n - 1)) / 2;
    reihen.forEach((r, j) => {
      const v = r.werte[i] || 0, y0 = y(0), y1 = y(v);
      const farbe = typeof r.farbe === "function" ? r.farbe(v) : r.farbe;
      s += `<rect x="${start + j * (bw + 3)}" y="${Math.min(y0, y1)}" width="${bw}" height="${Math.max(v ? 1 : 0, Math.abs(y1 - y0))}" rx="3" fill="${farbe}" data-tip="${esc(r.tipps ? r.tipps[i] : l + " · " + r.name + ": " + formatiere(v))}"/>`;
    });
    s += `<text x="${mitte}" y="${H - 8}" text-anchor="middle"${i === hervor ? ' style="fill:var(--ink);font-weight:700"' : ""}>${esc(l)}</text>`;
  });
  return s + "</svg>";
}

/** Linie (z. B. kumuliertes Ergebnis). werte: Zahlen, null = noch keine Daten */
export function linie(labels, werte, { hoehe = 240, farbe = "var(--gruen)", formatiere = eur } = {}) {
  const B = 720, H = hoehe, pl = 54, pr = 14, pt = 14, pb = 28, ib = B - pl - pr, ih = H - pt - pb;
  const da = werte.map((v, i) => [i, v]).filter((p) => p[1] != null);
  if (!da.length) return `<div class="leer klein">Noch keine Werte.</div>`;
  const vals = da.map((p) => p[1]), lo = Math.min(0, ...vals), hi = Math.max(0, ...vals), st = schritt(hi - lo || 1, 4);
  const unten = Math.floor(lo / st) * st, oben = Math.ceil(hi / st) * st || st;
  const y = (v) => pt + ih - ((v - unten) / (oben - unten)) * ih, x = (i) => pl + (ib * i) / (labels.length - 1);
  const f = typeof farbe === "function" ? farbe(vals[vals.length - 1]) : farbe;
  let s = `<svg viewBox="0 0 ${B} ${H}" role="img">`;
  for (let t = unten; t <= oben + 1e-9; t += st) s += `<line class="${Math.abs(t) < 1e-9 ? "null" : "gitter"}" x1="${pl}" x2="${B - pr}" y1="${y(t)}" y2="${y(t)}"/><text x="${pl - 8}" y="${y(t) + 4}" text-anchor="end">${achse(t)}</text>`;
  labels.forEach((l, i) => { s += `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${esc(l)}</text>`; });
  const pfad = da.map((p, k) => `${k ? "L" : "M"}${x(p[0]).toFixed(1)} ${y(p[1]).toFixed(1)}`).join(" ");
  const letzt = da[da.length - 1][0];
  s += `<path d="${pfad} L${x(letzt).toFixed(1)} ${y(0).toFixed(1)} L${x(da[0][0]).toFixed(1)} ${y(0).toFixed(1)}Z" fill="${f}" opacity=".1"/>`;
  s += `<path d="${pfad}" fill="none" stroke="${f}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
  da.forEach((p) => { s += `<circle cx="${x(p[0])}" cy="${y(p[1])}" r="4" fill="#fff" stroke="${f}" stroke-width="2" data-tip="${esc(labels[p[0]] + ": " + formatiere(p[1]))}"/>`; });
  return s + "</svg>";
}

/** Waagerechte Balken: [[name, wert], …] */
export function balken(eintraege, { farbe = "", formatiere = eur, leer = "Noch keine Werte." } = {}) {
  if (!eintraege.length) return `<div class="leer klein">${esc(leer)}</div>`;
  const max = Math.max(1, ...eintraege.map((e) => Math.abs(e[1])));
  return eintraege.map((e) => `<div class="balken-zeile"><span class="n" title="${esc(e[0])}">${esc(e[0])}</span><span class="balken"><i class="${farbe}" style="width:${((Math.abs(e[1]) / max) * 100).toFixed(1)}%"></i></span><span class="w">${formatiere(e[1])}</span></div>`).join("");
}

/** Fortschrittsring (Umsatzziel) */
export function ring(p, groesse = 120) {
  const C = 2 * Math.PI * 42, pc = Math.max(0, Math.min(100, p));
  return `<svg class="ring" viewBox="0 0 100 100" width="${groesse}" height="${groesse}" role="img" aria-label="${Math.round(p)} Prozent erreicht"><circle cx="50" cy="50" r="42" fill="none" stroke="var(--mint)" stroke-width="11"/><circle cx="50" cy="50" r="42" fill="none" stroke="var(--gruen)" stroke-width="11" stroke-linecap="round" stroke-dasharray="${((C * pc) / 100).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 50 50)"/><text x="50" y="57" text-anchor="middle">${Math.round(p)}%</text></svg>`;
}

/* Tooltip für alle Diagramme (data-tip) */
let tipEl = null;
document.addEventListener("mousemove", (e) => {
  const t = e.target.closest && e.target.closest("[data-tip]");
  if (!tipEl) { tipEl = document.createElement("div"); tipEl.className = "tip"; document.body.appendChild(tipEl); }
  if (!t) { tipEl.style.opacity = "0"; return; }
  tipEl.textContent = t.dataset.tip;
  tipEl.style.left = e.clientX + "px";
  tipEl.style.top = e.clientY - 12 + "px";
  tipEl.style.opacity = "1";
});

/* ── Aktionen: Klicks über data-a an einer Stelle verteilen ──────────── */
export const aktionen = {};
export const absenden = {};   // Formulare: id → Funktion
export const aenderungen = {}; // change-Ereignisse: id oder Präfix → Funktion
export const eingaben = {};    // input-Ereignisse: id → Funktion
