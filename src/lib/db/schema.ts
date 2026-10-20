import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// Alle Beträge in Cent (netto), alle Zeiten mit Zeitzone.

export const benutzer = pgTable("benutzer", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwortHash: text("passwort_hash").notNull(),
  // admin | vertrieb | technik | lesen
  rolle: text("rolle").notNull().default("admin"),
  aktiv: boolean("aktiv").notNull().default(true),
  // Zwei-Faktor-Anmeldung (TOTP, z. B. mit einer Authenticator-App)
  totpGeheim: text("totp_geheim"),
  totpAktiv: boolean("totp_aktiv").notNull().default(false),
  // Geheimer Link für das Kalender-Abo (Termine und Aufgaben)
  kalenderToken: text("kalender_token"),
  erstelltAm: timestamp("erstellt_am", { withTimezone: true }).defaultNow().notNull(),
});

// Betrieb = Lead und später Kunde. Der Status zeigt, wo er im Ablauf steht.
export const betriebe = pgTable("betriebe", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  gewerk: text("gewerk").notNull().default("SHK"),
  anrede: text("anrede").default("Herr"),
  inhaber: text("inhaber"),
  strasse: text("strasse"),
  plz: text("plz"),
  ort: text("ort"),
  telefon: text("telefon"),
  email: text("email"),
  website: text("website"),
  mitarbeiter: integer("mitarbeiter"),
  score: integer("score"),
  scoreGrund: text("score_grund"),
  quelle: text("quelle").notNull().default("manuell"),
  // Woher genau die Daten stammen (Art. 14 DSGVO), z. B. „Impressum https://…, abgerufen 19.10.2026“
  datenquelle: text("datenquelle"),
  status: text("status").notNull().default("neu"),
  notizen: text("notizen"),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  zustaendig: text("zustaendig"),
  besuchAb: timestamp("besuch_ab", { withTimezone: true }),
  // Geheimer Link zum Kundenportal (entsteht mit dem ersten Angebot)
  portalToken: text("portal_token").unique(),
  // Stripe: Kunde und gespeicherte Zahlungsart (nach der Anzahlung)
  stripeKundeId: text("stripe_kunde_id"),
  stripeZahlart: text("stripe_zahlart"),
  letzteAktivitaet: timestamp("letzte_aktivitaet", { withTimezone: true }).defaultNow().notNull(),
  erstelltAm: timestamp("erstellt_am", { withTimezone: true }).defaultNow().notNull(),
});

export const sperrliste = pgTable("sperrliste", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  schluessel: text("schluessel").notNull().unique(),
  grund: text("grund").notNull(),
  erstelltAm: timestamp("erstellt_am", { withTimezone: true }).defaultNow().notNull(),
});

// Jedes erzeugte Dokument: Inhalt als Daten, Darstellung kommt aus der Vorlage.
export const dokumente = pgTable("dokumente", {
  id: serial("id").primaryKey(),
  betriebId: integer("betrieb_id").references(() => betriebe.id, { onDelete: "cascade" }),
  projektId: integer("projekt_id"),
  art: text("art").notNull(),
  titel: text("titel").notNull(),
  daten: jsonb("daten").notNull(),
  // Beim Versand eingefroren: genau dieses PDF hat der Kunde bekommen
  archivPfad: text("archiv_pfad"),
  archiviertAm: timestamp("archiviert_am", { withTimezone: true }),
  erstelltAm: timestamp("erstellt_am", { withTimezone: true }).defaultNow().notNull(),
});

