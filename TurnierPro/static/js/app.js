// TurnierPro · Start der Oberfläche: Navigation, Seitenaufbau, Ereignisse, Suche, erster Start.
import {
  S, X, $, esc, ikon, api, ladeDaten, starteAbgleich, beiAenderung, schreibe, neu, melde, fehler,
  blatt, schliesse, menue, schliesseMenue, vorZeit, ichMitglied, avatar, teamSortiert, num,
  aktionen, absenden, aenderungen, eingaben,
} from "./kern.js";
import { faelligeVereine, offeneAufgaben, aufgabeZustand, terminText, statusPille } from "./stammdaten.js";
import * as start from "./start.js";
import * as vertrieb from "./vertrieb.js";
import * as aufgaben from "./aufgaben.js";
import * as projekte from "./projekte.js";
import * as finanzen from "./finanzen.js";
import * as einstellungen from "./einstellungen.js";

const BEREICHE = {
  start: { modul: start, text: "Start", ikon: "start" },
  vertrieb: { modul: vertrieb, text: "Vertrieb", ikon: "vertrieb" },
  aufgaben: { modul: aufgaben, text: "Aufgaben", ikon: "aufgaben" },
  projekte: { modul: projekte, text: "Projekte", ikon: "projekte" },
  finanzen: { modul: finanzen, text: "Finanzen", ikon: "finanzen" },
  einstellungen: { modul: einstellungen, text: "Einstellungen", ikon: "einstellungen" },
};

