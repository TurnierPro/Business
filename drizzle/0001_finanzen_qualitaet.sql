CREATE TABLE "ausgaben" (
	"id" serial PRIMARY KEY NOT NULL,
	"datum" timestamp with time zone NOT NULL,
	"lieferant" text NOT NULL,
	"beschreibung" text,
	"kategorie" text NOT NULL,
	"netto" integer NOT NULL,
	"ust_satz" integer DEFAULT 19 NOT NULL,
	"ust" integer NOT NULL,
	"bezahlt" boolean DEFAULT true NOT NULL,
	"beleg_pfad" text,
	"beleg_name" text,
	"status" text DEFAULT 'erfasst' NOT NULL,
	"erfasst_von" text NOT NULL,
	"erstellt_am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "postausgang" ADD COLUMN "qk_status" text DEFAULT 'ausstehend' NOT NULL;--> statement-breakpoint
ALTER TABLE "postausgang" ADD COLUMN "qk_am" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "rechnungen" ADD COLUMN "bezahlt_am" timestamp with time zone;--> statement-breakpoint
UPDATE "postausgang" SET "qk_status" = 'bestanden', "qk_am" = now();