// Postausgang: Nichts verlässt Stelax, ohne hier freigegeben zu sein.
export const postausgang = pgTable("postausgang", {
  id: serial("id").primaryKey(),
  betriebId: integer("betrieb_id").references(() => betriebe.id, { onDelete: "cascade" }),
  projektId: integer("projekt_id"),
  kanal: text("kanal").notNull(), // mail | brief | livegang
  zweck: text("zweck").notNull(), // akquise_brief | angebot | rechnung | kickoff | inhalte_fehlen | livegang | schlussrechnung
  empfaenger: text("empfaenger").notNull(),
  betreff: text("betreff").notNull(),
  text: text("text").notNull(),
  anhaenge: jsonb("anhaenge").$type<number[]>().notNull().default([]),
  status: text("status").notNull().default("zur_freigabe"),
  // Qualitätskontrolle vor jeder Freigabe: ausstehend | bestanden | hinweise
  qkStatus: text("qk_status").notNull().default("ausstehend"),
  qkAm: timestamp("qk_am", { withTimezone: true }),
  hinweise: jsonb("hinweise").$type<string[]>().notNull().default([]),
  noetigeFreigaben: integer("noetige_freigaben").notNull().default(1),
  freigaben: jsonb("freigaben").$type<{ name: string; am: string }[]>().notNull().default([]),
  ablehnGrund: text("ablehn_grund"),
  fehler: text("fehler"),
  versendetAm: timestamp("versendet_am", { withTimezone: true }),
  meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
  erstelltAm: timestamp("erstellt_am", { withTimezone: true }).defaultNow().notNull(),
});

export const termine = pgTable("termine", {
  id: serial("id").primaryKey(),
  betriebId: integer("betrieb_id").notNull().references(() => betriebe.id, { onDelete: "cascade" }),
  datum: timestamp("datum", { withTimezone: true }).defaultNow().notNull(),
  einwilligung: boolean("einwilligung").notNull().default(false),
  einwilligungAm: timestamp("einwilligung_am", { withTimezone: true }),
  einwilligungVon: text("einwilligung_von"),
  audioPfad: text("audio_pfad"),
  audioGeloeschtAm: timestamp("audio_geloescht_am", { withTimezone: true }),
  transkript: text("transkript"),
  auswertung: jsonb("auswertung"),
  status: text("status").notNull().default("hochgeladen"),
  erstelltAm: timestamp("erstellt_am", { withTimezone: true }).defaultNow().notNull(),
});

export const angebote = pgTable("angebote", {
  id: serial("id").primaryKey(),
  betriebId: integer("betrieb_id").notNull().references(() => betriebe.id, { onDelete: "cascade" }),
  paket: text("paket").notNull(),
  einmalig: integer("einmalig").notNull(),
  monatlich: integer("monatlich").notNull(),
  positionen: jsonb("positionen").$type<{ text: string; einmalig: number; monatlich: number; hinweis?: string }[]>().notNull().default([]),
  status: text("status").notNull().default("entwurf"), // entwurf | versendet | unterschrieben | angezahlt | abgeschlossen
  unterschriebenAm: timestamp("unterschrieben_am", { withTimezone: true }),
  // Nachweis der Annahme im Kundenportal: wer, wann, welche AGB, Unternehmer bestätigt
  annahme: jsonb("annahme").$type<{ name: string; am: string; agbVersion: string; unternehmer: boolean }>(),
  angezahltAm: timestamp("angezahlt_am", { withTimezone: true }),
  erstelltAm: timestamp("erstellt_am", { withTimezone: true }).defaultNow().notNull(),
});

