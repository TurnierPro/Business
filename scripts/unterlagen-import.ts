// Liest docs/unterlagen-bericht.md (Recherche „Dokumente für die Stelax GmbH“, Stand 18.10.2026)
// und erzeugt src/lib/unterlagen-daten.json für das Register in Stelax OS.
// Aufruf nach einer neuen Fassung des Berichts: npx tsx scripts/unterlagen-import.ts
import fs from "node:fs";

const text = fs.readFileSync("docs/unterlagen-bericht.md", "utf8");
const zeilen = text.split("\n");
const eintraege: { key: string; kategorie: string; titel: string; status: string; grundlage: string; wer: string; prioritaet: string; etappe: number }[] = [];
let kategorie = "";
let nr = 0;

const etappe = (p: string): number => {
  const t = p.toLowerCase();
  if (t.startsWith("vor notartermin")) return 1;
  if (t.startsWith("bei gründung")) return 2;
  if (t.startsWith("vor ") || t.startsWith("ab erstem") || t.startsWith("empfohlen ab")) return 3;
  if (t.startsWith("ab ")) return 2; // ab Jan. 2027, ab erster Gehaltszahlung
  if (t.startsWith("innerhalb 3 monate")) return 4;
  if (t.startsWith("später") || t === "laufend") return 5;
  return 0; // entfällt
};

for (const z of zeilen) {
  if (z.startsWith("## ")) kategorie = ""; // nur die Tabellen in den zehn Kategorien
  const k = z.match(/^### (\d+)\. (.+)$/);
  if (k) {
    kategorie = k[2].trim();
    nr = Number(k[1]);
    continue;
  }
  if (!kategorie || !z.startsWith("| ") || z.startsWith("| Unterlage") || z.startsWith("|---")) continue;
  const zellen = z.split("|").slice(1, -1).map((c) => c.trim());
  if (zellen.length !== 5) continue;
  const [titel, status, grundlage, wer, prioritaet] = zellen;
  eintraege.push({ key: `${nr}-${eintraege.filter((e) => e.kategorie === kategorie).length + 1}`, kategorie, titel, status: status.replace(/\*/g, ""), grundlage, wer, prioritaet, etappe: etappe(prioritaet) });
}

fs.writeFileSync("src/lib/unterlagen-daten.json", JSON.stringify(eintraege, null, 2) + "\n");
console.log(`${eintraege.length} Unterlagen in ${new Set(eintraege.map((e) => e.kategorie)).size} Kategorien`);
const proEtappe = [0, 1, 2, 3, 4, 5].map((e) => eintraege.filter((x) => x.etappe === e).length);
console.log("je Etappe (0 = entfällt):", proEtappe.join(" / "));
