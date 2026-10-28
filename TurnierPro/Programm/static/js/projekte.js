// Projekte: Ideen und Vorhaben als Tafel (Idee → Geplant → In Arbeit → Erledigt), mit Kommentaren.
import {
  S, X, $, esc, num, ikon, gv, datumZeit, neu, aendere, schreibe, loesche, melde, fehler, frage,
  oeffneBlatt, erneuereBlatt, schliesse, blatt, blattKopf, person, teamSortiert, optionen, name, aktionen, absenden,
} from "./kern.js";
import { PROJEKT_STATUS, PRIOS } from "./stammdaten.js";

const P = { entwurf: { titel: "", status: "Idee", prio: "normal" } };
const RANG = { hoch: 0, normal: 1, niedrig: 2 };
const verantwortlich = (p) => (Array.isArray(p.verantwortlich) ? p.verantwortlich : []);
const kommentare = (id) => X.kommVonProjekt[id] || [];
const statusVon = (p) => (PROJEKT_STATUS.includes(p.status) ? p.status : "Idee");

export function reiter() { return []; }
export function ansicht() {
  const d = P.entwurf;
  let h = `<section class="karte" style="margin-bottom:18px"><form id="projekt-neu" class="schnell">
    <label class="f">Neue Idee oder neues Projekt<input id="pn-titel" type="text" placeholder="Worum geht es?" value="${esc(d.titel)}" autocomplete="off"></label>
    <label class="f">Status<select id="pn-status">${optionen(PROJEKT_STATUS, d.status)}</select></label>
    <label class="f">Priorität<select id="pn-prio">${optionen(PRIOS, d.prio)}</select></label>
    <label class="f">Verantwortlich<select id="pn-wer">${optionen(teamSortiert().map((t) => [t.id, t.name]), S.start?.ich || "", "Nicht zugewiesen")}</select></label>
    <button class="knopf haupt" type="submit">${ikon("plus")}Hinzufügen</button></form></section>`;
  h += `<div class="tafel">${PROJEKT_STATUS.map((st) => {
    const l = S.d.projekte.filter((p) => statusVon(p) === st).sort((a, b) => (RANG[a.prio || "normal"] - RANG[b.prio || "normal"]) || num(a.angelegt) - num(b.angelegt));
    return `<section class="spalte" data-spalte="${esc(st)}"><div class="spalte-kopf"><h2>${esc(st)}</h2><span class="anz">${l.length}</span></div>
      ${l.map(karte).join("") || '<div class="leer klein">Hierher ziehen</div>'}</section>`;
  }).join("")}</div>`;
  return { titel: "Projekte", aktionen: `<button class="knopf" data-a="exportMenue" data-v="projekte">${ikon("export")}<span class="text">Export</span></button>`, html: h };
}
function karte(p) {
  const n = kommentare(p.id).length, i = PROJEKT_STATUS.indexOf(statusVon(p));
  return `<article class="pkarte" draggable="true" data-projekt="${esc(p.id)}" data-a="projekt" data-id="${esc(p.id)}">
    <div class="titel">${esc(p.titel)}</div>${p.notizen ? `<div class="text">${esc(p.notizen)}</div>` : ""}
    <div class="meta">${p.prio === "hoch" ? '<span class="prio hoch">Hoch</span>' : p.prio === "niedrig" ? '<span class="prio niedrig">Niedrig</span>' : ""}
      ${verantwortlich(p).map((id) => person(id, "")).join(" ")}${n ? `<span>${n} ${n === 1 ? "Kommentar" : "Kommentare"}</span>` : ""}
      <span class="rechts">${i > 0 ? `<button class="ikon-knopf" style="width:26px;height:26px" data-a="projektSchieben" data-id="${esc(p.id)}" data-v="-1" aria-label="Eine Spalte zurück" title="Zurück">${ikon("links", "i-s")}</button>` : ""}${i < 3 ? `<button class="ikon-knopf" style="width:26px;height:26px" data-a="projektSchieben" data-id="${esc(p.id)}" data-v="1" aria-label="Eine Spalte weiter" title="Weiter">${ikon("rechts", "i-s")}</button>` : ""}</span></div></article>`;
}

/* Ziehen und Ablegen zwischen den Spalten */
document.addEventListener("dragstart", (e) => { const k = e.target.closest?.(".pkarte"); if (!k) return; e.dataTransfer.setData("text/plain", k.dataset.projekt); e.dataTransfer.effectAllowed = "move"; k.classList.add("zieht"); });
document.addEventListener("dragend", (e) => { const k = e.target.closest?.(".pkarte"); if (k) k.classList.remove("zieht"); document.querySelectorAll(".spalte.ziel-aktiv").forEach((s) => s.classList.remove("ziel-aktiv")); });
document.addEventListener("dragover", (e) => { const s = e.target.closest?.(".spalte"); if (!s) return; e.preventDefault(); document.querySelectorAll(".spalte.ziel-aktiv").forEach((x) => x !== s && x.classList.remove("ziel-aktiv")); s.classList.add("ziel-aktiv"); });
document.addEventListener("drop", async (e) => {
  const s = e.target.closest?.(".spalte"); if (!s) return;
  e.preventDefault(); s.classList.remove("ziel-aktiv");
  const id = e.dataTransfer.getData("text/plain"), p = S.d.projekte.find((x) => x.id === id);
  if (!p || statusVon(p) === s.dataset.spalte) return;
  try { await aendere("projekte", id, { status: s.dataset.spalte }); melde(`„${p.titel}“ → ${s.dataset.spalte}`); } catch (x) { fehler(x); }
});

