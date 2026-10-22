import type { Handler } from "./warteschlange";
import { vorbereitung, wochenlauf } from "../ablauf/akquise";
import { auswertung, transkription } from "../ablauf/verkauf";
import { bau } from "../ablauf/lieferung";
import { versende, qualitaetskontrolle } from "../ablauf/postausgang";
import { aufraeumen, backup, erreichbarkeit, ruecksicherung, tagesbericht } from "../ablauf/betrieb";

export const HANDLER: Record<string, Handler> = {
  wochenlauf: () => wochenlauf(),
  vorbereitung: (d) => vorbereitung(Number(d.betriebId)),
  transkription: (d) => transkription(Number(d.terminId)),
  auswertung: (d) => auswertung(Number(d.terminId)),
  bau: (d) => bau(Number(d.projektId)),
  versand: (d) => versende(Number(d.eintragId)),
  qualitaetskontrolle: (d) => qualitaetskontrolle(Number(d.eintragId)),
  backup: () => backup(),
  ruecksicherung: () => ruecksicherung(),
  erreichbarkeit: () => erreichbarkeit(),
  aufraeumen: () => aufraeumen(),
  tagesbericht: () => tagesbericht(),
  betreuungsrechnungen: async () => (await import("../ablauf/finanzagenten")).betreuungsrechnungen(),
  zahlungserinnerungen: async () => (await import("../ablauf/finanzagenten")).zahlungserinnerungen(),
  steuerberater: async () => (await import("../ablauf/finanzagenten")).steuerberaterBericht(),
  beleg: async (d) => (await import("../finanzen")).belegLesen(Number(d.ausgabeId)),
  beispieldaten: async () => (await import("../beispiele")).beispieleLaden(),
  abnahmefiktion: async () => (await import("../ablauf/vertrag")).abnahmefiktion(),
  vertragsende: async () => (await import("../ablauf/vertrag")).vertragsende(),
  monatsreports: async () => (await import("../ablauf/berichte")).monatsreports(),
  umzug_bestand: async (d) => (await import("../ablauf/umzug")).bestandsaufnahme(Number(d.projektId)),
  antwortentwurf: async (d) => (await import("../ablauf/nachrichten")).antwortEntwerfen(Number(d.nachrichtId)),
  umzug_pruefen: async () => (await import("../ablauf/umzug")).umstellungPruefen(),
};

export const JOB_NAMEN: Record<string, string> = {
  wochenlauf: "Wochenlauf Leads",
  vorbereitung: "Check, Demo und Brief",
  transkription: "Termin transkribieren",
  auswertung: "Protokoll und Angebot",
  bau: "Seite bauen und prüfen",
  versand: "Versand",
  antwortentwurf: "Antwortentwurf",
  qualitaetskontrolle: "Qualitätskontrolle",
  backup: "Backup",
  ruecksicherung: "Probe-Rücksicherung",
  erreichbarkeit: "Erreichbarkeit",
  aufraeumen: "Aufräumen",
  tagesbericht: "Tagesbericht",
  betreuungsrechnungen: "Betreuungsrechnungen",
  zahlungserinnerungen: "Zahlungserinnerungen",
  steuerberater: "Bericht an Steuerberater",
  beleg: "Beleg auslesen",
  beispieldaten: "Beispieldaten laden",
  abnahmefiktion: "Abnahme nach Fristablauf",
  vertragsende: "Vertragsende",
  monatsreports: "Monatsreports",
  umzug_bestand: "Domain prüfen und alte Seite sichern",
  umzug_pruefen: "Domain-Umstellung prüfen",
};
