import type { Handler } from "./warteschlange";
import { vorbereitung, wochenlauf } from "../ablauf/akquise";
import { auswertung, transkription } from "../ablauf/verkauf";
import { bau } from "../ablauf/lieferung";
import { versende } from "../ablauf/postausgang";
import { aufraeumen, backup, erreichbarkeit, ruecksicherung, tagesbericht } from "../ablauf/betrieb";

export const HANDLER: Record<string, Handler> = {
  wochenlauf: () => wochenlauf(),
  vorbereitung: (d) => vorbereitung(Number(d.betriebId)),
  transkription: (d) => transkription(Number(d.terminId)),
  auswertung: (d) => auswertung(Number(d.terminId)),
  bau: (d) => bau(Number(d.projektId)),
  versand: (d) => versende(Number(d.eintragId)),
  backup: () => backup(),
  ruecksicherung: () => ruecksicherung(),
  erreichbarkeit: () => erreichbarkeit(),
  aufraeumen: () => aufraeumen(),
  tagesbericht: () => tagesbericht(),
};

export const JOB_NAMEN: Record<string, string> = {
  wochenlauf: "Wochenlauf Leads",
  vorbereitung: "Check, Demo und Brief",
  transkription: "Termin transkribieren",
  auswertung: "Protokoll und Angebot",
  bau: "Seite bauen und prüfen",
  versand: "Versand",
  backup: "Backup",
  ruecksicherung: "Probe-Rücksicherung",
  erreichbarkeit: "Erreichbarkeit",
  aufraeumen: "Aufräumen",
  tagesbericht: "Tagesbericht",
};
