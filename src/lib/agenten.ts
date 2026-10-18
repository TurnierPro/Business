// Übersicht aller Agenten: Wer erledigt was automatisch, und wo entscheidet ein Mensch?
// Grundregel: Alles, was zum Kunden oder nach draußen geht, läuft durch Qualitätskontrolle und Freigabe.

export type Agent = { name: string; ausloeser: string; macht: string; ergebnis: string; freigabe: string };

export const AGENTEN: Agent[] = [
  { name: "Research-Agent", ausloeser: "Montag 6 Uhr oder Knopf", macht: "Findet Betriebe, bewertet sie (Score), prüft Sperrliste und Doppelte", ergebnis: "Neue Leads", freigabe: "Daniel stuft ein" },
  { name: "Vorbereitungs-Agent", ausloeser: "Lead „interessant“", macht: "Online-Check, Demo-Website, Gesprächsleitfaden, Akquise-Brief", ergebnis: "Brief im Postausgang", freigabe: "Brief freigeben" },
  { name: "Protokoll-Agent", ausloeser: "Aufnahme vom Termin", macht: "Abschrift (Whisper), Protokoll, Maßnahmenplan, Paketempfehlung, Angebot, Begleit-Mail", ergebnis: "Angebot im Postausgang", freigabe: "Angebot freigeben" },
  { name: "Rechnungs-Agent", ausloeser: "Unterschrift, Livegang, Monatsanfang", macht: "Anzahlung, Schlussrechnung, Betreuungsrechnungen mit fortlaufender Nummer", ergebnis: "Rechnung im Postausgang", freigabe: "Rechnung freigeben (über 10.000 €: beide)" },
  { name: "Mahn-Agent", ausloeser: "Täglich 8 Uhr", macht: "Findet Rechnungen, die 14 Tage offen sind, schreibt eine freundliche Erinnerung", ergebnis: "Erinnerung im Postausgang", freigabe: "Erinnerung freigeben" },
  { name: "Bau-Agent", ausloeser: "Inhalte im Kundenportal", macht: "Baut die Website aus Vorlage und Inhalten, prüft sie in 10 Punkten", ergebnis: "Livegang im Postausgang", freigabe: "Max gibt Livegang frei" },
  { name: "Beleg-Agent", ausloeser: "Beleg hochgeladen", macht: "Liest Lieferant, Datum, Betrag, Steuer und Kategorie aus", ergebnis: "Ausgabe „bitte prüfen“", freigabe: "Werte prüfen und speichern" },
  { name: "Steuerberater-Agent", ausloeser: "Quartalsanfang oder Knopf", macht: "Finanzbericht des letzten Quartals als PDF, Mail an den Steuerberater", ergebnis: "Mail im Postausgang", freigabe: "Bericht freigeben" },
  { name: "Qualitätskontrolle", ausloeser: "Jeder neue oder geänderte Eintrag im Postausgang", macht: "Prüft Adresse, Anhänge, Zahlen, Stimme, Sperrliste, Website; KI-Prüfer als zweites Paar Augen", ergebnis: "OK, Hinweise oder blockiert", freigabe: "Ohne Prüfung keine Freigabe" },
  { name: "Wächter", ausloeser: "Alle 10 Minuten, täglich, sonntags", macht: "Erreichbarkeit, Backup, Probe-Rücksicherung, Aufräumen, Tagesbericht aufs Handy", ergebnis: "Meldungen", freigabe: "– (nur intern)" },
];
