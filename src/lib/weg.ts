// Der ganze Weg eines Betriebs in einer Leiste: vom Fund bis zur Betreuung.
// Gleiche Sicht für Betriebsseite, Leads-Liste und Pipeline (intern), angelehnt an die Schritte im Kundenportal.

export const WEG = ["Gefunden", "Angeschrieben", "Termin", "Angebot", "Unterschrieben", "Anzahlung", "Inhalte", "Vorschau und Abnahme", "Live", "Betreuung"] as const;

type B = { status: string };
type A = { status: string } | null | undefined;
type P = { status: string; abnahmeStatus?: string | null; aboAb?: Date | null } | null | undefined;

/** Index des aktuellen Schritts in WEG (alles davor ist erledigt). */
export function wegIndex(b: B, angebot?: A, projekt?: P): number {
  if (projekt) {
    if (projekt.status === "inhalte") return 6;
    if (["bau", "pruefung", "bereit"].includes(projekt.status)) return 7;
    if (projekt.status === "live" || projekt.status === "beendet") return WEG.length; // alles erledigt, Betreuung läuft
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

/** Kurztext für Listen: „Schritt 4 von 10 · Angebot“. */
export function wegText(index: number): string {
  if (index >= WEG.length) return "Betreuung läuft";
  return `${index + 1} von ${WEG.length} · ${WEG[index]}`;
}

export const wegProzent = (index: number) => Math.round((Math.min(index, WEG.length) / WEG.length) * 100);
