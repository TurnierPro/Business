// Übersicht aller Agenten: Wer erledigt was automatisch, und wo entscheidet ein Mensch?
// Grundregel: Alles, was zum Kunden oder nach draußen geht, läuft durch Qualitätskontrolle und Freigabe.

export type Agent = { name: string; ausloeser: string; macht: string; ergebnis: string; freigabe: string };

export const AGENTEN: Agent[] = [
  { name: "Research-Agent", ausloeser: "Montag 6 Uhr oder Knopf", macht: "Findet Betriebe, bewertet sie (Score), prüft Sperrliste und Doppelte", ergebnis: "Neue Leads", freigabe: "Daniel stuft ein" },
  { name: "Vorbereitungs-Agent", ausloeser: "Lead „interessant“", macht: "Online-Check, Demo-Website, Gesprächsleitfaden, Akquise-Brief", ergebnis: "Brief im Postausgang", freigabe: "Brief freigeben" },
  { name: "Protokoll-Agent", ausloeser: "Aufnahme vom Termin", macht: "Abschrift (Whisper), Protokoll, Maßnahmenplan, Paketempfehlung, Angebot, Begleit-Mail", ergebnis: "Angebot im Postausgang", freigabe: "Angebot freigeben" },
  { name: "Vertrags-Agent", ausloeser: "Annahme im Kundenportal", macht: "Speichert Nachweis (Name, Zeit, AGB-Version, Unternehmer), schreibt die Auftragsbestätigung", ergebnis: "Auftragsbestätigung im Postausgang", freigabe: "Auftragsbestätigung freigeben" },
  { name: "Rechnungs-Agent", ausloeser: "Annahme, Abnahme, Monatsanfang", macht: "Anzahlung, Schlussrechnung (minus Anzahlung), Betreuung; fortlaufende Nummer, zahlbar bis Datum", ergebnis: "Rechnung im Postausgang", freigabe: "Rechnung freigeben (über 10.000 €: beide)" },
  { name: "Umzugs-Agent", ausloeser: "Kunde gibt bestehende Domain an, alle 15 Minuten", macht: "DNS-Bestandsaufnahme (E-Mail, Nachweise, Risiken), alte Seite sichern, 301-Weiterleitungen, Anleitung für den Kunden, prüft die Umstellung, dann Kündigungshinweis und Abnahme", ergebnis: "Anleitung und Hinweis im Postausgang", freigabe: "Beides freigeben; Providerwechsel macht Max" },
  { name: "Abnahme-Agent", ausloeser: "Livegang, täglich 5 Uhr", macht: "Bittet um Abnahme mit 14 Tagen Frist; nach Ablauf ohne Mangel gilt sie als erklärt; Abnahmeprotokoll", ergebnis: "Abnahmeprotokoll und Schlusszahlung im Postausgang", freigabe: "Beides freigeben" },
  { name: "Mahn-Agent", ausloeser: "Täglich 8 Uhr", macht: "Erinnerung, 1. Mahnung mit Verzugszins und 40-€-Pauschale, letzte Mahnung", ergebnis: "Mahnung im Postausgang", freigabe: "Mahnung freigeben" },
  { name: "Report-Agent", ausloeser: "Monatsanfang", macht: "Monatsreport je Kunde: Anfragen über die Website, Erreichbarkeit", ergebnis: "Report im Postausgang", freigabe: "Report freigeben" },
  { name: "Vertragsende-Agent", ausloeser: "Kündigung erfasst, täglich", macht: "Berechnet das Ende, bestätigt die Kündigung, beendet das Stripe-Abo, erinnert an die Übergabe", ergebnis: "Bestätigung im Postausgang, Meldung", freigabe: "Bestätigung freigeben" },
  { name: "Bau-Agent", ausloeser: "Inhalte im Kundenportal", macht: "Baut die Website aus Vorlage und Inhalten, prüft sie in 10 Punkten", ergebnis: "Livegang im Postausgang", freigabe: "Max gibt Livegang frei" },
  { name: "Beleg-Agent", ausloeser: "Beleg hochgeladen", macht: "Liest Lieferant, Datum, Betrag, Steuer und Kategorie aus", ergebnis: "Ausgabe „bitte prüfen“", freigabe: "Werte prüfen und speichern" },
  { name: "Steuerberater-Agent", ausloeser: "Quartalsanfang oder Knopf", macht: "Finanzbericht des letzten Quartals als PDF, Mail an den Steuerberater", ergebnis: "Mail im Postausgang", freigabe: "Bericht freigeben" },
  { name: "Nachfass-Agent", ausloeser: "Brief, Angebot oder Start-Mail verschickt", macht: "Legt Aufgaben an: Besuch vor Ort (8 Tage), Angebot nachfassen (5 Tage), Inhalte nachfassen (7 Tage); schließt sie selbst, wenn es weitergeht", ergebnis: "Aufgaben mit Fälligkeit im Kalender", freigabe: "– (nur intern)" },
  { name: "Lieferschritte", ausloeser: "Anzahlung, Inhalte, Bau, Livegang, Domain, Abnahme", macht: "Legt die Checkliste je Paket an und hakt Schritte selbst ab", ergebnis: "Fortschritt im Projekt", freigabe: "– (nur intern)" },
  { name: "Ticket-Eingang", ausloeser: "Wunsch im Kundenportal oder über die Schnittstelle", macht: "Legt das Ticket an, weist es zu, Push bei dringend; gebuchte Zeit zählt gegen das Monatskontingent", ergebnis: "Ticket", freigabe: "Antwort an den Kunden freigeben" },
  { name: "Qualitätskontrolle", ausloeser: "Jeder neue oder geänderte Eintrag im Postausgang", macht: "Prüft Adresse, Anhänge, Zahlen, Stimme, Sperrliste, Website; KI-Prüfer als zweites Paar Augen", ergebnis: "OK, Hinweise oder blockiert", freigabe: "Ohne Prüfung keine Freigabe" },
  { name: "Wächter", ausloeser: "Alle 10 Minuten, täglich, sonntags", macht: "Erreichbarkeit, Backup, Probe-Rücksicherung, Löschfristen (Demos, Leads, Angebote, Anfragen), Tagesbericht aufs Handy", ergebnis: "Meldungen", freigabe: "– (nur intern)" },
];
