// Einstellungen: dieser Mac, Team, Zugänge (Claude, Stripe, Qonto, Postfach), Automatik, Import & Export.
import {
  S, X, $, esc, num, ikon, gv, api, vorZeit, datumZeit, neu, aendere, loesche, schreibe, melde, fehler, frage, arbeit,
  ladeDaten, teamSortiert, optionen, avatar, aktionen, absenden, aenderungen,
} from "./kern.js";

const E = { mail: null, auto: null, ordnerListe: [], importErgebnis: null, importDatei: null, importArt: "artefakt" };

export function reiter() {
  return [["allgemein", "Allgemein"], ["team", "Team"], ["zugaenge", "Zugänge"], ["automatik", "Automatik"], ["import", "Import & Export"]];
}
export function ansicht(unter, neuZeichnen) {
  unter = unter || "allgemein";
  const html = { team, zugaenge: () => zugaenge(neuZeichnen), automatik: () => automatik(neuZeichnen), import: importExport }[unter] || allgemein;
  return { titel: "Einstellungen", aktionen: "", html: `<section class="karte">${html()}</section>` };
}
const block = (titel, text, inhalt) => `<div class="einst"><div class="beschreibung"><h2>${titel}</h2><p>${text}</p></div><div>${inhalt}</div></div>`;

/* ── Allgemein ───────────────────────────────────────────────────────── */
function allgemein() {
  const st = S.start || {};
  const geraete = S.geraete.map((g) => {
    const on = Date.now() - num(g.zuletzt) < 3 * 60000;
    return `<div class="status-zeile"><span class="punkt ${on ? "ok" : ""}"></span><div class="wachsen"><b>${esc(g.name)}</b>${g.dieser ? ' <span class="pille gruen">dieser Mac</span>' : ""}<div class="unter">${X.team[g.mitglied] ? "Arbeitet als " + esc(X.team[g.mitglied].name) : "Noch keine Person gewählt"}</div></div><span class="leise klein">${on ? "gerade aktiv" : "zuletzt " + vorZeit(num(g.zuletzt))}</span></div>`;
  }).join("");
  return block("Wer arbeitet an diesem Mac?", "Neue Kontakte, Aufgaben und Kommentare werden dieser Person zugeordnet.",
      `<div class="fg"><label class="f">Ich bin<select id="e-ich">${optionen(teamSortiert().map((t) => [t.id, t.name]), st.ich || "", "Bitte wählen")}</select></label>
       <label class="f">Name dieses Macs<input id="e-geraet" type="text" value="${esc(st.geraet?.name || "")}" placeholder="z. B. MacBook Max"></label></div>`)
    + block("Gemeinsamer Datenordner", "Vertrieb, Aufgaben, Projekte und Team liegen hier. Auf beiden Macs muss derselbe iCloud-Ordner eingestellt sein. Jeder Mac schreibt nur in seine eigene Datei, so gibt es keine Konflikte.",
      `<div class="pfad">${esc(st.daten_ordner || "")}</div>
       <div class="filterleiste" style="margin-top:10px"><input id="e-ordner" type="text" placeholder="Anderen Ordner: /Users/…/Library/Mobile Documents/com~apple~CloudDocs/…" style="flex:1"><button class="knopf" data-a="ordnerSpeichern">Ordner ändern</button></div>
       ${S.icloud.length ? `<div class="banner warn">${ikon("sync")}<span>iCloud lädt noch ${S.icloud.length} ${S.icloud.length === 1 ? "Datei" : "Dateien"} vom anderen Mac herunter. Die Daten erscheinen gleich.</span></div>` : ""}`)
    + block("Verbundene Macs", "Alle Macs, die diesen Datenordner nutzen. Grün heißt: in den letzten Minuten aktiv.", `<div class="status-liste">${geraete || '<p class="leise">Noch kein Mac gemeldet.</p>'}</div>`)
    + block("Über die App", "", `<p>TurnierPro Unternehmens-App · Version ${esc(st.version || "")}</p><p class="leise klein" style="margin-top:4px">${esc(st.firmenname || "")}</p>`);
}

