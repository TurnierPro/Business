"use client";
import { useEffect } from "react";

// Nach dem Absenden eines Formulars geht der Sprung zum Abschnitt (#anker) bei der Weiterleitung verloren.
// Diese Komponente scrollt nach dem Laden zum Abschnitt mit der Meldung, damit man sie sofort sieht.
export function ZumAnker({ id }: { id: string | null }) {
  useEffect(() => {
    if (!id) return;
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ block: "start" });
    el.querySelector<HTMLElement>("[role=alert], [role=status]")?.focus?.();
  }, [id]);
  return null;
}
