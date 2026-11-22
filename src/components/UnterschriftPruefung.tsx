"use client";
import { useEffect, useState } from "react";

// Prüft das Unterschriftsformular vor dem Absenden im Browser: alle Felder unterschrieben, IBAN plausibel.
// Nennt alle Lücken auf einmal und merkt sich die Texteingaben, falls der Server doch einen Fehler meldet.
// Zeigt laufend „x von y unterschrieben“.

function ibanOk(eingabe: string): boolean {
  const iban = eingabe.replace(/[\s-]/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban) || (iban.startsWith("DE") && iban.length !== 22)) return false;
  const ziffern = (iban.slice(4) + iban.slice(0, 4)).replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let rest = 0;
  for (const z of ziffern) rest = (rest * 10 + Number(z)) % 97;
  return rest === 1;
}

export function UnterschriftPruefung({ formId, zaehler = true }: { formId: string; zaehler?: boolean }) {
  const [fehler, setFehler] = useState<string[]>([]);
  const [stand, setStand] = useState({ fertig: 0, gesamt: 0 });

  useEffect(() => {
    const form = document.getElementById(formId) as HTMLFormElement | null;
    if (!form) return;
    form.noValidate = true; // eigene, deutsche Meldungen statt der englischen Browser-Hinweise
    const speicher = `formular:${location.pathname}:${formId}`;
    const felder = () => [...form.querySelectorAll<HTMLInputElement>("input[type=hidden]")].filter((i) => i.name.startsWith("bild-") || ["levarexBild", "mandatBild", "fotoBild"].includes(i.name));
    const titel = (i: HTMLInputElement) => i.closest("section")?.querySelector("h2")?.textContent?.trim() || i.closest(".unterschrift-feld")?.querySelector("span")?.textContent?.trim() || i.name;
    // Texteingaben nach einem Serverfehler zurückholen
    try {
      const alt = JSON.parse(sessionStorage.getItem(speicher) ?? "{}") as Record<string, string>;
      if (/fehler=/.test(location.search)) {
        for (const [k, v] of Object.entries(alt)) {
          const el = form.elements.namedItem(k);
          if (el instanceof HTMLInputElement && el.type !== "hidden" && el.type !== "checkbox") el.value = v;
        }
      } else sessionStorage.removeItem(speicher);
    } catch {
      /* egal */
    }
    const zaehlen = () => {
      const iban = (form.elements.namedItem("iban") as HTMLInputElement | null)?.value.trim();
      const relevant = felder().filter((i) => i.name !== "mandatBild" || !!iban);
      setStand({ fertig: relevant.filter((i) => i.value).length, gesamt: relevant.length });
    };
    const takt = window.setInterval(zaehlen, 600);
    zaehlen();
    const absenden = (e: SubmitEvent) => {
      const liste: string[] = [];
      const iban = (form.elements.namedItem("iban") as HTMLInputElement | null)?.value.trim() ?? "";
      for (const i of felder()) {
        if (i.name === "mandatBild" && !iban) continue;
        if (!i.value) liste.push(`Unterschrift fehlt: ${titel(i)}`);
      }
      if (iban && !ibanOk(iban)) liste.push("Die IBAN stimmt nicht. Bitte noch einmal vom Kontoauszug abschreiben.");
      // Pflichtfelder und Pflicht-Haken (ohne die Namensprüfung unten doppelt zu melden)
      for (const el of form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input[required], textarea[required]")) {
        if (el.name === "name") continue;
        const leer = el instanceof HTMLInputElement && el.type === "checkbox" ? !el.checked : !el.value.trim();
        if (!leer) continue;
        const text = el.closest("label")?.textContent?.trim().slice(0, 90) ?? el.name;
        liste.push(el instanceof HTMLInputElement && el.type === "checkbox" ? `Bitte bestätigen: ${text}` : `Bitte ausfüllen: ${text}`);
      }
      const nameFeld = form.elements.namedItem("name") as HTMLInputElement | null;
      if (nameFeld && nameFeld.value.trim().length < 3) liste.push("Bitte den vollständigen Namen der Person eintragen, die unterschreibt.");
      setFehler(liste);
      if (liste.length) {
        e.preventDefault();
        document.getElementById(`${formId}-fehler`)?.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      try {
        const werte: Record<string, string> = {};
        for (const el of form.querySelectorAll<HTMLInputElement>("input:not([type=hidden]):not([type=checkbox])")) if (el.name) werte[el.name] = el.value;
        sessionStorage.setItem(speicher, JSON.stringify(werte));
      } catch {
        /* egal */
      }
    };
    form.addEventListener("submit", absenden);
    return () => {
      window.clearInterval(takt);
      form.removeEventListener("submit", absenden);
    };
  }, [formId]);

  return (
    <div id={`${formId}-fehler`} style={{ display: "grid", gap: 8 }}>
      {zaehler && stand.gesamt > 1 ? (
        <p className="klein" aria-live="polite" style={{ margin: 0 }}>
          <span className={`status ${stand.fertig === stand.gesamt ? "ok" : "warten"}`}>{stand.fertig} von {stand.gesamt} unterschrieben</span>
        </p>
      ) : null}
      {fehler.length ? (
        <div className="hinweis fehler" role="alert">
          <b>Bitte noch ergänzen:</b>
          <ul style={{ margin: "6px 0 0" }}>{fehler.map((f) => <li key={f}>{f}</li>)}</ul>
        </div>
      ) : null}
    </div>
  );
}