/* ── Team ────────────────────────────────────────────────────────────── */
function team() {
  const zeilen = teamSortiert().map((t) => {
    const n = S.d.aktivitaeten.filter((a) => a.von === t.id).length + S.d.vereine.filter((v) => v.betreuer === t.id).length + S.d.aufgaben.filter((a) => a.zustaendig === t.id).length;
    const mac = S.geraete.filter((g) => g.mitglied === t.id).map((g) => g.name);
    return `<div class="team-zeile">${avatar(t.id, true)}<input type="text" id="tm-${esc(t.id)}" data-team="${esc(t.id)}" value="${esc(t.name)}" aria-label="Name">
      <span class="leise klein wachsen" style="flex:1">${mac.length ? "an " + esc(mac.join(", ")) : "noch an keinem Mac angemeldet"}${n ? ` · ${n} Einträge` : ""}</span>
      <button class="knopf klein gefahr" data-a="teamLoeschen" data-id="${esc(t.id)}">Entfernen</button></div>`;
  }).join("");
  return block("Team", "Wer in Vertrieb, Aufgaben und Projekten mitarbeitet. Namen ändern sich überall, sobald du das Feld verlässt.",
    `${zeilen || '<p class="leise">Noch niemand angelegt.</p>'}<form id="team-neu" class="filterleiste" style="margin-top:14px"><input id="tn-name" type="text" placeholder="Neue Person, z. B. Felix Steiner" style="flex:1"><button class="knopf" type="submit">${ikon("plus")}Hinzufügen</button></form>`);
}

/* ── Zugänge ─────────────────────────────────────────────────────────── */
function zugaenge(neuZeichnen) {
  if (!E.mail) { api("/api/mail/einstellungen").then((r) => { E.mail = r; neuZeichnen(); }).catch(fehler); return '<div class="laden">Lade …</div>'; }
  const m = E.mail, ph = (gesetzt, sonst) => (gesetzt ? "•••••••• gespeichert (leer lassen = unverändert)" : sonst);
  const status = (ok, t) => `<span class="pille ${ok ? "gruen" : "rot"}">${ok ? t + " eingerichtet" : t + " fehlt"}</span>`;
  return `<form id="zugaenge-form">`
    + block("Finanzordner", "Ordner „02_Finanzen“ mit 01_Rechnungen, 02_Kontoauszüge und der Finanzübersicht_JAHR.xlsx. Auf jedem Mac anders, daher hier pro Mac.",
      `<input id="z-root" type="text" value="${esc(m.finanzen_root || "")}" placeholder="/Users/…/TurnierPro/02_Finanzen"><div style="margin-top:8px">${m.finanzen_root_ok ? '<span class="pille gruen">Ordner erkannt</span>' : '<span class="pille rot">Ordner nicht gefunden</span>'}</div>`)
    + block("Claude (KI-Prüfung)", "Für „Vollständigkeit prüfen“. Schlüssel unter console.anthropic.com → API Keys.",
      `${status(m.anthropic_gesetzt, "Claude")}<input id="z-anthropic" type="password" autocomplete="new-password" style="margin-top:10px" placeholder="${esc(ph(m.anthropic_gesetzt, "sk-ant-…"))}">`)
    + block("Stripe", "Rechnungen und Monatsreport. Ein eingeschränkter Schlüssel mit Leserechten reicht.",
      `${status(m.stripe_gesetzt, "Stripe")}<input id="z-stripe" type="password" autocomplete="new-password" style="margin-top:10px" placeholder="${esc(ph(m.stripe_gesetzt, "rk_live_… oder sk_live_…"))}">`)
    + block("Qonto (Bank)", "Kontoauszüge und Gebührenrechnungen. Login und Secret unter Qonto → Einstellungen → Integrationen.",
      `${status(m.qonto_gesetzt, "Qonto")}<div class="fg" style="margin-top:10px"><input id="z-qlogin" type="text" autocomplete="off" placeholder="${esc(ph(m.qonto_gesetzt, "Login, z. B. turnierpro-1234"))}"><input id="z-qsecret" type="password" autocomplete="new-password" placeholder="${esc(ph(m.qonto_gesetzt, "Secret Key"))}"></div>`)
    + block("E-Mail-Postfach", "Holt Rechnungen als Anhang aus zwei Mail-Ordnern. Bei turnierpro.de ist der Server imap.ionos.de.",
      `${status(m.konfiguriert, "Postfach")}<div class="fg" style="margin-top:10px">
        <label class="f">E-Mail-Adresse<input id="z-mail" type="email" value="${esc(m.konto || "")}" placeholder="buchhaltung@turnierpro.de"></label>
        <label class="f">Passwort<input id="z-pass" type="password" autocomplete="new-password" placeholder="${esc(ph(m.passwort_gesetzt, "Postfach-Passwort"))}"></label>
        <label class="f">IMAP-Server<input id="z-host" type="text" value="${esc(m.imap_host_gesetzt || "")}" placeholder="${esc(m.imap_host_erkannt ? "erkannt: " + m.imap_host_erkannt : "z. B. imap.ionos.de")}"></label><span></span>
        <label class="f">Ordner Eingangsrechnungen<input id="z-eingang" list="mail-ordner" value="${esc(m.eingang || "")}"></label>
        <label class="f">Ordner Ausgangsrechnungen<input id="z-ausgang" list="mail-ordner" value="${esc(m.ausgang || "")}"></label>
        <datalist id="mail-ordner">${E.ordnerListe.map((o) => `<option value="${esc(o)}">`).join("")}</datalist></div>
        <button type="button" class="knopf klein" style="margin-top:10px" data-a="mailOrdnerLaden">${ikon("wdh")}Verfügbare Ordner laden</button>`)
    + `<div style="display:flex;justify-content:flex-end;gap:8px;padding-top:18px"><span class="leise klein" style="align-self:center;margin-right:auto">${ikon("schloss", "i-s")} Zugänge bleiben nur auf diesem Mac (nicht im geteilten Ordner).</span><button class="knopf haupt" type="submit">${ikon("haken")}Speichern</button></div></form>`;
}

