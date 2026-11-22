CREATE TABLE "demos" (
	"id" serial PRIMARY KEY NOT NULL,
	"betrieb_id" integer NOT NULL,
	"titel" text NOT NULL,
	"dateien" integer NOT NULL,
	"groesse" integer NOT NULL,
	"startseite" text DEFAULT 'index.html' NOT NULL,
	"status" text DEFAULT 'entwurf' NOT NULL,
	"eintrag_id" integer,
	"im_portal_am" timestamp with time zone,
	"erstellt_von" text NOT NULL,
	"erstellt_am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "demos" ADD CONSTRAINT "demos_betrieb_id_betriebe_id_fk" FOREIGN KEY ("betrieb_id") REFERENCES "public"."betriebe"("id") ON DELETE cascade ON UPDATE no action;