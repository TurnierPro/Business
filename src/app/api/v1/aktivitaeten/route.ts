import { json, pruefeZugriff } from "@/lib/api";
import { aktivitaetAnlegen } from "@/lib/ablauf/crm";

const ARTEN = ["notiz", "anruf", "termin", "aufgabe"] as const;

// Notiz, Anruf, Termin oder Aufgabe anlegen (Recht „aktivitaeten“).
export async function POST(req: Request) {
  const z = await pruefeZugriff(req, "aktivitaeten");
  if (z instanceof Response) return z;
  const d = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!d || typeof d.titel !== "string" || !ARTEN.includes(d.art as (typeof ARTEN)[number])) return json({ fehler: `Felder „titel“ und „art“ (${ARTEN.join(", ")}) nötig` }, 400);
  const faellig = typeof d.faelligAm === "string" && !Number.isNaN(Date.parse(d.faelligAm)) ? new Date(d.faelligAm) : null;
  try {
    const id = await aktivitaetAnlegen(
      { betriebId: Number(d.betriebId) || null, art: d.art as (typeof ARTEN)[number], titel: d.titel.slice(0, 200), text: typeof d.text === "string" ? d.text.slice(0, 5000) : undefined, faelligAm: faellig, zustaendig: typeof d.zustaendig === "string" ? d.zustaendig.slice(0, 100) : null },
      z.name,
    );
    return json({ id }, 201);
  } catch (e) {
    return json({ fehler: e instanceof Error ? e.message : "Fehler" }, 400);
  }
}