/* ── Automatik ───────────────────────────────────────────────────────── */
function automatik(neuZeichnen) {
  if (!E.auto) { api("/api/automatik").then((r) => { E.auto = r; neuZeichnen(); }).catch(fehler); return '<div class="laden">Lade …</div>'; }
  const a = E.auto, l = a.letzter_lauf || {};
  const besitzer = a.besitzer ? `<b>${esc(a.besitzer.name)}</b>${a.dieser ? ' <span class="pille gruen">dieser Mac</span>' : ""}` : '<span class="leise">noch keiner</span>';
  return block("Welcher Mac erledigt die Automatik?", "Belege ablegen und Monatsabschluss laufen nur auf einem Mac, sonst käme alles doppelt. Diese Einstellung ist geteilt.",
      `<div class="status-zeile"><span class="punkt ${a.dieser ? "ok" : ""}"></span><div class="wachsen">${besitzer}<div class="unter">${a.dieser ? "Dieser Mac führt die Automatik aus." : a.besitzer ? "Dieser Mac wartet. Er übernimmt nur, wenn du es hier festlegst." : "Lege fest, welcher Mac das übernimmt."}</div></div>
       ${a.dieser ? "" : '<button class="knopf klein haupt" data-a="automatikUebernehmen">Diesen Mac festlegen</button>'}</div>`)
    + `<form id="automatik-form">` + block("Belege automatisch ablegen", "Holt Rechnungen aus Stripe (aktueller und Vormonat) und aus dem Postfach und legt sie in die Monatsordner.",
      `<label class="check"><input type="checkbox" id="au-aktiv"${a.aktiv !== false ? " checked" : ""}> Automatisch ablegen</label>
       <label class="f" style="margin-top:12px;max-width:260px">Wie oft<select id="au-intervall">${optionen([["2", "alle 2 Stunden"], ["6", "alle 6 Stunden"], ["12", "alle 12 Stunden"], ["24", "einmal täglich"]], String(a.intervall || 6))}</select></label>
       <p class="leise klein" style="margin-top:10px">${l.zeit ? `Zuletzt ${esc(l.zeit)}: ${l.stripe || 0} aus Stripe, ${l.mail || 0} aus der Mail${l.fehler?.length ? " · Fehler: " + esc(l.fehler[0]) : ""}` : "Noch kein automatischer Lauf auf diesem Mac."}</p>
       <button type="button" class="knopf klein" data-a="autoJetzt">${ikon("fach")}Jetzt ablegen</button>`)
    + block("Monatsabschluss", "Am 3. jedes Monats um 0:15 Uhr: Qonto-Kontoauszug ablegen, KI-Prüfung, Bericht und Belegpaket per Mail an die Buchhaltung. Läuft der Mac dann nicht, wird es beim nächsten Start nachgeholt.",
      `<label class="check"><input type="checkbox" id="au-abschluss"${a.abschluss_aktiv !== false ? " checked" : ""}> Monatsabschluss automatisch</label>
       <label class="f" style="margin-top:12px;max-width:360px">Abschluss-Mail an<input id="au-mail" type="email" value="${esc(a.abschluss_email || "")}" placeholder="buchhaltung@turnierpro.de"></label>
       <p class="leise klein" style="margin-top:10px">Letzter Abschluss: ${esc(a.letzter_abschluss || "noch keiner")}</p>
       <button type="button" class="knopf klein" data-a="abschlussJetzt">${ikon("mail")}Abschluss für den Vormonat jetzt ausführen</button>`)
    + `<div style="display:flex;justify-content:flex-end;padding-top:18px"><button class="knopf haupt" type="submit">${ikon("haken")}Speichern</button></div></form>`;
}

