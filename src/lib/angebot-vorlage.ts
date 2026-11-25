// Angebotsvorlage: die festen Texte im Angebot und in der Begleit-Mail.
// Werkseinstellung hier (aus dem Baukasten, Abschnitt Konditionen); Änderungen kommen aus Stammdaten → Angebotsvorlage
// (Tabelle katalog_eintraege, art „vorlage“). Rechtliche Festwerte (Fristen, Laufzeit, Stundensatz) stehen in recht.ts
// und werden über Platzhalter eingesetzt. Jedes Angebot speichert die Vorlage beim Erstellen (eingefroren).

export type AngebotVorlage = {
  gueltigTage: number;
  einstieg: string; // Standard, wenn kein persönlicher Einstieg eingetragen ist; {betrieb}
  ablauf: string[]; // „So läuft es ab“; Platzhalter {wochen} {erste_rate_tage} {stundensatz} {laufzeit}
  unterschreiben: string; // Kasten „Unterschreiben“ am Ende von Seite 2
  mail: string; // Begleit-Mail; {anrede} {einstieg} {anhaenge} {portallink}
};

export const WERK_ANGEBOT_VORLAGE: AngebotVorlage = {
  gueltigTage: 30,
  // Neutral: stimmt auch, wenn vorher kein Gespräch erfasst ist (sonst behauptet die Mail etwas, das nicht passiert ist)
  einstieg: "anbei erhalten Sie unser Angebot für {betrieb} mit den passenden Bausteinen.",
  ablauf: [
    "Zahlung: 50 % bei Unterschrift, fällig {erste_rate_tage} Tage nach Vertragsschluss und nicht vor Arbeitsbeginn; 50 % beim Livegang nach Ihrer Abnahme. Keine Ratenzahlung.",
    "Monatsbeitrag per SEPA-Lastschrift mit Vorabankündigung 5 Kalendertage vor dem Einzug; bis der Einzug eingerichtet ist, per Überweisung.",
    "Online {wochen} Wochen nach Erhalt Ihrer vollständigen Inhalte. Klappt das nicht, ist ein Monatsbeitrag kostenlos.",
    "Beim Livegang: Lighthouse ≥ 95 und Barrierefreiheit nach WCAG 2.2 AA, sonst bessern wir kostenlos nach.",
    "Änderungen vor der Abnahme und über das monatliche Kontingent hinaus: {stundensatz} netto je Stunde, nur nach Ihrer Freigabe in Textform.",
    "Die Domain gehört Ihnen, den Auth-Code halten wir nie zurück. Texte und Fotos gehören Ihnen ab Zahlung, Code und Design nach {laufzeit} Monaten.",
    "Wo Website, Formulare und Kundendaten liegen, steht in der Liste der Unterauftragsverarbeiter im AV-Vertrag.",
  ],
  unterschreiben: "Den Rahmenvertrag und je Baustein einen Leistungsschein unterschreiben Sie beim Termin mit Daniel Lück auf dem Tablet. Danach bekommen Sie die Rechnung über die erste Rate. Anlage: Leistungsbeschreibung.",
  mail: "{anrede}\n\n{einstieg}\n\nIm Anhang finden Sie {anhaenge}. Alles liegt auch in Ihrem Kundenportal. Dort sehen Sie jederzeit, wo Ihr Projekt steht. Unterschrieben wird beim Termin mit Daniel Lück auf dem Tablet.\n{portallink}\n\nBei Fragen rufen Sie mich gern an.\n\nMit freundlichen Grüßen\nDaniel Lück\nLevarex Consulting",
};

/** Aktuelle Vorlage (wird von katalogLaden() mit den Stammdaten überschrieben). */
export const ANGEBOT_VORLAGE: AngebotVorlage = structuredClone(WERK_ANGEBOT_VORLAGE);

export function setzeAngebotVorlage(v: Partial<AngebotVorlage> | undefined): void {
  Object.assign(ANGEBOT_VORLAGE, structuredClone(WERK_ANGEBOT_VORLAGE), v ?? {});
}

/** Platzhalter {name} ersetzen; unbekannte bleiben stehen (fallen in der Vorschau auf). */
export const fuelle = (text: string, werte: Record<string, string>) => text.replace(/\{(\w+)\}/g, (m, k: string) => werte[k] ?? m);

export const PLATZHALTER: Record<string, string> = {
  "{betrieb}": "Name des Betriebs",
  "{wochen}": "Wochen bis online (aus dem Webauftritt)",
  "{erste_rate_tage}": "Fälligkeit der ersten Rate (recht.ts)",
  "{stundensatz}": "Stundensatz für Änderungen (recht.ts)",
  "{laufzeit}": "Laufzeit in Monaten (recht.ts)",
  "{anrede}": "Sehr geehrte Frau … / Sehr geehrter Herr …",
  "{einstieg}": "Einstieg aus dem Angebot",
  "{anhaenge}": "„das Angebot“ bzw. „das Protokoll mit Maßnahmenplan und das Angebot“",
  "{portallink}": "persönlicher Link zum Kundenportal",
};
