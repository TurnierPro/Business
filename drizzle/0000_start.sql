CREATE TABLE "angebote" (
	"id" serial PRIMARY KEY NOT NULL,
	"betrieb_id" integer NOT NULL,
	"paket" text NOT NULL,
	"einmalig" integer NOT NULL,
	"monatlich" integer NOT NULL,
	"status" text DEFAULT 'entwurf' NOT NULL,
	"unterschrieben_am" timestamp with time zone,
	"angezahlt_am" timestamp with time zone,
	"erstellt_am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "benutzer" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"passwort_hash" text NOT NULL,
	"erstellt_am" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "benutzer_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "betriebe" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"gewerk" text DEFAULT 'SHK' NOT NULL,
	"anrede" text DEFAULT 'Herr',
	"inhaber" text,
	"strasse" text,
	"plz" text,
	"ort" text,
	"telefon" text,
	"email" text,
	"website" text,
	"mitarbeiter" integer,
	"score" integer,
	"score_grund" text,
	"quelle" text DEFAULT 'manuell' NOT NULL,
	"status" text DEFAULT 'neu' NOT NULL,
	"notizen" text,
	"besuch_ab" timestamp with time zone,
	"letzte_aktivitaet" timestamp with time zone DEFAULT now() NOT NULL,
	"erstellt_am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dokumente" (
	"id" serial PRIMARY KEY NOT NULL,
	"betrieb_id" integer,
	"projekt_id" integer,
	"art" text NOT NULL,
	"titel" text NOT NULL,
	"daten" jsonb NOT NULL,
	"erstellt_am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"art" text NOT NULL,
	"daten" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'wartet' NOT NULL,
	"versuche" integer DEFAULT 0 NOT NULL,
	"fehler" text,
	"ergebnis" text,
	"faellig_am" timestamp with time zone DEFAULT now() NOT NULL,
	"erstellt_am" timestamp with time zone DEFAULT now() NOT NULL,
	"fertig_am" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ki_nutzung" (
	"id" serial PRIMARY KEY NOT NULL,
	"am" timestamp with time zone DEFAULT now() NOT NULL,
	"modell" text NOT NULL,
	"zweck" text NOT NULL,
	"betrieb_id" integer,
	"eingabe_tokens" integer NOT NULL,
	"ausgabe_tokens" integer NOT NULL,
	"kosten_mikro_usd" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meldungen" (
	"id" serial PRIMARY KEY NOT NULL,
	"am" timestamp with time zone DEFAULT now() NOT NULL,
	"art" text NOT NULL,
	"ok" boolean NOT NULL,
	"titel" text NOT NULL,
	"detail" text,
	"gepusht" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "postausgang" (
	"id" serial PRIMARY KEY NOT NULL,
	"betrieb_id" integer,
	"projekt_id" integer,
	"kanal" text NOT NULL,
	"zweck" text NOT NULL,
	"empfaenger" text NOT NULL,
	"betreff" text NOT NULL,
	"text" text NOT NULL,
	"anhaenge" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'zur_freigabe' NOT NULL,
	"hinweise" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"noetige_freigaben" integer DEFAULT 1 NOT NULL,
	"freigaben" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ablehn_grund" text,
	"fehler" text,
	"versendet_am" timestamp with time zone,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"erstellt_am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projekte" (
	"id" serial PRIMARY KEY NOT NULL,
	"betrieb_id" integer NOT NULL,
	"angebot_id" integer,
	"paket" text NOT NULL,
	"status" text DEFAULT 'inhalte' NOT NULL,
	"portal_token" text NOT NULL,
	"inhalte" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"seiten_slug" text,
	"pruefung" jsonb,
	"domain" text,
	"live_am" timestamp with time zone,
	"abo_ab" timestamp with time zone,
	"erstellt_am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "protokoll" (
	"id" serial PRIMARY KEY NOT NULL,
	"am" timestamp with time zone DEFAULT now() NOT NULL,
	"wer" text NOT NULL,
	"aktion" text NOT NULL,
	"betrieb_id" integer,
	"detail" text
);
--> statement-breakpoint
CREATE TABLE "rechnungen" (
	"id" serial PRIMARY KEY NOT NULL,
	"nummer" text NOT NULL,
	"lfd_nr" integer NOT NULL,
	"jahr" integer NOT NULL,
	"betrieb_id" integer NOT NULL,
	"angebot_id" integer,
	"art" text NOT NULL,
	"netto" integer NOT NULL,
	"status" text DEFAULT 'offen' NOT NULL,
	"erstellt_am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seiten" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"betrieb_id" integer,
	"art" text NOT NULL,
	"zugangscode" text,
	"loeschen_am" timestamp with time zone,
	"erstellt_am" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seiten_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "simulator_post" (
	"id" serial PRIMARY KEY NOT NULL,
	"am" timestamp with time zone DEFAULT now() NOT NULL,
	"kanal" text NOT NULL,
	"an" text NOT NULL,
	"betreff" text NOT NULL,
	"text" text NOT NULL,
	"anhaenge" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sperrliste" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"schluessel" text NOT NULL,
	"grund" text NOT NULL,
	"erstellt_am" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sperrliste_schluessel_unique" UNIQUE("schluessel")
);
--> statement-breakpoint
CREATE TABLE "termine" (
	"id" serial PRIMARY KEY NOT NULL,
	"betrieb_id" integer NOT NULL,
	"datum" timestamp with time zone DEFAULT now() NOT NULL,
	"einwilligung" boolean DEFAULT false NOT NULL,
	"einwilligung_am" timestamp with time zone,
	"einwilligung_von" text,
	"audio_pfad" text,
	"audio_geloescht_am" timestamp with time zone,
	"transkript" text,
	"auswertung" jsonb,
	"status" text DEFAULT 'hochgeladen' NOT NULL,
	"erstellt_am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "zeitplan" (
	"name" text PRIMARY KEY NOT NULL,
	"zuletzt_am" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "angebote" ADD CONSTRAINT "angebote_betrieb_id_betriebe_id_fk" FOREIGN KEY ("betrieb_id") REFERENCES "public"."betriebe"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dokumente" ADD CONSTRAINT "dokumente_betrieb_id_betriebe_id_fk" FOREIGN KEY ("betrieb_id") REFERENCES "public"."betriebe"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "postausgang" ADD CONSTRAINT "postausgang_betrieb_id_betriebe_id_fk" FOREIGN KEY ("betrieb_id") REFERENCES "public"."betriebe"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projekte" ADD CONSTRAINT "projekte_betrieb_id_betriebe_id_fk" FOREIGN KEY ("betrieb_id") REFERENCES "public"."betriebe"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projekte" ADD CONSTRAINT "projekte_angebot_id_angebote_id_fk" FOREIGN KEY ("angebot_id") REFERENCES "public"."angebote"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rechnungen" ADD CONSTRAINT "rechnungen_betrieb_id_betriebe_id_fk" FOREIGN KEY ("betrieb_id") REFERENCES "public"."betriebe"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rechnungen" ADD CONSTRAINT "rechnungen_angebot_id_angebote_id_fk" FOREIGN KEY ("angebot_id") REFERENCES "public"."angebote"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seiten" ADD CONSTRAINT "seiten_betrieb_id_betriebe_id_fk" FOREIGN KEY ("betrieb_id") REFERENCES "public"."betriebe"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "termine" ADD CONSTRAINT "termine_betrieb_id_betriebe_id_fk" FOREIGN KEY ("betrieb_id") REFERENCES "public"."betriebe"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "rechnung_nummer_idx" ON "rechnungen" USING btree ("nummer");