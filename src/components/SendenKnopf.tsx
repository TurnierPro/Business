"use client";
import { useFormStatus } from "react-dom";

// Knopf, der während des Absendens „Wird erstellt …“ zeigt und gesperrt ist (kein doppeltes Anlegen).
export function SendenKnopf({ text, warten = "Wird erstellt …", className = "knopf haupt", style }: { text: string; warten?: string; className?: string; style?: React.CSSProperties }) {
  const { pending } = useFormStatus();
  return (
    <button className={className} style={style} disabled={pending} aria-busy={pending}>
      {pending ? warten : text}
    </button>
  );
}
