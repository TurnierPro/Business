import { json } from "@/lib/api";
import { openapi } from "@/lib/openapi";
import { basisUrl } from "@/lib/ablauf/gemeinsam";

// Öffentliche Beschreibung der Schnittstelle (ohne Daten), z. B. für n8n.
export function GET() {
  return json(openapi(basisUrl()));
}
