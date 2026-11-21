"use client";
import { useEffect, useRef, useState } from "react";

// Unterschrift mit Finger oder Stift auf dem Tablet. Ergebnis: PNG als data-URL im versteckten Feld `name`.
export function UnterschriftFeld({ name, beschriftung }: { name: string; beschriftung: string }) {
  const leinwand = useRef<HTMLCanvasElement>(null);
  const [bild, setBild] = useState("");
  const zeichnet = useRef(false);
  const letzter = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const c = leinwand.current!;
    const skala = window.devicePixelRatio || 1;
    c.width = c.clientWidth * skala;
    c.height = c.clientHeight * skala;
    const g = c.getContext("2d")!;
    g.scale(skala, skala);
    g.lineWidth = 2.2;
    g.lineCap = "round";
    g.lineJoin = "round";
    g.strokeStyle = "#151816"; // Druckfarbe: die Unterschrift erscheint im hellen PDF
  }, []);

  const punkt = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = leinwand.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    zeichnet.current = true;
    letzter.current = punkt(e);
  };
  const ziehen = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!zeichnet.current || !letzter.current) return;
    const g = leinwand.current!.getContext("2d")!;
    const p = punkt(e);
    g.beginPath();
    g.moveTo(letzter.current.x, letzter.current.y);
    g.lineTo(p.x, p.y);
    g.stroke();
    letzter.current = p;
  };
  const ende = () => {
    if (!zeichnet.current) return;
    zeichnet.current = false;
    setBild(leinwand.current!.toDataURL("image/png"));
  };
  const loeschen = () => {
    const c = leinwand.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    setBild("");
  };

  return (
    <div className="unterschrift-feld">
      <div className="unterschrift-kopf"><span>{beschriftung}</span>{bild ? <span className="status ok">unterschrieben</span> : <span className="status warten">fehlt</span>}</div>
      <canvas ref={leinwand} aria-label={`Unterschriftsfeld: ${beschriftung}`} onPointerDown={start} onPointerMove={ziehen} onPointerUp={ende} onPointerLeave={ende} />
      <input type="hidden" name={name} value={bild} />
      <button type="button" className="knopf klein" onClick={loeschen}>Neu unterschreiben</button>
    </div>
  );
}