/* ── Routen: #/bereich/unterbereich ──────────────────────────────────── */
function leseRoute() {
  const [bereich, unter] = location.hash.replace(/^#\/?/, "").split("/");
  S.route = { bereich: BEREICHE[bereich] ? bereich : "start", unter: unter || "" };
}
window.addEventListener("hashchange", () => { leseRoute(); schliesse(); zeichne(); window.scrollTo(0, 0); });

/* ── Seitenleiste ────────────────────────────────────────────────────── */
function zeichneNav() {
  const ich = S.start?.ich || "";
  const zaehler = {
    vertrieb: faelligeVereine().length,
    aufgaben: offeneAufgaben(ich).filter((t) => ["ueber", "heute"].includes(aufgabeZustand(t))).length,
  };
  const link = (k) => { const b = BEREICHE[k], n = zaehler[k]; return `<a href="#/${k}"${S.route.bereich === k ? ' aria-current="page"' : ""} title="${b.text}">${ikon(b.ikon)}<span>${b.text}</span>${n ? `<span class="zaehler">${n}</span>` : ""}</a>`; };
  $("#nav").innerHTML = `${link("start")}<div class="nav-label">Arbeit</div>${link("vertrieb")}${link("aufgaben")}${link("projekte")}<div class="nav-label">Geld</div>${link("finanzen")}<a href="#/finanzen/abschluss"${S.route.bereich === "finanzen" && S.route.unter === "abschluss" ? ' aria-current="page"' : ""} title="Monatsabschluss">${ikon("abschluss")}<span>Monatsabschluss</span></a><div class="nav-label">System</div>${link("einstellungen")}`;
  // Im Finanzbereich soll nur einer der beiden Einträge markiert sein
  if (S.route.bereich === "finanzen" && S.route.unter === "abschluss") $('#nav a[href="#/finanzen"]')?.removeAttribute("aria-current");
  const m = ichMitglied();
  $("#wer").innerHTML = m ? `${avatar(m.id, true)}<div><b>${esc(m.name)}</b><span>${esc(S.start?.geraet?.name || "")}</span></div>` : `<span class="av gross">?</span><div><b>Wer bist du?</b><span>Person wählen</span></div>`;
  zeichneSync();
}
function zeichneSync() {
  const andere = S.geraete.filter((g) => !g.dieser), aktiv = andere.filter((g) => Date.now() - num(g.zuletzt) < 3 * 60000);
  let kl = "ok", text = andere.length ? `Synchron · ${andere.length + 1} Macs` : "Gespeichert";
  if (S.fehler) { kl = "aus"; text = "Server nicht erreichbar"; }
  else if (S.icloud.length) { kl = "warn"; text = "iCloud lädt …"; }
  const titel = S.fehler || (andere.length ? andere.map((g) => `${g.name}: ${aktiv.includes(g) ? "aktiv" : "zuletzt " + vorZeit(num(g.zuletzt))}`).join("\n") : "Daten liegen im gemeinsamen Ordner");
  $("#sync").innerHTML = `<span class="punkt ${kl}"></span><span title="${esc(titel)}">${esc(text)}</span>`;
}

/* ── Hauptbereich ────────────────────────────────────────────────────── */
function neuZeichnen() { zeichne(); }
function zeichne() {
  zeichneNav();
  if (!S.bereit) return;
  if (!ichMitglied() && !S.start?.ich) { willkommen(); return; }
  const b = BEREICHE[S.route.bereich], modul = b.modul;
  const reiter = modul.reiter ? modul.reiter() : [];
  const unter = S.route.unter || (reiter[0] ? reiter[0][0] : "");
  let v;
  try { v = modul.ansicht(unter, neuZeichnen); }
  catch (e) { console.error(e); v = { titel: b.text, html: `<div class="banner fehler">${ikon("warn")}<span>Diese Ansicht konnte nicht angezeigt werden: ${esc(e.message)}</span></div>` }; }
  // Fokus und Eingabe merken, damit ein Neuaufbau beim Tippen nicht stört
  const akt = document.activeElement, aid = akt && akt.id && $("#ansicht").contains(akt) ? akt.id : null;
  const wert = aid ? akt.value : null, sel = aid && akt.selectionStart != null ? [akt.selectionStart, akt.selectionEnd] : null;
  $("#titel").textContent = v.titel;
  $("#kopf-aktionen").innerHTML = v.aktionen || "";
  $("#reiter").innerHTML = reiter.map(([id, text, n]) => `<a href="#/${S.route.bereich}/${id}"${id === unter ? ' aria-current="page"' : ""}>${esc(text)}${n ? `<span class="pille rot ohne-punkt">${n}</span>` : ""}</a>`).join("");
  $("#kopf").classList.toggle("ohne-reiter", !reiter.length);
  $("#kopf").hidden = !!v.ohneKopf;
  $("#ansicht").innerHTML = (S.icloud.length ? `<div class="banner warn">${ikon("sync")}<span class="wachsen">iCloud lädt gerade Daten vom anderen Mac. Sie erscheinen automatisch.</span></div>` : "") + v.html;
  document.title = v.titel === "Start" ? "TurnierPro" : `${v.titel} · TurnierPro`;
  if (aid) { const n = document.getElementById(aid); if (n) { if (wert != null && n.value !== wert && n.type !== "file") n.value = wert; n.focus(); if (sel && n.setSelectionRange) try { n.setSelectionRange(sel[0], sel[1]); } catch (e) { /* egal */ } } }
  vertrieb.erneuere();
  projekte.erneuere();
}

/* ── Erster Start: Wer bist du? ──────────────────────────────────────── */
function willkommen() {
  $("#kopf").hidden = true;
  const team = teamSortiert();
  $("#ansicht").innerHTML = `<div class="willkommen"><img src="/static/img/logo.png" alt="TurnierPro"><h1>Willkommen in der TurnierPro-App</h1>
    <p>Wer arbeitet an diesem Mac? Das wählst du nur einmal. Deine Kontakte, Aufgaben und Kommentare werden dir zugeordnet.</p>
    <div class="karte">${team.length ? `<div class="wahl">${team.map((t) => `<button data-a="binIch" data-id="${esc(t.id)}">${avatar(t.id, true)}${esc(t.name)}</button>`).join("")}</div><div class="abschnitt-titel" style="margin-top:20px">Oder neu anlegen</div>` : ""}
      <form id="ich-neu" class="filterleiste" style="margin:0"><input id="in-name" type="text" placeholder="Dein Name, z. B. Max Steiner" style="flex:1" autofocus><button class="knopf haupt" type="submit">Weiter</button></form></div>
    ${S.start?.daten_hinweis ? `<div class="banner warn" style="margin-top:18px;text-align:left">${ikon("warn")}<span>${esc(S.start.daten_hinweis)}</span></div>` : ""}
    <p class="leise klein" style="margin-top:18px">Gemeinsamer Datenordner: ${esc(S.start?.daten_ordner || "")}</p></div>`;
}
async function setzeIch(id) {
  await api("/api/ich", { json: { mitglied: id } });
  S.start = await api("/api/start");
  await ladeDaten();
}

/* ── Globale Suche (⌘K) ──────────────────────────────────────────────── */
let trefferListe = [], trefferIndex = 0;
function oeffneSuche() {
  schliesse();
  $("#ebene").innerHTML = `<div class="schleier" data-a="schliessen"></div><div class="dialog suche" role="dialog" aria-modal="true" aria-label="Suche"><div class="suche-feld">${ikon("suche")}<input id="suche-q" type="search" placeholder="Vereine, Personen, Aufgaben, Projekte …" autocomplete="off"><span class="taste">esc</span></div><div class="suche-ergebnis" id="suche-ergebnis"></div></div>`;
  blatt.offen = { art: "suche" };
  setTimeout(() => $("#suche-q").focus(), 20);
  suche("");
}
function suche(q) {
  q = q.trim().toLowerCase();
  const passt = (...f) => !q || f.some((x) => x && String(x).toLowerCase().includes(q));
  trefferListe = [];
  for (const v of S.d.vereine) if (passt(v.name, v.ort, v.person, v.veranstaltung, v.email, v.telefon)) trefferListe.push({ art: "Verein", titel: v.name, unter: [v.person, v.ort, v.status].filter(Boolean).join(" · "), a: "verein", id: v.id });
  for (const t of S.d.aufgaben) if (!t.erledigt && passt(t.titel, t.notizen)) trefferListe.push({ art: "Aufgabe", titel: t.titel, unter: t.faellig ? "bis " + t.faellig.split("-").reverse().join(".") : "", a: "aufgabe", id: t.id });
  for (const p of S.d.projekte) if (passt(p.titel, p.notizen)) trefferListe.push({ art: "Projekt", titel: p.titel, unter: p.status || "", a: "projekt", id: p.id });
  if (!q) trefferListe = [
    { art: "Aktion", titel: "Kontakt erfassen", unter: "Anruf, Mail oder Gespräch protokollieren", a: "kontaktNeu" },
    { art: "Gehe zu", titel: "Wiedervorlagen", unter: `${faelligeVereine().length} fällig`, a: "geheZu", v: "vertrieb/wiedervorlagen" },
    { art: "Gehe zu", titel: "Monatsabschluss", unter: "Belege, KI-Prüfung, Steuerberater-Paket", a: "geheZu", v: "finanzen/abschluss" },
    { art: "Gehe zu", titel: "Aufgaben", unter: "", a: "geheZu", v: "aufgaben" },
    ...trefferListe.slice(0, 0)];
  trefferListe = trefferListe.slice(0, 40);
  trefferIndex = 0;
  zeigeTreffer();
}
function zeigeTreffer() {
  const box = $("#suche-ergebnis"); if (!box) return;
  box.innerHTML = trefferListe.length ? trefferListe.map((t, i) => `<button class="treffer${i === trefferIndex ? " aktiv" : ""}" data-a="trefferWahl" data-i="${i}"><span class="art">${esc(t.art)}</span><span><b>${esc(t.titel)}</b>${t.unter ? `<br><span>${esc(t.unter)}</span>` : ""}</span></button>`).join("") : '<div class="leer klein">Nichts gefunden.</div>';
  box.querySelector(".aktiv")?.scrollIntoView({ block: "nearest" });
}
function waehleTreffer(i) {
  const t = trefferListe[i]; if (!t) return;
  schliesse();
  const el = document.createElement("span"); el.dataset.id = t.id || ""; el.dataset.v = t.v || "";
  aktionen[t.a]?.(el, neuZeichnen, { target: el });
}

/* ── Export ──────────────────────────────────────────────────────────── */
function exportMenue(knopf, bereich) {
  menue(knopf, [
    { href: `/api/export/${bereich}.pdf`, text: "Als PDF speichern", ikon: "doc" },
    { href: `/api/export/${bereich}.xlsx`, text: "Als Excel speichern", ikon: "tabelle" },
    { a: "drucken", text: "Drucken", ikon: "drucken" },
  ]);
}

/* ── Ereignisse ──────────────────────────────────────────────────────── */
Object.assign(aktionen, {
  schliessen: () => schliesse(),
  geheZu: (el) => { schliesse(); location.hash = "#/" + el.dataset.v; },
  werBinIch: () => { location.hash = "#/einstellungen/allgemein"; },
  binIch: async (el) => { try { await setzeIch(el.dataset.id); melde("Willkommen!"); } catch (e) { fehler(e); } },
  exportMenue: (el) => exportMenue(el, el.dataset.v),
  drucken: () => { schliesseMenue(); window.print(); },
  trefferWahl: (el) => waehleTreffer(Number(el.dataset.i)),
  neuLaden: () => location.reload(),
});
absenden["ich-neu"] = async () => {
  const n = $("#in-name").value.trim();
  if (!n) return melde("Bitte deinen Namen eintragen.", "fehler");
  try { const vorhanden = S.d.team.find((t) => String(t.name).toLowerCase() === n.toLowerCase()); const id = vorhanden ? vorhanden.id : await neu("team", { name: n }); await setzeIch(id); melde("Willkommen, " + n.split(" ")[0] + "!"); }
  catch (e) { fehler(e); }
};
eingaben["suche-q"] = (el) => suche(el.value);

document.addEventListener("click", (e) => {
  if (!e.target.closest("#menue") && !e.target.closest('[data-a="exportMenue"]')) schliesseMenue();
  const t = e.target.closest("[data-a]");
  if (!t) return;
  const fn = aktionen[t.dataset.a];
  if (!fn) return;
  if (t.tagName === "A" && t.getAttribute("href")) return;
  if (t.type !== "checkbox") e.preventDefault();
  Promise.resolve(fn(t, neuZeichnen, e)).catch(fehler);
});
document.addEventListener("submit", (e) => {
  const fn = absenden[e.target.id];
  if (!fn) return;
  e.preventDefault();
  Promise.resolve(fn(e.target, neuZeichnen)).catch(fehler);
});
const findeHandler = (tabelle, id) => tabelle[id] || Object.entries(tabelle).find(([k]) => k.endsWith("-") && id.startsWith(k))?.[1];
document.addEventListener("change", (e) => {
  const id = e.target.id; if (!id) return;
  const fn = findeHandler(aenderungen, id);
  if (fn) Promise.resolve(fn(e.target, neuZeichnen)).catch(fehler);
});
document.addEventListener("input", (e) => {
  const id = e.target.id; if (!id) return;
  const fn = eingaben[id];
  if (fn) fn(e.target, neuZeichnen);
});
document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); oeffneSuche(); return; }
  if (e.key === "Escape") { schliesseMenue(); if ($("#ebene").innerHTML) { schliesse(); return; } }
  if (blatt.offen?.art === "suche") {
    if (e.key === "ArrowDown") { e.preventDefault(); trefferIndex = Math.min(trefferListe.length - 1, trefferIndex + 1); zeigeTreffer(); }
    if (e.key === "ArrowUp") { e.preventDefault(); trefferIndex = Math.max(0, trefferIndex - 1); zeigeTreffer(); }
    if (e.key === "Enter") { e.preventDefault(); waehleTreffer(trefferIndex); }
    return;
  }
  // Schnelltaste N: neuer Kontakt (nur wenn nicht gerade getippt wird)
  const tippt = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || "");
  if (!tippt && !$("#ebene").innerHTML && e.key.toLowerCase() === "n" && !e.metaKey && !e.ctrlKey) { e.preventDefault(); aktionen.kontaktNeu?.(); }
});

/* ── Start ───────────────────────────────────────────────────────────── */
beiAenderung((art) => { if (art === "leise") zeichneSync(); else zeichne(); });
(async function startApp() {
  leseRoute();
  zeichneNav();
  try {
    [S.start, S.konfig] = await Promise.all([api("/api/start"), api("/api/config")]);
    await ladeDaten();
    starteAbgleich();
  } catch (e) {
    S.fehler = e.message;
    $("#ansicht").innerHTML = `<div class="karte leer"><h2>Die App kann nicht starten</h2><p>${esc(e.message)}</p><button class="knopf haupt" style="margin-top:14px" data-a="neuLaden">Neu laden</button></div>`;
    zeichneSync();
  }
  // Schnell-Suche in der Kopfzeile anbieten
  const sk = document.createElement("button");
  sk.className = "suche-knopf"; sk.type = "button"; sk.dataset.a = "sucheOeffnen";
  sk.innerHTML = `${ikon("suche")}<span class="text">Suchen …</span><span class="taste">⌘K</span>`;
  $(".kopf-zeile").insertBefore(sk, $("#kopf-aktionen"));
  aktionen.sucheOeffnen = oeffneSuche;
})();
