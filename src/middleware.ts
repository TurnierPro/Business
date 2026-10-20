import { NextResponse, type NextRequest } from "next/server";

// Schneller Vorabcheck: ohne Sitzungs-Cookie direkt zur Anmeldung.
// Die echte Prüfung der Signatur passiert serverseitig in jeder geschützten Seite.
const OFFEN = ["/login", "/vorschau", "/portal", "/api/gesundheit", "/api/stripe", "/api/tls-erlaubt", "/api/v1", "/kalender", "/_next", "/favicon"];

// Hosts von Stelax OS selbst. Jeder andere Host ist eine Kunden-Domain und bekommt die Kunden-Website.
function eigenerHost(host: string): boolean {
  const eigene = [process.env.BASE_URL, ...(process.env.STELAX_HOSTS ?? "").split(",")]
    .map((x) => (x ?? "").trim().replace(/^https?:\/\//, "").split("/")[0].split(":")[0].toLowerCase())
    .filter(Boolean);
  return !host || host === "localhost" || /^[\d.]+$/.test(host) || eigene.includes(host);
}

const PRODUKTION = process.env.NODE_ENV === "production";
// HTTPS-Pflicht nur, wenn die App wirklich unter https läuft (nicht beim lokalen Start auf dem Mac)
const HTTPS = PRODUKTION && (process.env.BASE_URL ?? "").startsWith("https://");

// Gemeinsame Sicherheits-Header für jede Antwort
function grundHeader(res: NextResponse, o: { referrer?: string } = {}): NextResponse {
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", o.referrer ?? "strict-origin-when-cross-origin");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(self), geolocation=(), payment=(), usb=()");
  res.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  if (HTTPS) res.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  return res;
}

// Kunden-Websites haben kein JavaScript: alles verbieten, was nicht gebraucht wird
const CSP_KUNDENSEITE = "default-src 'none'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'self'";

function cspApp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'${PRODUKTION ? "" : " 'unsafe-eval'"}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "media-src 'self' blob:",
    "frame-src 'self'",
    "frame-ancestors 'self'",
    "form-action 'self' https://checkout.stripe.com",
    "base-uri 'self'",
    "object-src 'none'",
    ...(HTTPS ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

export function middleware(req: NextRequest) {
  const res = pruefe(req);
  const { pathname } = req.nextUrl;
  // Portal-Links sind geheim: nie als Referrer an fremde Seiten weitergeben
  return grundHeader(res, { referrer: pathname.startsWith("/portal") ? "no-referrer" : undefined });
}

function pruefe(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;
  const roh = (req.headers.get("host") ?? "").toLowerCase();
  const host = roh.startsWith("[") ? "" : roh.split(":")[0]; // IPv6-Adresse: immer Stelax OS
  if (!eigenerHost(host) && !pathname.startsWith("/_next")) {
    const r = NextResponse.rewrite(new URL(`/kunde-seite/${encodeURIComponent(host)}${pathname === "/" ? "" : pathname}${req.nextUrl.search}`, req.url));
    r.headers.set("Content-Security-Policy", CSP_KUNDENSEITE);
    r.headers.set("X-Frame-Options", "SAMEORIGIN");
    return r;
  }
  // Nonce je Aufruf: nur Skripte mit dieser Zufallszahl dürfen laufen (Next.js übernimmt sie selbst)
  const nonce = btoa(crypto.randomUUID());
  const csp = pathname.startsWith("/vorschau") ? CSP_KUNDENSEITE : cspApp(nonce);
  const kopf = new Headers(req.headers);
  kopf.set("x-nonce", nonce);
  kopf.set("Content-Security-Policy", csp);
  const weiter = (r: NextResponse) => {
    r.headers.set("Content-Security-Policy", csp);
    r.headers.set("X-Frame-Options", "SAMEORIGIN");
    return r;
  };
  if (OFFEN.some((p) => pathname.startsWith(p))) return weiter(NextResponse.next({ request: { headers: kopf } }));
  if (!req.cookies.get("stelax_sitzung")) return NextResponse.redirect(new URL("/login", req.url));
  return weiter(NextResponse.next({ request: { headers: kopf } }));
}

export const config = { matcher: ["/((?!_next/static|_next/image).*)"] };