export const rechnungen = pgTable(
  "rechnungen",
  {
    id: serial("id").primaryKey(),
    nummer: text("nummer").notNull(),
    lfdNr: integer("lfd_nr").notNull(),
    jahr: integer("jahr").notNull(),
    betriebId: integer("betrieb_id").notNull().references(() => betriebe.id),
    angebotId: integer("angebot_id").references(() => angebote.id),
    art: text("art").notNull(), // anzahlung | schluss
    netto: integer("netto").notNull(),
    status: text("status").notNull().default("offen"),
    faelligAm: timestamp("faellig_am", { withTimezone: true }),
    // Mahnwesen: 0 = keine, 1 = Erinnerung, 2 = 1. Mahnung, 3 = letzte Mahnung
    mahnstufe: integer("mahnstufe").notNull().default(0),
    gemahntAm: timestamp("gemahnt_am", { withTimezone: true }),
    bezahltAm: timestamp("bezahlt_am", { withTimezone: true }),
    // eigen = von Stelax OS erstellt, stripe = von Stripe erstellt und verschickt
    quelle: text("quelle").notNull().default("eigen"),
    stripeId: text("stripe_id"),
    stripeUrl: text("stripe_url"),
    erstelltAm: timestamp("erstellt_am", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("rechnung_nummer_idx").on(t.nummer)],
);

export const projekte = pgTable("projekte", {
  id: serial("id").primaryKey(),
  betriebId: integer("betrieb_id").notNull().references(() => betriebe.id, { onDelete: "cascade" }),
  angebotId: integer("angebot_id").references(() => angebote.id),
  paket: text("paket").notNull(),
  status: text("status").notNull().default("inhalte"), // inhalte | bau | pruefung | bereit | live | gekuendigt
  portalToken: text("portal_token").notNull(),
  inhalte: jsonb("inhalte").$type<Record<string, unknown>>().notNull().default({}),
  seitenSlug: text("seiten_slug"),
  pruefung: jsonb("pruefung").$type<{ name: string; ok: boolean; detail: string }[]>(),
  domain: text("domain"),
  inhalteAm: timestamp("inhalte_am", { withTimezone: true }),
  liveAm: timestamp("live_am", { withTimezone: true }),
  aboAb: timestamp("abo_ab", { withTimezone: true }),
  // Abnahme nach dem Livegang (§ 640 BGB): offen | abgenommen | vorbehalt | verweigert | fiktion
  abnahmeStatus: text("abnahme_status"),
  abnahmeFrist: timestamp("abnahme_frist", { withTimezone: true }),
  abnahmeAm: timestamp("abnahme_am", { withTimezone: true }),
  abnahmeName: text("abnahme_name"),
  abnahmeMaengel: text("abnahme_maengel"),
  // Angaben aus dem Onboarding (u. a. für die Frage, ob das BFSG greift)
  onboarding: jsonb("onboarding").$type<Record<string, string>>().notNull().default({}),
  // Umzug einer bestehenden Domain: Bestandsaufnahme, Weg, Stand der Umstellung (siehe ablauf/umzug.ts)
  umzug: jsonb("umzug").$type<Record<string, unknown>>().notNull().default({}),
  gekuendigtAm: timestamp("gekuendigt_am", { withTimezone: true }),
  endeAm: timestamp("ende_am", { withTimezone: true }),
  stripeAboId: text("stripe_abo_id"),
  erstelltAm: timestamp("erstellt_am", { withTimezone: true }).defaultNow().notNull(),
});

// Demo-Websites und Kunden-Websites liegen als Dateien unter data/sites/<slug>.
export const seiten = pgTable("seiten", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  betriebId: integer("betrieb_id").references(() => betriebe.id, { onDelete: "cascade" }),
  art: text("art").notNull(), // demo | kunde
  zugangscode: text("zugangscode"),
  loeschenAm: timestamp("loeschen_am", { withTimezone: true }),
  erstelltAm: timestamp("erstellt_am", { withTimezone: true }).defaultNow().notNull(),
});

export const jobs = pgTable("jobs", {
  id: serial("id").primaryKey(),
  art: text("art").notNull(),
  daten: jsonb("daten").$type<Record<string, unknown>>().notNull().default({}),
  status: text("status").notNull().default("wartet"), // wartet | laeuft | fertig | fehler
  versuche: integer("versuche").notNull().default(0),
  fehler: text("fehler"),
  ergebnis: text("ergebnis"),
  faelligAm: timestamp("faellig_am", { withTimezone: true }).defaultNow().notNull(),
  erstelltAm: timestamp("erstellt_am", { withTimezone: true }).defaultNow().notNull(),
  fertigAm: timestamp("fertig_am", { withTimezone: true }),
});

export const zeitplan = pgTable("zeitplan", {
  name: text("name").primaryKey(),
  zuletztAm: timestamp("zuletzt_am", { withTimezone: true }),
});

export const protokoll = pgTable("protokoll", {
  id: serial("id").primaryKey(),
  am: timestamp("am", { withTimezone: true }).defaultNow().notNull(),
  wer: text("wer").notNull(),
  aktion: text("aktion").notNull(),
  betriebId: integer("betrieb_id"),
  detail: text("detail"),
});

export const kiNutzung = pgTable("ki_nutzung", {
  id: serial("id").primaryKey(),
  am: timestamp("am", { withTimezone: true }).defaultNow().notNull(),
  modell: text("modell").notNull(),
  zweck: text("zweck").notNull(),
  betriebId: integer("betrieb_id"),
  eingabeTokens: integer("eingabe_tokens").notNull(),
  ausgabeTokens: integer("ausgabe_tokens").notNull(),
  kostenMikroUsd: integer("kosten_mikro_usd").notNull(),
});

