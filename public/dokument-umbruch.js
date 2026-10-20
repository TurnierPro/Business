// Seitenumbruch und Layout-Prüfung für alle Dokumente (PDF und Vorschau nutzen dasselbe Skript).
// 1. Passt Inhalt nicht mehr über die Fußzeile, kommt er auf eine Folgeseite (Tabellen und Listen zeilenweise).
// 2. Danach wird geprüft: nichts ragt in die Fußzeile, nichts über den rechten Rand, kein Text wird abgeschnitten.
// Rückgabe: Liste der Probleme (leer = sauber).
window.nexovaUmbruch = function () {
  var MM = 96 / 25.4;
  var SEITE = 297 * MM;
  var probleme = [];
  var alle = function () { return Array.prototype.slice.call(document.querySelectorAll(".seite")); };
  var fest = function (el) { var p = getComputedStyle(el).position; return p === "absolute" || p === "fixed" || el.matches(".kopf, .fuss, .falz"); };
  var grenzeVon = function (s) {
    var f = s.querySelector(":scope > .fuss");
    var oben = s.getBoundingClientRect().top;
    return f ? f.getBoundingClientRect().top - 3 * MM : oben + SEITE - 24 * MM;
  };
  var flussVon = function (s) { return s.querySelector(":scope > .briefkoerper, :scope > .fluss") || s; };
  var folgeseite = function (s) {
    var neu = document.createElement("div");
    neu.className = "seite folgeseite";
    var kopf = s.querySelector(".kopf");
    if (kopf) { var k = kopf.cloneNode(true); k.removeAttribute("style"); neu.appendChild(k); }
    var fluss = document.createElement("div");
    fluss.className = "fluss";
    neu.appendChild(fluss);
    var fuss = s.querySelector(":scope > .fuss");
    if (fuss) neu.appendChild(fuss.cloneNode(true));
    s.after(neu);
    return fluss;
  };
  // Tabelle oder Liste an der Grenze teilen: der Rest kommt in eine Kopie (mit Tabellenkopf) auf die Folgeseite
  var teilen = function (el, grenze) {
    var zeilen = el.matches("table") ? Array.prototype.slice.call(el.querySelectorAll(":scope > tbody > tr")) : Array.prototype.slice.call(el.children);
    var ab = zeilen.findIndex(function (z) { return z.getBoundingClientRect().bottom > grenze; });
    if (ab <= 0) return null;
    var rest = el.cloneNode(true);
    var restZeilen = el.matches("table") ? rest.querySelectorAll(":scope > tbody > tr") : rest.children;
    var z = Array.prototype.slice.call(restZeilen);
    for (var i = 0; i < ab; i++) z[i].remove();
    for (var j = ab; j < zeilen.length; j++) zeilen[j].remove();
    if (el.matches("ol")) rest.setAttribute("start", String((Number(el.getAttribute("start")) || 1) + ab));
    return rest;
  };
  var schutz = 0;
  for (var i = 0; i < alle().length && schutz < 300; i++, schutz++) {
    var s = alle()[i];
    var grenze = grenzeVon(s);
    var fluss = flussVon(s);
    var kinder = Array.prototype.slice.call(fluss.children).filter(function (k) { return !fest(k); });
    var idx = kinder.findIndex(function (k) { return k.getBoundingClientRect().bottom > grenze; });
    if (idx < 0) continue;
    var erstes = kinder[idx];
    var teilbar = erstes.matches("table, ul, ol") && erstes.getBoundingClientRect().top < grenze;
    // Erstes Element der Seite und nicht teilbar: passt auf keine Seite. Nicht verschieben, die Prüfung meldet es.
    if (idx === 0 && !teilbar) continue;
    var ziel = folgeseite(s);
    var rest = teilbar ? teilen(erstes, grenze) : null;
    var verschieben = rest ? kinder.slice(idx + 1) : kinder.slice(idx);
    // Überschrift nie allein am Seitenende stehen lassen
    var davor = kinder[idx - 1];
    if (!rest && davor && davor.matches("h1, h2, h3")) verschieben.unshift(davor);
    if (rest) ziel.appendChild(rest);
    verschieben.forEach(function (k) { ziel.appendChild(k); });
  }
  // Prüfung: Jede Seite beginnt genau eine A4-Höhe nach der vorigen (sonst verrutscht der Druck)
  var erste = alle()[0];
  var start = erste ? erste.getBoundingClientRect().top + window.scrollY : 0;
  if (erste && start > 1) probleme.push("Seite 1 beginnt nicht oben (Abstand verrutscht)");
  alle().forEach(function (s, n) {
    var oben = s.getBoundingClientRect().top + window.scrollY;
    if (Math.abs(oben - start - n * SEITE) > 2) probleme.push("Seite " + (n + 1) + " ist verrutscht");
    if (Math.abs(s.getBoundingClientRect().height - SEITE) > 2) probleme.push("Seite " + (n + 1) + " hat nicht A4-Höhe");
  });
  alle().forEach(function (s, n) {
    var r = s.getBoundingClientRect();
    var grenze = grenzeVon(s);
    var rechts = r.right - 20 * MM + 1;
    var fluss = flussVon(s);
    Array.prototype.slice.call(fluss.querySelectorAll("*")).forEach(function (el) {
      if (el.closest(".fuss, .falz") || !el.getClientRects().length) return;
      var e = el.getBoundingClientRect();
      if (e.height === 0 || e.width === 0) return;
      var text = (el.textContent || "").trim().slice(0, 40);
      if (!fest(el) && !el.closest(".kopf, .anschrift, .infoblock") && e.bottom > grenze + 1 && el.children.length === 0) probleme.push("Seite " + (n + 1) + ": „" + text + "“ ragt in die Fußzeile");
      // Text, der seitlich übersteht, macht den Block nicht breiter: tatsächliche Breite des Inhalts messen
      if ((e.right > rechts || el.scrollWidth > el.clientWidth + 2) && el.children.length === 0 && el.clientWidth > 0) probleme.push("Seite " + (n + 1) + ": „" + text + "“ ragt über den rechten Rand");
      if (el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflow === "hidden") probleme.push("Seite " + (n + 1) + ": „" + text + "“ wird abgeschnitten");
    });
    var a = s.querySelector(".anschrift");
    if (a && a.scrollHeight > a.clientHeight + 1) probleme.push("Seite " + (n + 1) + ": Anschrift passt nicht ins Fenster");
    var f = s.querySelector(":scope > .fuss");
    if (f && f.getBoundingClientRect().bottom > r.top + SEITE) probleme.push("Seite " + (n + 1) + ": Fußzeile liegt außerhalb der Seite");
    if (f) Array.prototype.slice.call(f.children).forEach(function (sp) { if (sp.scrollWidth > sp.clientWidth + 1) probleme.push("Fußzeile: „" + sp.textContent.trim().slice(0, 40) + "“ ist zu lang für die Spalte"); });
  });
  return probleme.filter(function (p, k, l) { return l.indexOf(p) === k; }).slice(0, 10);
};
