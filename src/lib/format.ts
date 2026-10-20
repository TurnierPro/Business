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
  ticket_antwort: "Antwort auf Ticket",
  portal_zugang: "Zugang zum Kundenportal",
  umzug_anleitung: "Domain umstellen: Anleitung",
  umzug_fertig: "Domain umgestellt, Kündigungshinweis",
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
  umzugsanleitung: "Anleitung Domain-Umstellung",
};

/** „2026-10-21“ + „09:00“ als deutsche Zeit (Sommer/Winter beachtet), egal in welcher Zeitzone der Server läuft. */
export function berlinZeit(tag: string, uhr = "09:00"): Date {
  const roh = new Date(`${tag}T${uhr}:00Z`);
  const teile = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Berlin", hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(roh);
  const w = (t: string) => Number(teile.find((p) => p.type === t)?.value);
  const alsBerlin = Date.UTC(w("year"), w("month") - 1, w("day"), w("hour") % 24, w("minute"));
  return new Date(roh.getTime() - (alsBerlin - roh.getTime()));
}

/** Heute + n Tage um eine Uhrzeit, deutsche Zeit. */
export function inTagen(n: number, uhr = "09:00"): Date {
  const tag = new Date(Date.now() + n * 864e5).toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
  return berlinZeit(tag, uhr);
}