/* ── Import & Export ─────────────────────────────────────────────────── */
function importExport() {
  const r = E.importErgebnis;
  const arten = [["artefakt", "Excel-Export aus dem bisherigen Artefakt (Vertrieb, Aufgaben oder Projekte)"], ["termine", "Turniere und Camps (CSV oder Excel)"], ["besuche", "Website-Besuche (CSV oder Excel: Datum, Besucher, Klicks)"], ["sicherung", "Sicherung dieser App (JSON)"]];
  return block("Daten übernehmen", "Im alten Artefakt oben rechts „Export ▾ → Als Excel speichern“ wählen, und zwar einmal im Vertrieb, einmal im Hauptmenü (Aufgaben) und einmal in Projekte. Die Dateien hier nacheinander hochladen. Doppelte Einträge werden erkannt und übersprungen.",
      `<form id="import-form"><div class="fg"><label class="f ganz">Was wird importiert?<select id="im-art">${optionen(arten, E.importArt)}</select></label>
        <label class="datei-knopf ganz${E.importDatei ? " gewaehlt" : ""}" id="im-label">${ikon("upload")}<span id="im-text">${E.importDatei ? esc(E.importDatei.name) : "Datei wählen (.xlsx, .csv, .json)"}</span><input type="file" id="im-datei" accept=".xlsx,.csv,.json" hidden></label></div>
        <div style="margin-top:12px;display:flex;gap:8px"><button class="knopf" type="submit">${ikon("suche")}Prüfen</button>${r && !r.fertig && r.neu_gesamt ? `<button type="button" class="knopf haupt" data-a="importAusfuehren">${ikon("haken")}${r.neu_gesamt} Einträge übernehmen</button>` : ""}</div>
        ${r ? `<div class="import-vorschau">${importVorschau(r)}</div>` : ""}</form>`)
    + block("Exportieren", "Für Auswertungen, zum Weitergeben oder als Sicherung.",
      `<div class="chips"><a class="knopf" href="/api/export/vertrieb.xlsx" download>${ikon("tabelle")}Vertrieb (Excel)</a><a class="knopf" href="/api/export/vertrieb.pdf" download>${ikon("doc")}Vertrieb (PDF)</a>
       <a class="knopf" href="/api/export/aufgaben.xlsx" download>${ikon("tabelle")}Aufgaben (Excel)</a><a class="knopf" href="/api/export/projekte.xlsx" download>${ikon("tabelle")}Projekte (Excel)</a>
       <a class="knopf" href="/api/export/sicherung.json" download>${ikon("archiv")}Komplette Sicherung (JSON)</a></div>`);
}
function importVorschau(r) {
  if (r.fertig) return `<div class="banner">${ikon("haken")}<span>${r.geschrieben} Einträge übernommen.</span></div>`;
  const zeilen = Object.entries(r.sammlungen || {}).map(([k, x]) => `<tr><td>${esc({ vereine: "Vereine", aktivitaeten: "Kontakte / Aktivitäten", aufgaben: "Aufgaben", projekte: "Projekte", kommentare: "Projekt-Kommentare", team: "Team (neue Personen)", termine: "Termine", besuche: "Besuchstage" }[k] || k)}</td><td class="r num">${x.neu}</td><td class="r num">${x.doppelt}</td></tr>`).join("");
  return `${(r.hinweise || []).map((h) => `<div class="banner warn">${ikon("info")}<span>${esc(h)}</span></div>`).join("")}
    <table><thead><tr><th>Bereich</th><th class="r">Neu</th><th class="r">Schon vorhanden</th></tr></thead><tbody>${zeilen || '<tr><td colspan="3" class="leise">Nichts Passendes gefunden.</td></tr>'}</tbody></table>`;
}
async function sendeImport(ausfuehren) {
  if (!E.importDatei) return melde("Bitte zuerst eine Datei wählen.", "fehler");
  const fd = new FormData();
  fd.append("datei", E.importDatei); fd.append("art", E.importArt); fd.append("ausfuehren", ausfuehren ? "1" : "");
  arbeit(ausfuehren ? "Übernehme Daten …" : "Prüfe Datei …");
  try {
    E.importErgebnis = await api("/api/import", { method: "POST", body: fd });
    if (ausfuehren) { await ladeDaten(); melde(`${E.importErgebnis.geschrieben} Einträge übernommen`); E.importDatei = null; }
  } catch (e) { E.importErgebnis = null; fehler(e); }
  finally { arbeit(); }
}

