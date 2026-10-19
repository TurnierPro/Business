import { projektFuerHost } from "@/lib/ablauf/umzug";

// Für Caddy „on-demand TLS“: Ein Zertifikat gibt es nur für Domains, die zu einem Live-Projekt gehören.
export async function GET(req: Request) {
  const domain = new URL(req.url).searchParams.get("domain") ?? "";
  return new Response(null, { status: (await projektFuerHost(domain)) ? 200 : 404 });
}