// Systemmeldungen: Überwachung, Backups, Probe-Rücksicherung, Tagesbericht.
export const meldungen = pgTable("meldungen", {
  id: serial("id").primaryKey(),
  am: timestamp("am", { withTimezone: true }).defaultNow().notNull(),
  art: text("art").notNull(), // backup | ruecksicherung | erreichbarkeit | tagesbericht | job
  ok: boolean("ok").notNull(),
  titel: text("titel").notNull(),
  detail: text("detail"),
  gepusht: boolean("gepusht").notNull().default(false),
});

// Simulator-Postfach: hier landen Mails und Briefe, solange kein echter Dienst angebunden ist.
export const simulatorPost = pgTable("simulator_post", {
  id: serial("id").primaryKey(),
  am: timestamp("am", { withTimezone: true }).defaultNow().notNull(),
  kanal: text("kanal").notNull(),
  an: text("an").notNull(),
  betreff: text("betreff").notNull(),
  text: text("text").notNull(),
  anhaenge: jsonb("anhaenge").$type<string[]>().notNull().default([]),
});

// Ausgaben mit Beleg. Grundlage für Übersicht und Quartalsbericht; die Buchhaltung selbst macht der Steuerberater.
export const ausgaben = pgTable("ausgaben", {
  id: serial("id").primaryKey(),
  datum: timestamp("datum", { withTimezone: true }).notNull(),
  lieferant: text("lieferant").notNull(),
  beschreibung: text("beschreibung"),
  kategorie: text("kategorie").notNull(),
  netto: integer("netto").notNull(),
  ustSatz: integer("ust_satz").notNull().default(19),
  ust: integer("ust").notNull(),
  bezahlt: boolean("bezahlt").notNull().default(true),
  belegPfad: text("beleg_pfad"),
  belegName: text("beleg_name"),
  status: text("status").notNull().default("erfasst"), // erfasst | pruefen
  erfasstVon: text("erfasst_von").notNull(),
  erstelltAm: timestamp("erstellt_am", { withTimezone: true }).defaultNow().notNull(),
});

// Kontostand am Monatsende (von Hand), Grundlage für die Gehaltsregel „eigenes Geld“
export const kontostaende = pgTable("kontostaende", {
  monat: text("monat").primaryKey(), // JJJJ-MM
  betrag: integer("betrag").notNull(),
  erfasstVon: text("erfasst_von").notNull(),
  am: timestamp("am", { withTimezone: true }).defaultNow().notNull(),
});

// Unterlagen-Register: Stand je Unterlage aus dem Bericht „Dokumente für die Stelax GmbH“
export const unterlagen = pgTable("unterlagen", {
  key: text("key").primaryKey(),
  status: text("status").notNull().default("offen"), // offen | in_arbeit | erledigt | entfaellt
  notiz: text("notiz"),
  dateiPfad: text("datei_pfad"),
  dateiName: text("datei_name"),
  geaendertVon: text("geaendert_von"),
  geaendertAm: timestamp("geaendert_am", { withTimezone: true }),
});

// Anfragen über das Formular auf Kunden-Websites. Sichtbar im Kundenportal, Grundlage für den Monatsreport.
export const anfragen = pgTable("anfragen", {
  id: serial("id").primaryKey(),
  betriebId: integer("betrieb_id").notNull().references(() => betriebe.id, { onDelete: "cascade" }),
  seitenSlug: text("seiten_slug").notNull(),
  name: text("name").notNull(),
  kontakt: text("kontakt").notNull(),
  nachricht: text("nachricht").notNull(),
  dateien: jsonb("dateien").$type<string[]>().notNull().default([]),
  am: timestamp("am", { withTimezone: true }).defaultNow().notNull(),
});

