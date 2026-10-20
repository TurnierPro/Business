// Verkleinert eine A4-Vorschau passend zur Breite (eigene Datei statt Inline-Skript wegen der Content-Security-Policy)
// Erst umbrechen wie im PDF, dann verkleinern. Layout-Probleme stehen oben als Warnung.
document.fonts.ready.then(function () {
  var probleme = window.nexovaUmbruch ? window.nexovaUmbruch() : [];
  if (probleme.length) {
    var w = document.createElement("div");
    w.setAttribute("role", "alert");
    w.style.cssText = "font:14px sans-serif;background:#a63a2c;color:#fff;padding:10px 14px";
    w.textContent = "Layout nicht sauber, so wird kein PDF erzeugt: " + probleme.join(" · ");
    document.body.prepend(w);
  }
  document.body.style.zoom = String(Math.min(1, (innerWidth - 8) / 826));
});
