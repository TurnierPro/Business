import { aktuellerBenutzer } from "@/lib/auth";
import { auswertung, csv, zeitraum } from "@/lib/finanzen";

export async function GET(req: Request) {
  if (!(await aktuellerBenutzer())) return new Response("Nicht angemeldet", { status: 401 });
  const p = new URL(req.url).searchParams;
  const z = zeitraum(p.get("z") ?? undefined);
  const art = p.get("art") === "einnahmen" ? "einnahmen" : "ausgaben";
  return new Response(csv(await auswertung(z), art), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="stelax-${art}-${z.key}.csv"`, "Cache-Control": "no-store" },
  });
}