// Ansprechpartner je Betrieb (Inhaber, Büro, Meister, IT …)
export const kontakte = pgTable("kontakte", {
  id: serial("id").primaryKey(),
  betriebId: integer("betrieb_id").notNull().references(() => betriebe.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  rolle: text("rolle"),
  telefon: text("telefon"),
  email: text("email"),
  notiz: text("notiz"),
  haupt: boolean("haupt").notNull().default(false),
  erstelltAm: timestamp("erstellt_am", { withTimezone: true }).defaultNow().notNull(),
});

// Alles, was mit einem Kunden passiert: Notiz, Anruf, Termin, Aufgabe. Aufgaben und Termine haben ein Fälligkeitsdatum.
export const aktivitaeten = pgTable("aktivitaeten", {
  id: serial("id").primaryKey(),
  betriebId: integer("betrieb_id").references(() => betriebe.id, { onDelete: "cascade" }),
  projektId: integer("projekt_id"),
  ticketId: integer("ticket_id"),
  art: text("art").notNull(), // notiz | anruf | termin | aufgabe
  titel: text("titel").notNull(),
  text: text("text"),
  faelligAm: timestamp("faellig_am", { withTimezone: true }),
  dauerMin: integer("dauer_min"),
  zustaendig: text("zustaendig"),
  erledigtAm: timestamp("erledigt_am", { withTimezone: true }),
  erstelltVon: text("erstellt_von").notNull(),
  erstelltAm: timestamp("erstellt_am", { withTimezone: true }).defaultNow().notNull(),
});

// Zeiterfassung: Grundlage für „Stunden je Projekt“ und „Betreuung je Kunde“ aus dem Business Case
export const zeiten = pgTable("zeiten", {
  id: serial("id").primaryKey(),
  betriebId: integer("betrieb_id").references(() => betriebe.id, { onDelete: "cascade" }),
  projektId: integer("projekt_id"),
  ticketId: integer("ticket_id"),
  wer: text("wer").notNull(),
  datum: timestamp("datum", { withTimezone: true }).defaultNow().notNull(),
  minuten: integer("minuten").notNull(),
  taetigkeit: text("taetigkeit").notNull(),
  notiz: text("notiz"),
  erstelltAm: timestamp("erstellt_am", { withTimezone: true }).defaultNow().notNull(),
});

// Lieferschritte je Projekt (Checkliste aus der Paket-Vorlage). Mit Schlüssel hakt Stelax OS selbst ab.
export const projektAufgaben = pgTable("projekt_aufgaben", {
  id: serial("id").primaryKey(),
  projektId: integer("projekt_id").notNull().references(() => projekte.id, { onDelete: "cascade" }),
  phase: text("phase").notNull(),
  titel: text("titel").notNull(),
  schluessel: text("schluessel"),
  reihenfolge: integer("reihenfolge").notNull(),
  erledigtAm: timestamp("erledigt_am", { withTimezone: true }),
  erledigtVon: text("erledigt_von"),
});

// Tickets: Änderungswünsche, Fehler und Fragen aus der Betreuung (Kontingent je Paket)
export const tickets = pgTable("tickets", {
  id: serial("id").primaryKey(),
  betriebId: integer("betrieb_id").notNull().references(() => betriebe.id, { onDelete: "cascade" }),
  projektId: integer("projekt_id"),
  betreff: text("betreff").notNull(),
  beschreibung: text("beschreibung").notNull(),
  kategorie: text("kategorie").notNull().default("aenderung"), // aenderung | fehler | frage | wunsch
  prioritaet: text("prioritaet").notNull().default("normal"), // normal | hoch | dringend
  status: text("status").notNull().default("neu"), // neu | in_arbeit | wartet_kunde | erledigt
  quelle: text("quelle").notNull().default("portal"), // portal | telefon | mail | intern | api
  zustaendig: text("zustaendig"),
  loesung: text("loesung"),
  erstelltVon: text("erstellt_von").notNull(),
  erstelltAm: timestamp("erstellt_am", { withTimezone: true }).defaultNow().notNull(),
  erledigtAm: timestamp("erledigt_am", { withTimezone: true }),
});

// Schlüssel für die Schnittstelle (/api/v1). Gespeichert wird nur der Hash.
export const apiSchluessel = pgTable("api_schluessel", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  praefix: text("praefix").notNull(),
  hash: text("hash").notNull().unique(),
  rechte: jsonb("rechte").$type<string[]>().notNull().default([]),
  erstelltVon: text("erstellt_von").notNull(),
  erstelltAm: timestamp("erstellt_am", { withTimezone: true }).defaultNow().notNull(),
  zuletztAm: timestamp("zuletzt_am", { withTimezone: true }),
  widerrufenAm: timestamp("widerrufen_am", { withTimezone: true }),
});
