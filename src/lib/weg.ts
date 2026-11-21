// Der ganze Weg eines Betriebs in 9 Schritten: vom Fund bis zur Betreuung.
// Gleiche Sicht wie der Fortschritt im Kundenportal; intern mit dem, was gerade zu tun ist.

export const WEG = ["Gefunden", "Angeschrieben", "Gespräch vor Ort", "Angebot", "Unterschrift", "Anzahlung", "Inhalte vom Kunden", "Vorschau und Abnahme", "Live und Betreuung"] as const;

// Was im jeweiligen Schritt gerade ansteht (für Listen und Kopfkarte)
export const JETZT = ["Einstufen", "Brief geht raus", "Besuch vor Ort", "Angebot erstellen", "Unterschrift steht aus", "Erste Rate offen", "Wartet auf Inhalte", "Bau, Vorschau und Abnahme", "Livegang"] as const;

type B = { status: string };
type A = { status: string } | null | undefined;
type P = { status: string; abnahmeStatus?: string | null; aboAb?: Date | null } | null | undefined;

/** Index des aktuellen Schritts in WEG (alles davor ist erledigt); WEG.length = alles erledigt. */
export function wegIndex(b: B, angebot?: A, projekt?: P): number {
  if (projekt) {
    if (projekt.status === "inhalte") return 6;
    if (["bau", "pruefung"].includes(projekt.status)) return 7;
    if (projekt.status === "bereit") return ["abgenommen", "vorbehalt", "fiktion"].includes(projekt.abnahmeStatus ?? "") ? 8 : 7;
    if (projekt.status === "live" || projekt.status === "beendet") return WEG.length;
  }
  if (angebot?.status === "angezahlt" || angebot?.status === "abgeschlossen") return 6;
  if (angebot?.status === "unterschrieben") return 5;
  if (angebot && ["entwurf", "versendet"].includes(angebot.status)) return 4;
  switch (b.status) {
    case "angeschrieben":
      return 2;
    case "termin":
      return 3;
    case "angebot":
      return 4;
    case "kunde":
      return WEG.length;
    case "interessant":
      return 1;
    default:
      return 0;
  }
}

/** Klartext für Listen: was gerade ansteht, z. B. „Unterschrift steht aus“. */
export function wegText(index: number): string {
  return index >= WEG.length ? "Betreuung läuft" : JETZT[index];
}

export const wegProzent = (index: number) => Math.round((Math.min(index, WEG.length) / WEG.length) * 100);
