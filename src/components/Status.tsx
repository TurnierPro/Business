// Ein Wort und eine Farbe für jeden Zustand. Farbe nie allein.

const TEXTE: Record<string, [string, "" | "ok" | "warten" | "fehler"]> = {
  neu: ["neu", "warten"],
  interessant: ["interessant", "warten"],
  nicht_interessant: ["nicht interessant", ""],
  angeschrieben: ["angeschrieben", ""],
  termin: ["Termin", "warten"],
  angebot: ["Angebot", "warten"],
  kunde: ["Kunde", "ok"],
  gesperrt: ["gesperrt", "fehler"],
  zur_freigabe: ["wartet auf Freigabe", "warten"],
  freigegeben: ["freigegeben", "ok"],
  versendet: ["versendet", "ok"],
  abgelehnt: ["abgelehnt", "fehler"],
  wartet: ["wartet", "warten"],
  laeuft: ["läuft", "warten"],
  fertig: ["fertig", "ok"],
  fehler: ["Fehler", "fehler"],
  entwurf: ["Entwurf", ""],
  unterschrieben: ["unterschrieben", "ok"],
  angezahlt: ["angezahlt", "ok"],
  abgeschlossen: ["abgeschlossen", "ok"],
  inhalte: ["wartet auf Inhalte", "warten"],
  bau: ["wird gebaut", "warten"],
  pruefung: ["Prüfung nicht bestanden", "fehler"],
  bereit: ["bereit für Livegang", "warten"],
  live: ["live", "ok"],
  hochgeladen: ["hochgeladen", "warten"],
  transkribiert: ["transkribiert", "warten"],
  ausgewertet: ["ausgewertet", "ok"],
  offen: ["offen", "warten"],
  bezahlt: ["bezahlt", "ok"],
  echt: ["echt", "ok"],
  simulator: ["Simulator", "warten"],
  keine: ["keine", "ok"],
  bestanden: ["OK", "ok"],
  nur_lokal: ["nur lokal", "warten"],
};

export function Status({ wert }: { wert: string }) {
  const [text, art] = TEXTE[wert] ?? [wert, ""];
  return <span className={`status ${art}`}>{text}</span>;
}
