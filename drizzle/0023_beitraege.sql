CREATE TABLE "beitraege" (
	"id" serial PRIMARY KEY NOT NULL,
	"betrieb_id" integer NOT NULL,
	"art" text DEFAULT 'beitrag' NOT NULL,
	"kanaele" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"text" text NOT NULL,
	"bild" text,
	"bezug" text,
	"geplant_am" timestamp with time zone,
	"status" text DEFAULT 'entwurf' NOT NULL,
	"kommentar" text,
	"eintrag_id" integer,
	"vorgelegt_am" timestamp with time zone,
	"entschieden_am" timestamp with time zone,
	"entschieden_von" text,
	"veroeffentlicht_am" timestamp with time zone,
	"erstellt_von" text NOT NULL,
	"erstellt_am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "beitraege" ADD CONSTRAINT "beitraege_betrieb_id_betriebe_id_fk" FOREIGN KEY ("betrieb_id") REFERENCES "public"."betriebe"("id") ON DELETE cascade ON UPDATE no action;