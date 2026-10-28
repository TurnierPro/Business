// Aufgaben: zuweisen, Fälligkeit, Wiederholung, Priorität. Auf der Startseite als Kachel.
import {
  S, X, $, esc, num, ikon, gv, HEUTE, plusTage, tageBis, wochentag, datum, datumKurz, merk,
  neu, aendere, loesche, melde, fehler, frage, oeffneBlatt, schliesse, blattKopf,
  person, teamSortiert, teamOptionen, optionen, name, aktionen, absenden, aenderungen, eingaben,
} from "./kern.js";
import { WIEDERHOLUNG, wdhText, aufgabeZustand } from "./stammdaten.js";

const A = { wer: merk.get("a_wer", "ich"), erledigte: false, entwurf: { titel: "", wer: null, faellig: "", wdh: "", prio: "" } };
const GRUPPEN = [["ueber", "Überfällig"], ["heute", "Heute"], ["woche", "Diese Woche"], ["spaeter", "Später"], ["ohne", "Ohne Datum"]];

export function naechsteFaelligkeit(f, r) {
  if (r === "daily") return plusTage(f, 1);
  if (r === "weekdays") { let n = plusTage(f, 1); while ([0, 6].includes(wochentag(n))) n = plusTage(n, 1); return n; }
  if (r === "weekly") return plusTage(f, 7);
  if (r === "biweekly") return plusTage(f, 14);
  const m = { monthly: 1, quarterly: 3, yearly: 12 }[r] || 1;
  const d = new Date(f + "T12:00:00Z"), y = d.getUTCFullYear(), mo = d.getUTCMonth() + m;
  const letzter = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, mo, Math.min(d.getUTCDate(), letzter), 12)).toISOString().slice(0, 10);
}

function faelligPille(t) {
  if (t.erledigt) return t.erledigtAm ? `<span>erledigt ${esc(datum(t.erledigtAm))}</span>` : "";
  const z = aufgabeZustand(t);
  if (z === "ohne") return "<span>ohne Datum</span>";
  const d = tageBis(t.faellig, HEUTE);
  if (z === "ueber") return `<span class="pille rot">${-d} ${d === -1 ? "Tag" : "Tage"} überfällig</span>`;
  if (z === "heute") return '<span class="pille amber">Heute</span>';
  return `<span class="pille ${z === "woche" ? "blau" : ""}">${esc(datumKurz(t.faellig))}</span>`;
}
export function aufgabeZeile(t, { mitPerson = true } = {}) {
  return `<div class="aufgabe${t.erledigt ? " erledigt" : ""}"><input type="checkbox" data-a="aufgabeHaken" data-id="${esc(t.id)}"${t.erledigt ? " checked" : ""} aria-label="Erledigt: ${esc(t.titel)}">
    <div class="haupt-text" data-a="aufgabe" data-id="${esc(t.id)}"><div class="titel">${esc(t.titel)}</div>
    ${t.notizen ? `<div class="text">${esc(String(t.notizen).slice(0, 120))}</div>` : ""}
    <div class="meta">${faelligPille(t)}${t.prio === "high" ? '<span class="pille rot ohne-punkt">Prio hoch</span>' : ""}${mitPerson ? person(t.zustaendig, "Nicht zugewiesen") : ""}${t.wdh ? `<span>${ikon("wdh", "i-s")} ${esc(wdhText(t.wdh))}</span>` : ""}</div></div></div>`;
}

const wer = () => (A.wer === "ich" ? S.start?.ich || "all" : A.wer);
const sortiere = (l) => l.sort((a, b) => (a.faellig || "9999").localeCompare(b.faellig || "9999") || ((b.prio === "high") - (a.prio === "high")) || num(a.angelegt) - num(b.angelegt));

function gruppiert(offen) {
  let h = "";
  GRUPPEN.forEach(([z, t]) => { const l = offen.filter((x) => aufgabeZustand(x) === z); if (l.length) h += `<div class="gruppe-kopf ${z === "ueber" ? "rot" : ""}">${t} · ${l.length}</div>${l.map((x) => aufgabeZeile(x)).join("")}`; });
  return h;
}

function schnellFormular() {
  const d = A.entwurf, w = d.wer === null ? S.start?.ich || "" : d.wer;
  return `<form id="aufgabe-neu" class="schnell"><label class="f">Neue Aufgabe<input id="an-titel" type="text" placeholder="Was ist zu tun?" value="${esc(d.titel)}" autocomplete="off"></label>
    <label class="f">Zuweisen an<select id="an-wer">${teamOptionen(w)}</select></label>
    <label class="f">Erledigt bis<input id="an-faellig" type="date" value="${esc(d.faellig)}"></label>
    <label class="f">Wiederholung<select id="an-wdh">${optionen(WIEDERHOLUNG, d.wdh)}</select></label>
    <button class="knopf haupt" type="submit">${ikon("plus")}Hinzufügen</button></form>`;
}

