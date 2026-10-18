"use client";
import { useRef, useState } from "react";

// Aufnahme direkt im Browser (Handy oder Laptop). Die Datei geht erst beim Speichern an den Server.
export function Aufnahme() {
  const [zustand, setZustand] = useState<"bereit" | "laeuft" | "fertig">("bereit");
  const [sekunden, setSekunden] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const teile = useRef<Blob[]>([]);
  const uhr = useRef<ReturnType<typeof setInterval> | null>(null);
  const feld = useRef<HTMLInputElement>(null);

  async function start() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const r = new MediaRecorder(stream);
    teile.current = [];
    r.ondataavailable = (e) => teile.current.push(e.data);
    r.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const typ = r.mimeType || "audio/webm";
      const datei = new File(teile.current, `termin.${typ.includes("mp4") ? "m4a" : "webm"}`, { type: typ });
      const dt = new DataTransfer();
      dt.items.add(datei);
      if (feld.current) feld.current.files = dt.files;
      setZustand("fertig");
    };
    r.start(1000);
    recorder.current = r;
    setSekunden(0);
    uhr.current = setInterval(() => setSekunden((s) => s + 1), 1000);
    setZustand("laeuft");
  }

  function stopp() {
    recorder.current?.stop();
    if (uhr.current) clearInterval(uhr.current);
  }

  const zeit = `${String(Math.floor(sekunden / 60)).padStart(2, "0")}:${String(sekunden % 60).padStart(2, "0")}`;
  return (
    <div className="feld">
      <span>Aufnahme</span>
      <div className="knopfreihe">
        {zustand !== "laeuft" ? (
          <button type="button" className="knopf" onClick={start}>{zustand === "fertig" ? "Neu aufnehmen" : "Aufnahme starten"}</button>
        ) : (
          <button type="button" className="knopf gefahr" onClick={stopp}>Aufnahme beenden</button>
        )}
        <span className="mono" aria-live="polite">{zustand === "laeuft" ? `● ${zeit}` : zustand === "fertig" ? `Aufnahme bereit (${zeit})` : ""}</span>
      </div>
      <small>Oder eine vorhandene Datei wählen:</small>
      <input ref={feld} type="file" name="aufnahme" accept="audio/*" capture="user" required />
    </div>
  );
}