function kommentarListe(id) {
  const l = kommentare(id);
  return l.length ? l.map((c) => `<div class="kommentar"><div class="kopf-z">${person(c.von, "Unbekannt")}<span>${esc(datumZeit(num(c.zeit)))}</span>${c.von && c.von === S.start?.ich ? `<button type="button" class="link leise" data-a="kommentarLoeschen" data-id="${esc(c.id)}">Löschen</button>` : ""}</div><p>${esc(c.text)}</p></div>`).join("") : '<p class="leise">Noch keine Kommentare.</p>';
}
function blattHtml(p) {
  const v = verantwortlich(p);
  return `<form id="projekt-form" data-id="${esc(p.id)}">${blattKopf("Projekt", p.angelegtVon ? `Angelegt von ${esc(name(p.angelegtVon))}` : "")}
    <div class="blatt-inhalt"><div class="fg">
      <label class="f ganz">Titel<input id="pe-titel" type="text" value="${esc(p.titel)}"></label>
      <label class="f ganz">Beschreibung / Notizen<textarea id="pe-notizen" rows="6">${esc(p.notizen || "")}</textarea></label>
      <label class="f">Status<select id="pe-status">${optionen(PROJEKT_STATUS, statusVon(p))}</select></label>
      <label class="f">Priorität<select id="pe-prio">${optionen(PRIOS, p.prio || "normal")}</select></label>
      <div class="f ganz">Verantwortlich<div class="chips">${teamSortiert().map((t) => `<label class="check" style="margin-right:12px"><input type="checkbox" data-verantw="${esc(t.id)}"${v.includes(t.id) ? " checked" : ""}>${esc(t.name)}</label>`).join("") || '<span class="leise">Noch kein Team angelegt.</span>'}</div></div>
    </div>
    <div class="gruppe" style="margin-top:26px"><div class="gruppe-titel">Aktueller Stand / Kommentare</div>
      <div id="kommentare">${kommentarListe(p.id)}</div>
      <textarea id="pk-text" placeholder="Aktuellen Stand eintragen … (⌘ + Enter zum Senden)"></textarea>
      <div style="margin-top:8px"><button type="button" class="knopf klein" data-a="kommentieren">Kommentieren</button></div></div></div>
    <div class="blatt-fuss"><button type="button" class="knopf gefahr" data-a="projektLoeschen" data-id="${esc(p.id)}">${ikon("muell")}Löschen</button><span class="fehler-text wachsen" id="pe-fehler"></span>
      <button type="button" class="knopf" data-a="schliessen">Abbrechen</button><button type="submit" class="knopf haupt">Speichern</button></div></form>`;
}
export function erneuere() {
  if (blatt.offen?.art !== "projekt") return;
  const box = $("#kommentare");
  if (box) box.innerHTML = kommentarListe(blatt.offen.id);
}

async function kommentieren() {
  const id = blatt.offen?.id, e = $("#pk-text"), text = e ? e.value.trim() : "";
  if (!id) return;
  if (!text) return melde("Bitte einen Kommentar eintragen", "fehler");
  try { await neu("kommentare", { projektId: id, text, von: S.start?.ich || "", zeit: Date.now() }); e.value = ""; melde("Kommentar gespeichert"); } catch (x) { fehler(x); }
}
document.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && e.target.id === "pk-text") { e.preventDefault(); kommentieren(); } });

Object.assign(aktionen, {
  projekt: (el, _n, ev) => { if (ev.target.closest("[data-a='projektSchieben']")) return; const p = S.d.projekte.find((x) => x.id === el.dataset.id); if (p) oeffneBlatt(blattHtml(p), { art: "projekt", id: p.id }); },
  projektSchieben: async (el) => {
    const p = S.d.projekte.find((x) => x.id === el.dataset.id); if (!p) return;
    const ziel = PROJEKT_STATUS[PROJEKT_STATUS.indexOf(statusVon(p)) + Number(el.dataset.v)];
    if (ziel) try { await aendere("projekte", p.id, { status: ziel }); } catch (x) { fehler(x); }
  },
  kommentieren,
  kommentarLoeschen: async (el) => { try { await loesche("kommentare", el.dataset.id); melde("Kommentar gelöscht"); } catch (x) { fehler(x); } },
  projektLoeschen: async (el) => {
    const id = el.dataset.id, l = kommentare(id);
    if (!(await frage("Projekt löschen?", `Das Projekt${l.length ? ` und ${l.length} Kommentare` : ""} werden für alle gelöscht.`))) return;
    try { await schreibe([...l.map((c) => ({ k: "kommentare", a: "del", id: c.id })), { k: "projekte", a: "del", id }]); schliesse(); melde("Projekt gelöscht"); } catch (x) { fehler(x); }
  },
});
Object.assign(absenden, {
  "projekt-neu": async () => {
    const titel = gv("pn-titel");
    if (!titel) return melde("Bitte zuerst einen Titel eintragen", "fehler");
    const wer = gv("pn-wer"), status = gv("pn-status") || "Idee", prio = gv("pn-prio") || "normal";
    P.entwurf = { titel: "", status, prio: "normal" };
    try { await neu("projekte", { titel, notizen: "", status, prio, verantwortlich: wer ? [wer] : [] }); melde("Hinzugefügt"); }
    catch (x) { P.entwurf.titel = titel; fehler(x); }
  },
  "projekt-form": async (form) => {
    const titel = gv("pe-titel");
    if (!titel) { $("#pe-fehler").textContent = "Bitte einen Titel eintragen."; return; }
    const v = [...form.querySelectorAll("input[data-verantw]:checked")].map((e) => e.dataset.verantw);
    try { await aendere("projekte", form.dataset.id, { titel, notizen: gv("pe-notizen"), status: gv("pe-status"), prio: gv("pe-prio"), verantwortlich: v }); schliesse(); melde("Gespeichert"); }
    catch (x) { $("#pe-fehler").textContent = x.message; }
  },
});
