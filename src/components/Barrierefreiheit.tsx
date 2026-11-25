"use client";

import { useEffect, useRef, useState } from "react";

// Einstellungen zur Barrierefreiheit im Kundenportal: Schriftgröße, Kontrast, Links unterstreichen, Bewegung aus.
// Gilt nur in diesem Browser (gespeichert im Browser, kein Cookie, nichts geht an uns). Ändert Attribute an .portal-seite,
// die Gestaltung dazu steht in globals.css („Barrierefreiheit im Portal“).

type Wahl = { schrift: "normal" | "gross" | "sehrgross"; kontrast: "normal" | "hoch"; links: boolean; bewegung: boolean };
const STANDARD: Wahl = { schrift: "normal", kontrast: "normal", links: false, bewegung: false };
const SCHLUESSEL = "levarex-barrierefreiheit";

function anwenden(w: Wahl) {
  const seite = document.querySelector<HTMLElement>(".portal-seite");
  if (!seite) return;
  seite.dataset.schrift = w.schrift;
  seite.dataset.kontrast = w.kontrast;
  seite.dataset.links = w.links ? "an" : "aus";
  seite.dataset.bewegung = w.bewegung ? "aus" : "an";
}

export function Barrierefreiheit() {
  const [offen, setOffen] = useState(false);
  const [wahl, setWahl] = useState<Wahl>(STANDARD);
  const knopf = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    try {
      const gespeichert = JSON.parse(localStorage.getItem(SCHLUESSEL) ?? "null") as Partial<Wahl> | null;
      if (gespeichert) setWahl({ ...STANDARD, ...gespeichert });
    } catch {
      // ohne Speicher (z. B. privates Fenster) gelten die Standardwerte
    }
  }, []);

  useEffect(() => {
    anwenden(wahl);
    try {
      localStorage.setItem(SCHLUESSEL, JSON.stringify(wahl));
    } catch {
      // nicht speicherbar: gilt dann nur bis zum Neuladen
    }
  }, [wahl]);

  // Escape schließt das Fenster und setzt den Fokus zurück auf den Knopf
  useEffect(() => {
    if (!offen) return;
    const taste = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOffen(false);
        knopf.current?.focus();
      }
    };
    document.addEventListener("keydown", taste);
    return () => document.removeEventListener("keydown", taste);
  }, [offen]);

  const setze = (teil: Partial<Wahl>) => setWahl((w) => ({ ...w, ...teil }));
  const geaendert = JSON.stringify(wahl) !== JSON.stringify(STANDARD);

  return (
    <div className="bf">
      <button ref={knopf} type="button" className="bf-knopf" aria-expanded={offen} aria-controls="bf-fenster" onClick={() => setOffen((o) => !o)}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="7" r="1.2" fill="currentColor" />
          <path d="M7 10h10M12 10v4M12 14l-3 5M12 14l3 5" />
        </svg>
        <span>Barrierefreiheit</span>
      </button>
      {offen ? (
        <div id="bf-fenster" className="bf-fenster" role="dialog" aria-label="Einstellungen zur Barrierefreiheit">
          <fieldset>
            <legend>Schriftgröße</legend>
            <div className="bf-wahl">
              {([["normal", "Normal"], ["gross", "Groß"], ["sehrgross", "Sehr groß"]] as const).map(([k, n]) => (
                <button key={k} type="button" aria-pressed={wahl.schrift === k} onClick={() => setze({ schrift: k })}>{n}</button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>Kontrast</legend>
            <div className="bf-wahl">
              {([["normal", "Normal"], ["hoch", "Hoch"]] as const).map(([k, n]) => (
                <button key={k} type="button" aria-pressed={wahl.kontrast === k} onClick={() => setze({ kontrast: k })}>{n}</button>
              ))}
            </div>
          </fieldset>
          <label className="haken"><input type="checkbox" checked={wahl.links} onChange={(e) => setze({ links: e.target.checked })} /><span>Links unterstreichen</span></label>
          <label className="haken"><input type="checkbox" checked={wahl.bewegung} onChange={(e) => setze({ bewegung: e.target.checked })} /><span>Bewegungen und Animationen aus</span></label>
          <div className="bf-fuss">
            <button type="button" className="bf-zurueck" disabled={!geaendert} onClick={() => setWahl(STANDARD)}>Zurücksetzen</button>
            <span className="leise klein">Gilt nur in diesem Browser.</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
