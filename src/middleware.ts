import { NextResponse, type NextRequest } from "next/server";

// Schneller Vorabcheck: ohne Sitzungs-Cookie direkt zur Anmeldung.
// Die echte Prüfung der Signatur passiert serverseitig in jeder geschützten Seite.
const OFFEN = ["/login", "/vorschau", "/portal", "/api/gesundheit", "/_next", "/favicon"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (OFFEN.some((p) => pathname.startsWith(p))) return NextResponse.next();
  if (!req.cookies.get("stelax_sitzung")) return NextResponse.redirect(new URL("/login", req.url));
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image).*)"] };
