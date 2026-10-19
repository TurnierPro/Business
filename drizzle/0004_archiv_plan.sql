CREATE TABLE "kontostaende" (
	"monat" text PRIMARY KEY NOT NULL,
	"betrag" integer NOT NULL,
	"erfasst_von" text NOT NULL,
	"am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dokumente" ADD COLUMN "archiv_pfad" text;--> statement-breakpoint
ALTER TABLE "dokumente" ADD COLUMN "archiviert_am" timestamp with time zone;