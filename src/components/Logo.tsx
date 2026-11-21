import { logo, type LogoArt } from "@/lib/docs/logo";

/** Levarex-Logo für die dunkle Oberfläche (Original-Datei). */
export function Logo({ hoehe = 22, art = "ohne-consulting" }: { hoehe?: number; art?: LogoArt }) {
  return <span className="logo-bild" dangerouslySetInnerHTML={{ __html: logo({ art, thema: "dunkel", hoehe }) }} />;
}
