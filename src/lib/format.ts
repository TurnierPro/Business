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
  betreuungsrechnung: "Rechnung Betreuung",
  zahlungserinnerung: "Zahlungserinnerung",
  finanzbericht: "Bericht an Steuerberater",
  schlusszahlung: "Schlusszahlung einziehen (Stripe)",
  betreuung_start: "Betreuung starten (Stripe)",
  auftragsbestaetigung: "Auftragsbestätigung",
  abnahme_aufforderung: "Bitte um Abnahme",
  abnahme_bestaetigung: "Abnahmeprotokoll",
  mahnung1: "1. Mahnung",
  mahnung2: "Letzte Mahnung",
  monatsreport: "Monatsreport",
  kuendigung: "Kündigungsbestätigung",
  betreuung_ende: "Betreuung beenden (Stripe)",
  test: "Test",
};

export const KANAL: Record<string, string> = { mail: "E-Mail", brief: "Brief", livegang: "Livegang", zahlung: "Zahlung" };

export const DOKART: Record<string, string> = {
  brief: "Brief",
  angebot: "Angebot",
  check_report: "Online-Check",
  leitfaden: "Gesprächsleitfaden",
  protokoll: "Protokoll",
  rechnung: "Rechnung",
  finanzbericht: "Finanzbericht",
  auftragsbestaetigung: "Auftragsbestätigung",
  abnahmeprotokoll: "Abnahmeprotokoll",
  monatsreport: "Monatsreport",
};
