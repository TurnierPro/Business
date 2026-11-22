import { demoDatei } from "./demos";

// Auslieferung einer Demo-Datei. Die Seiten laufen in einer abgeschotteten Umgebung (CSP „sandbox“ ohne allow-same-origin):
// eigene Herkunft, keine Cookies, kein Zugriff auf Portal oder Levarex OS, keine Verbindungen nach außen.
export const CSP_DEMO =
  "sandbox allow-scripts allow-forms allow-popups allow-modals; default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; media-src 'self'; connect-src 'none'; form-action 'none'; base-uri 'self'; frame-ancestors 'self'";

export function demoAntwort(id: number, pfad: string[]): Response {
  const d = demoDatei(id, pfad);
  if (!d) return new Response("Nicht gefunden", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  return new Response(new Uint8Array(d.daten), {
    headers: {
      "Content-Type": d.typ,
      "Content-Security-Policy": CSP_DEMO,
      // Die abgeschottete Seite hat eine eigene Herkunft: Schriften und Skripte brauchen dafür die CORS-Freigabe
      "Access-Control-Allow-Origin": "*",
      "X-Robots-Tag": "noindex, nofollow",
      "Cache-Control": "private, max-age=300",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
