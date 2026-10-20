// Verkleinert eine A4-Vorschau passend zur Breite (eigene Datei statt Inline-Skript wegen der Content-Security-Policy)
document.body.style.zoom = String(Math.min(1, (innerWidth - 8) / 826));
