import { logoSvg } from "@/lib/docs/logo";
import { marke } from "@/lib/marke";

export function Logo({ hoehe = 22 }: { hoehe?: number }) {
  return <span aria-label="Nexova" dangerouslySetInnerHTML={{ __html: logoSvg({ text: marke.dunkel.text, akzent: marke.dunkel.akzent, hoehe }) }} />;
}
