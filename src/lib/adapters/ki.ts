import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { getDb, schema } from "../db";

// Ein einziger Weg zu Claude. Jeder Aufruf wird mit Kosten protokolliert.
// Ohne ANTHROPIC_API_KEY liefert der Simulator den mitgegebenen Ersatztext.

export const MODELLE = {
  schnell: "claude-haiku-5-5", // Sortieren, Herausziehen, kurze Antworten
  text: "claude-sonnet-5-5", // Briefe, Reports, Protokolle
} as const;

// US-Dollar je 1 Mio. Token (Stand Oktober 2026)
const PREISE: Record<string, { ein: number; aus: number }> = {
  "claude-haiku-5-5": { ein: 0.1, aus: 0.5 },
  "claude-sonnet-5-5": { ein: 2, aus: 10 },
};

let client: Anthropic | undefined;

function stimme(): string {
  return fs.readFileSync(path.join(process.cwd(), "brand", "stimme.md"), "utf8");
}

export type KiAuftrag = {
  zweck: string;
  modell?: keyof typeof MODELLE;
  aufgabe: string;
  daten?: unknown;
  ersatz: string;
  betriebId?: number | null;
  websuche?: boolean;
};

export async function schreibe(a: KiAuftrag): Promise<{ text: string; simuliert: boolean }> {
  if (!process.env.ANTHROPIC_API_KEY) return { text: a.ersatz, simuliert: true };
  client ??= new Anthropic();
  const model = MODELLE[a.modell ?? "text"];
  const inhalt = a.daten === undefined ? a.aufgabe : `${a.aufgabe}\n\nDaten (nur diese Angaben verwenden):\n${JSON.stringify(a.daten, null, 2)}`;
  const antwort = await client.messages
    .stream({
      model,
      max_tokens: 16000,
      system: `Du schreibst für Stelax Consulting. Halte dich streng an diese Regeln:\n\n${stimme()}`,
      messages: [{ role: "user", content: inhalt }],
      ...(a.websuche ? { tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 10 }] } : {}),
    } as Anthropic.MessageStreamParams)
    .finalMessage();

  if (antwort.stop_reason === "refusal") throw new Error("Claude hat die Anfrage abgelehnt.");
  const text = antwort.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  const preis = PREISE[model] ?? { ein: 0, aus: 0 };
  const kosten = (antwort.usage.input_tokens * preis.ein + antwort.usage.output_tokens * preis.aus);
  const db = await getDb();
  await db.insert(schema.kiNutzung).values({
    modell: model,
    zweck: a.zweck,
    betriebId: a.betriebId ?? null,
    eingabeTokens: antwort.usage.input_tokens,
    ausgabeTokens: antwort.usage.output_tokens,
    kostenMikroUsd: Math.round(kosten),
  });
  return { text: text || a.ersatz, simuliert: false };
}

/** Holt ein JSON-Objekt aus einer KI-Antwort (auch wenn es in ```json steht). */
export function jsonAus<T>(text: string, ersatz: T): T {
  const treffer = text.match(/```(?:json)?\s*([\s\S]*?)```/) ?? text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (!treffer) return ersatz;
  try {
    return JSON.parse(treffer[1]) as T;
  } catch {
    return ersatz;
  }
}

/**
 * Prüft einen fertigen Text: Stehen darin Beträge oder Prozentzahlen, die nicht in den Daten vorkommen?
 * Dann bekommt der Eintrag im Postausgang einen Hinweis.
 */
export function pruefeText(text: string, erlaubt: string[] = []): string[] {
  const hinweise: string[] = [];
  const zahlen = text.match(/\d[\d.,]*\s?(€|Euro|%|Prozent)/g) ?? [];
  const norm = (s: string) => s.replace(/[\s.]/g, "").replace("Euro", "€").replace("Prozent", "%");
  const erlaubtNorm = erlaubt.map(norm);
  for (const z of zahlen) {
    if (!erlaubtNorm.some((e) => e.includes(norm(z).replace(/,00/, "")) || norm(z).includes(e))) {
      hinweise.push(`Zahl „${z}“ steht nicht in den Daten. Bitte prüfen.`);
    }
  }
  for (const wort of ["garantiert", "Garantie", "KI-gestützt", "Digitalisierung", "nur heute", "jetzt zugreifen"]) {
    if (text.includes(wort)) hinweise.push(`Wort „${wort}“ passt nicht zur Stelax-Stimme.`);
  }
  return hinweise;
}