export function reiter() { return []; }
export function ansicht() {
  const w = wer();
  const sichtbar = S.d.aufgaben.filter((t) => w === "all" || t.zustaendig === w);
  const offen = sortiere(sichtbar.filter((t) => !t.erledigt));
  const erledigt = sichtbar.filter((t) => t.erledigt).sort((a, b) => String(b.erledigtAm || "").localeCompare(String(a.erledigtAm || "")));
  const anz = (z) => offen.filter((t) => aufgabeZustand(t) === z).length;
  const chips = [["ich", "Meine"], ["all", "Alle"], ...teamSortiert().filter((t) => t.id !== S.start?.ich).map((t) => [t.id, t.name])]
    .map(([id, l]) => `<button type="button" class="chip" data-a="aufgabenWer" data-v="${esc(id)}" aria-pressed="${A.wer === id}">${esc(l)}</button>`).join("");
  let h = `<section class="karte" style="margin-bottom:16px">${schnellFormular()}</section>
    <div class="filterleiste"><div class="chips">${chips}</div><span class="wachsen"></span>
    ${anz("ueber") ? `<span class="pille rot">${anz("ueber")} überfällig</span>` : ""}${anz("heute") ? `<span class="pille amber">${anz("heute")} heute</span>` : ""}<span class="pille ohne-punkt">${offen.length} offen</span></div>`;
  h += `<section class="karte">`;
  if (!S.d.aufgaben.length) h += `<div class="leer"><h2>Noch keine Aufgaben</h2>Trage oben die erste Aufgabe ein und weise sie jemandem zu.</div>`;
  else if (!offen.length) h += `<div class="leer klein">${ikon("haken")} Alles erledigt.</div>`;
  else h += gruppiert(offen);
  if (erledigt.length) h += `${A.erledigte ? `<div class="gruppe-kopf" style="margin-top:22px">Erledigt</div>${erledigt.slice(0, 50).map((x) => aufgabeZeile(x)).join("")}` : ""}
    <div style="margin-top:12px"><button class="link" data-a="erledigteZeigen">${A.erledigte ? "Erledigte ausblenden" : `Erledigte anzeigen (${erledigt.length})`}</button></div>`;
  h += `</section>`;
  return { titel: "Aufgaben", aktionen: `<button class="knopf" data-a="exportMenue" data-v="aufgaben">${ikon("export")}<span class="text">Export</span></button>`, html: h };
}

/** Kachel für die Startseite: meine offenen Aufgaben */
export function kachel() {
  const ich = S.start?.ich;
  const meine = sortiere(S.d.aufgaben.filter((t) => !t.erledigt && (!ich || t.zustaendig === ich)));
  const zeigen = meine.slice(0, 6);
  return `<section class="karte"><div class="karte-kopf"><h2>${ich ? "Meine Aufgaben" : "Offene Aufgaben"}</h2>
    ${meine.length ? `<span class="pille ohne-punkt">${meine.length} offen</span>` : ""}<button class="link" data-a="geheZu" data-v="aufgaben">Alle</button></div>
    <form id="aufgabe-schnell" class="filterleiste" style="margin-bottom:6px"><input id="as-titel" type="text" placeholder="Neue Aufgabe für mich … (Enter)" autocomplete="off" style="flex:1"><input id="as-faellig" type="date" style="width:150px" aria-label="Erledigt bis"></form>
    ${zeigen.length ? zeigen.map((t) => aufgabeZeile(t, { mitPerson: !ich })).join("") : '<div class="leer klein">Keine offenen Aufgaben. Stark!</div>'}
    ${meine.length > zeigen.length ? `<div style="margin-top:10px"><button class="link" data-a="geheZu" data-v="aufgaben">+ ${meine.length - zeigen.length} weitere</button></div>` : ""}</section>`;
}

function oeffneAufgabe(id) {
  const t = S.d.aufgaben.find((x) => x.id === id);
  if (!t) return;
  oeffneBlatt(`<form id="aufgabe-form" data-id="${esc(t.id)}">${blattKopf("Aufgabe", t.angelegtVon ? `Angelegt von ${esc(name(t.angelegtVon))}` : "")}
    <div class="blatt-inhalt"><div class="fg">
      <label class="f ganz">Aufgabe<input id="ae-titel" type="text" value="${esc(t.titel)}"></label>
      <label class="f ganz">Notizen<textarea id="ae-notizen">${esc(t.notizen || "")}</textarea></label>
      <label class="f">Zugewiesen an<select id="ae-wer">${teamOptionen(t.zustaendig || "")}</select></label>
      <label class="f">Erledigt bis<input id="ae-faellig" type="date" value="${esc(t.faellig || "")}"></label>
      <label class="f">Wiederholung<select id="ae-wdh">${optionen(WIEDERHOLUNG, t.wdh || "")}</select></label>
      <label class="f">Priorität<select id="ae-prio">${optionen([["", "Normal"], ["high", "Hoch"]], t.prio || "")}</select></label>
    </div>
    ${t.anzahlErledigt ? `<p class="leise klein" style="margin-top:14px">Bisher ${t.anzahlErledigt}× erledigt${t.zuletztErledigt ? `, zuletzt am ${esc(datum(t.zuletztErledigt))}` : ""}.</p>` : ""}
    <p class="leise klein" style="margin-top:14px">Bei wiederkehrenden Aufgaben springt das Datum nach dem Abhaken automatisch zum nächsten Termin.</p></div>
    <div class="blatt-fuss"><button type="button" class="knopf gefahr" data-a="aufgabeLoeschen" data-id="${esc(t.id)}">${ikon("muell")}Löschen</button><span class="fehler-text wachsen" id="ae-fehler"></span>
      <button type="button" class="knopf" data-a="schliessen">Abbrechen</button><button type="submit" class="knopf haupt">Speichern</button></div></form>`, { art: "aufgabe", id });
}

