export const datum = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" }) : "–";

export const datumZeit = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" }) : "–";

export const ZWECK: Record<string, string> = {
  akquise_brief: "Akquise-Brief",
  angebot: "Angebot",
  rechnung: "Rechnung (Anzahlung)",
  schlussrechnung: "Schlussrechnung",
  kickoff: "Start-Mail mit Portal-Link",
  livegang: "Livegang",
  test: "Test",
};

export const KANAL: Record<string, string> = { mail: "E-Mail", brief: "Brief", livegang: "Livegang" };

export const DOKART: Record<string, string> = {
  brief: "Brief",
  angebot: "Angebot",
  check_report: "Online-Check",
  leitfaden: "Gesprächsleitfaden",
  protokoll: "Protokoll",
  rechnung: "Rechnung",
};
