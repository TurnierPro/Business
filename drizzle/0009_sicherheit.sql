CREATE TABLE "betroffenenanfragen" (
	"id" serial PRIMARY KEY NOT NULL,
	"eingang_am" timestamp with time zone NOT NULL,
	"art" text NOT NULL,
	"person" text NOT NULL,
	"betrieb_id" integer,
	"notiz" text,
	"erledigt_am" timestamp with time zone,
	"erfasst_von" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "datenpannen" (
	"id" serial PRIMARY KEY NOT NULL,
	"entdeckt_am" timestamp with time zone NOT NULL,
	"beschreibung" text NOT NULL,
	"betroffene" text,
	"daten" text,
	"risiko" text DEFAULT 'pruefen' NOT NULL,
	"massnahmen" text,
	"gemeldet_am" timestamp with time zone,
	"betroffene_informiert_am" timestamp with time zone,
	"abgeschlossen_am" timestamp with time zone,
	"erfasst_von" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "versuche" (
	"id" serial PRIMARY KEY NOT NULL,
	"art" text NOT NULL,
	"schluessel" text NOT NULL,
	"am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "benutzer" ADD COLUMN "totp_letzter_schritt" integer;--> statement-breakpoint
ALTER TABLE "benutzer" ADD COLUMN "muss_passwort_aendern" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "benutzer" ADD COLUMN "sitzung_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "versuche_suche_idx" ON "versuche" ("art","schluessel","am");
