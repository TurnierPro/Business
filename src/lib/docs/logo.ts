// Gezeichnete Wortmarke NEXOVA: gleich starke Linien, A ohne Querstrich (Λ), V und Λ als Spiegelpaar, X in der Mitte in Messing.
// Platzhalter bis zur Reinzeichnung aus logo.py; Proportionen nach Markenhandbuch.

const B = 40; // Glyphenbreite
const H = 56; // Versalhöhe
const G = 22; // Sperrung

const GLYPHEN: Record<string, string> = {
  N: `M0 ${H} V0 L${B} ${H} V0`,
  E: `M${B} 0 H0 V${H} H${B} M0 ${H / 2} H${B - 8}`,
  X: `M0 0 L${B} ${H} M${B} 0 L0 ${H}`,
  O: `M0 0 H${B} V${H} H0 Z`,
  V: `M0 0 L${B / 2} ${H} L${B} 0`,
  A: `M0 ${H} L${B / 2} 0 L${B} ${H}`,
};
const WORT = "NEXOVA";
const AKZENT = WORT.indexOf("X");

export function logoSvg(o: { text: string; akzent: string; consulting?: boolean; hoehe?: number; titel?: string }): string {
  const buchstaben = WORT.split("");
  const breite = buchstaben.length * B + (buchstaben.length - 1) * G;
  const pfade = buchstaben
    .map((z, i) => {
      const farbe = i === AKZENT ? o.akzent : o.text;
      return `<path d="${GLYPHEN[z]}" transform="translate(${i * (B + G)} 0)" stroke="${farbe}" stroke-width="5" fill="none" stroke-linecap="square" stroke-linejoin="miter" stroke-miterlimit="1.5"/>`;
    })
    .join("");
  const extra = o.consulting
    ? `<text x="${breite / 2}" y="${H + 30}" text-anchor="middle" font-family="Archivo, sans-serif" font-size="15" font-weight="500" letter-spacing="16.5" fill="${o.text}">CONSULTING</text>`
    : "";
  const vbH = o.consulting ? H + 40 : H + 8;
  const hoehe = o.hoehe ?? 28;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-4 -4 ${breite + 8} ${vbH}" height="${hoehe}" role="img" aria-label="${o.titel ?? "Nexova Consulting"}">${pfade}${extra}</svg>`;
}
