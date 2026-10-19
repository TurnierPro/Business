"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Lädt die Seite alle paar Sekunden neu, solange etwas im Hintergrund läuft.
export function NeuLaden({ sekunden = 3 }: { sekunden?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), sekunden * 1000);
    return () => clearInterval(t);
  }, [router, sekunden]);
  return null;
}