async function anlegen(titel, w, faellig, wdh, prio = "") {
  if (!titel) return melde("Bitte zuerst die Aufgabe eintragen", "fehler"), false;
  if (wdh && !faellig) return melde("Für wiederkehrende Aufgaben bitte „Erledigt bis“ wählen", "fehler"), false;
  try { await neu("aufgaben", { titel, notizen: "", zustaendig: w, faellig, wdh, prio, erledigt: false }); melde("Aufgabe hinzugefügt"); return true; }
  catch (e) { fehler(e); return false; }
}

Object.assign(aktionen, {
  aufgabe: (el) => oeffneAufgabe(el.dataset.id),
  aufgabenWer: (el, neuZeichnen) => { A.wer = el.dataset.v; merk.set("a_wer", A.wer); neuZeichnen(); },
  erledigteZeigen: (el, neuZeichnen) => { A.erledigte = !A.erledigte; neuZeichnen(); },
  aufgabeHaken: async (el) => {
    const t = S.d.aufgaben.find((x) => x.id === el.dataset.id); if (!t) return;
    try {
      if (t.erledigt) { await aendere("aufgaben", t.id, { erledigt: false, erledigtAm: null, erledigtVon: null }); melde("Wieder geöffnet"); }
      else if (t.wdh && t.faellig) {
        let n = naechsteFaelligkeit(t.faellig, t.wdh); while (n < HEUTE) n = naechsteFaelligkeit(n, t.wdh);
        await aendere("aufgaben", t.id, { faellig: n, zuletztErledigt: HEUTE, zuletztVon: S.start?.ich || "", anzahlErledigt: num(t.anzahlErledigt) + 1 });
        melde("Erledigt. Nächste Fälligkeit: " + datum(n));
      } else { await aendere("aufgaben", t.id, { erledigt: true, erledigtAm: HEUTE, erledigtVon: S.start?.ich || "" }); melde("Aufgabe erledigt"); }
    } catch (e) { fehler(e); }
  },
  aufgabeLoeschen: async (el) => {
    if (!(await frage("Aufgabe löschen?", "Die Aufgabe wird für alle gelöscht."))) return;
    try { await loesche("aufgaben", el.dataset.id); schliesse(); melde("Aufgabe gelöscht"); } catch (e) { fehler(e); }
  },
});
Object.assign(absenden, {
  "aufgabe-neu": async () => {
    const d = A.entwurf, w = d.wer === null ? S.start?.ich || "" : d.wer, alt = { ...d };
    A.entwurf = { titel: "", wer: w, faellig: "", wdh: "", prio: "" };  // vor dem Speichern leeren, sonst bleibt der Text stehen
    if (!(await anlegen(gv("an-titel"), w, gv("an-faellig"), gv("an-wdh")))) A.entwurf = alt;
  },
  "aufgabe-schnell": async () => { if (await anlegen(gv("as-titel"), S.start?.ich || "", gv("as-faellig"), "")) { /* Liste lädt neu */ } },
  "aufgabe-form": async (form) => {
    const id = form.dataset.id, f = (m) => { $("#ae-fehler").textContent = m; };
    const titel = gv("ae-titel"), faellig = gv("ae-faellig"), wdh = gv("ae-wdh");
    if (!titel) return f("Bitte die Aufgabe eintragen.");
    if (wdh && !faellig) return f("Für wiederkehrende Aufgaben bitte „Erledigt bis“ wählen.");
    try { await aendere("aufgaben", id, { titel, notizen: gv("ae-notizen"), zustaendig: gv("ae-wer"), faellig, wdh, prio: gv("ae-prio") }); schliesse(); melde("Gespeichert"); }
    catch (e) { f(e.message); }
  },
});
eingaben["an-titel"] = (el) => { A.entwurf.titel = el.value; };
Object.assign(aenderungen, {
  "an-wer": (el) => { A.entwurf.wer = el.value; },
  "an-faellig": (el) => { A.entwurf.faellig = el.value; },
  "an-wdh": (el) => { A.entwurf.wdh = el.value; },
});
