import { NextResponse, type NextRequest } from "next/server";

// Schneller Vorabcheck: ohne Sitzungs-Cookie direkt zur Anmeldung.
// Die echte Prüfung der Signatur passiert serverseitig in jeder geschützten Seite.
const OFFEN = ["/login", "/vorschau", "/portal", "/api/gesundheit", "/api/stripe", "/api/tls-erlaubt", "/_next", "/favicon"];

// Hosts von Stelax OS selbst. Jeder andere Host ist eine Kunden-Domain und bekommt die Kunden-Website.
function eigenerHost(host: string): boolean {
  const eigene = [process.env.BASE_URL, ...(process.env.STELAX_HOSTS ?? "").split(",")]
    .map((x) => (x ?? "").trim().replace(/^https?:\/\//, "").split("/")[0].split(":")[0].toLowerCase())
    .filter(Boolean);
  return !host || host === "localhost" || /^[\d.]+$/.test(host) || eigene.includes(host);
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const roh = (req.headers.get("host") ?? "").toLowerCase();
  const host = roh.startsWith("[") ? "" : roh.split(":")[0]; // IPv6-Adresse: immer Stelax OS
  if (!eigenerHost(host) && !pathname.startsWith("/_next")) {
    return NextResponse.rewrite(new URL(`/kunde-seite/${encodeURIComponent(host)}${pathname === "/" ? "" : pathname}${req.nextUrl.search}`, req.url));
  }
  if (OFFEN.some((p) => pathname.startsWith(p))) return NextResponse.next();
  if (!req.cookies.get("stelax_sitzung")) return NextResponse.redirect(new URL("/login", req.url));
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image).*)"] };
