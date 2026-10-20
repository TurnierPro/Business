import { kalender } from "@/lib/kalender";

export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const inhalt = await kalender((await params).token);
  if (!inhalt) return new Response("Nicht gefunden", { status: 404 });
  return new Response(inhalt, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "no-store" } });
}
