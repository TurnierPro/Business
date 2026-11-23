CREATE TABLE "dateien" (
	"id" serial PRIMARY KEY NOT NULL,
	"betrieb_id" integer NOT NULL,
	"richtung" text NOT NULL,
	"name" text NOT NULL,
	"pfad" text NOT NULL,
	"typ" text NOT NULL,
	"groesse" integer NOT NULL,
	"notiz" text,
	"status" text DEFAULT 'neu' NOT NULL,
	"eintrag_id" integer,
	"erstellt_von" text NOT NULL,
	"erstellt_am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dateien" ADD CONSTRAINT "dateien_betrieb_id_betriebe_id_fk" FOREIGN KEY ("betrieb_id") REFERENCES "public"."betriebe"("id") ON DELETE cascade ON UPDATE no action;