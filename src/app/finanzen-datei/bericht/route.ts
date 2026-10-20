import { aktuellerBenutzer } from "@/lib/auth";
import { auswertung, zeitraum } from "@/lib/finanzen";
import { finanzbericht } from "@/lib/docs/finanzbericht";
import { htmlZuPdf } from "@/lib/docs/render";

export async function GET(req: Request) {
  if (!(await aktuellerBenutzer())) return new Response("Nicht angemeldet", { status: 401 });
  const z = zeitraum(new URL(req.url).searchParams.get("z") ?? undefined);
  const pdf = await htmlZuPdf(finanzbericht(z, await auswertung(z)));
  return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="nexova-finanzbericht-${z.key}.pdf"`, "Cache-Control": "no-store" } });
}
