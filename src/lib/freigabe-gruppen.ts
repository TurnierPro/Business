// Freigaben nach Art, damit man gezielt z. B. alle Rechnungen am Stück prüfen kann.
// Genutzt auf „Freigaben“ und „Zu tun“.
export const FREIGABE_GRUPPEN: { key: string; name: string; zwecke: string[] }[] = [
  { key: "akquise", name: "Akquise", zwecke: ["akquise_brief"] },
  { key: "verkauf", name: "Angebote und Verträge", zwecke: ["angebot", "auftragsbestaetigung", "portal_zugang"] },
  { key: "geld", name: "Rechnungen und Zahlungen", zwecke: ["rechnung", "schlussrechnung", "betreuungsrechnung", "zahlungserinnerung", "mahnung1", "mahnung2", "lastschrift_start", "lastschrift_ende", "kuendigung"] },
  { key: "projekt", name: "Projekte", zwecke: ["kickoff", "inhalte_eingang", "abnahme_aufforderung", "abnahme_bestaetigung", "livegang", "umzug_anleitung", "umzug_fertig", "monatsreport"] },
];
export const gruppeVon = (zweck: string) => FREIGABE_GRUPPEN.find((g) => g.zwecke.includes(zweck))?.key ?? "sonstiges";
export const gruppenName = (key: string) => FREIGABE_GRUPPEN.find((g) => g.key === key)?.name ?? "Sonstiges";
/** Reihenfolge: Blockiertes zuerst, dann mit Hinweisen, dann der Rest. */
export const QK_REIHENFOLGE: Record<string, number> = { blockiert: 0, hinweise: 1, ausstehend: 2, bestanden: 3 };
