"use client";
import { useSearchParams } from "next/navigation";

// Zeigt das Ergebnis der letzten Aktion (?ok=… oder ?fehler=…).
export function Meldung() {
  const p = useSearchParams();
  const ok = p.get("ok");
  const fehler = p.get("fehler");
  if (!ok && !fehler) return null;
  return (
    <div className={`hinweis ${fehler ? "fehler" : "ok"}`} role={fehler ? "alert" : "status"}>
      {fehler ?? ok}
    </div>
  );
}