/* ── Aktionen ────────────────────────────────────────────────────────── */
Object.assign(aktionen, {
  ordnerSpeichern: async () => {
    const p = gv("e-ordner");
    if (!p) return melde("Bitte einen Ordnerpfad eintragen.", "fehler");
    if (!(await frage("Datenordner wechseln?", "Die App liest danach die Daten aus dem neuen Ordner. Der alte Ordner bleibt unverändert erhalten.", { ja: "Wechseln", gefahr: false }))) return;
    try { await api("/api/geraet", { json: { daten_ordner: p } }); S.start = await api("/api/start"); await ladeDaten(); melde("Datenordner gewechselt"); } catch (e) { fehler(e); }
  },
  teamLoeschen: async (el) => {
    const id = el.dataset.id, t = X.team[id];
    if (S.d.aktivitaeten.some((a) => a.von === id) || S.d.vereine.some((v) => v.betreuer === id)) return melde("Nicht möglich: Es gibt Vertriebseinträge dieser Person.", "fehler");
    if (!(await frage(`${t?.name || "Person"} entfernen?`, "Die Person wird aus dem Team entfernt."))) return;
    try { await loesche("team", id); melde("Entfernt"); } catch (e) { fehler(e); }
  },
  mailOrdnerLaden: async (el, neuZeichnen) => {
    arbeit("Lade Mail-Ordner …");
    try { const d = await api("/api/mail/ordner"); E.ordnerListe = d.ordner || []; melde(`${E.ordnerListe.length} Mail-Ordner geladen. Jetzt im Feld auswählen.`); } catch (e) { fehler(e); }
    finally { arbeit(); neuZeichnen(); }
  },
  automatikUebernehmen: async (el, neuZeichnen) => {
    try { E.auto = await api("/api/automatik/uebernehmen", { json: {} }); melde("Dieser Mac erledigt jetzt die Automatik"); neuZeichnen(); } catch (e) { fehler(e); }
  },
  autoJetzt: async (el, neuZeichnen) => {
    arbeit("Belege ablegen …", "Stripe und Postfach werden geprüft.");
    try { const d = await api("/api/auto/jetzt", { json: {} }); melde(`Abgelegt: ${d.stripe || 0} aus Stripe, ${d.mail || 0} aus der Mail.`); if (d.fehler?.length) melde(d.fehler[0], "fehler"); E.auto = null; }
    catch (e) { fehler(e); } finally { arbeit(); neuZeichnen(); }
  },
  abschlussJetzt: async (el, neuZeichnen) => {
    if (!(await frage("Monatsabschluss jetzt ausführen?", "Belege werden abgelegt, die KI prüft, und Bericht plus Belegpaket gehen per Mail an die Buchhaltung.", { ja: "Ausführen", gefahr: false }))) return;
    arbeit("Monatsabschluss läuft …", "Das dauert 1–3 Minuten.");
    try { const d = await api("/api/abschluss/jetzt", { json: {} }); melde(`Monatsabschluss ${d.monat}: Mail an ${d.email_an || "–"} versendet.`); if (d.fehler?.length) melde(d.fehler[0], "fehler"); E.auto = null; }
    catch (e) { fehler(e); } finally { arbeit(); neuZeichnen(); }
  },
  importAusfuehren: (el, neuZeichnen) => sendeImport(true).then(neuZeichnen),
});
Object.assign(absenden, {
  "team-neu": async () => {
    const n = gv("tn-name");
    if (!n) return melde("Bitte einen Namen eintragen.", "fehler");
    if (S.d.team.some((t) => String(t.name).toLowerCase() === n.toLowerCase())) return melde("Diesen Namen gibt es schon.", "fehler");
    try { await neu("team", { name: n }); melde("Hinzugefügt"); } catch (e) { fehler(e); }
  },
  "zugaenge-form": async (form, neuZeichnen) => {
    try {
      await api("/api/mail/einstellungen", { json: {
        finanzen_root: gv("z-root"), anthropic_key: gv("z-anthropic"), stripe_key: gv("z-stripe"), qonto_login: gv("z-qlogin"), qonto_secret: gv("z-qsecret"),
        email: gv("z-mail"), passwort: gv("z-pass"), imap_host: gv("z-host"), eingang: gv("z-eingang"), ausgang: gv("z-ausgang"),
      } });
      E.mail = null; S.fin = {}; S.konfig = await api("/api/config");
      melde("Zugänge gespeichert"); neuZeichnen();
    } catch (e) { fehler(e); }
  },
  "automatik-form": async (form, neuZeichnen) => {
    try {
      await api("/api/mail/einstellungen", { json: { auto_ablegen: $("#au-aktiv").checked, auto_intervall: Number(gv("au-intervall")), monatsabschluss_aktiv: $("#au-abschluss").checked, abschluss_email: gv("au-mail") } });
      E.auto = null; melde("Automatik gespeichert"); neuZeichnen();
    } catch (e) { fehler(e); }
  },
  "import-form": (form, neuZeichnen) => sendeImport(false).then(neuZeichnen),
});
Object.assign(aenderungen, {
  "e-ich": async (el) => { try { await api("/api/ich", { json: { mitglied: el.value } }); S.start = await api("/api/start"); await ladeDaten(); melde("Gespeichert"); } catch (e) { fehler(e); } },
  "e-geraet": async (el) => { try { await api("/api/geraet", { json: { geraet_name: el.value } }); S.start = await api("/api/start"); await ladeDaten(); melde("Name gespeichert"); } catch (e) { fehler(e); } },
  "im-art": (el) => { E.importArt = el.value; E.importErgebnis = null; },
  "im-datei": (el, neuZeichnen) => { E.importDatei = el.files?.[0] || null; E.importErgebnis = null; neuZeichnen(); },
  "tm-": async (el) => {
    const id = el.dataset.team, v = el.value.trim(), t = X.team[id];
    if (!t || !v || v === t.name) { el.value = t?.name || ""; return; }
    try { await aendere("team", id, { name: v }); melde("Name geändert"); } catch (e) { fehler(e); }
  },
});
