CREATE TABLE "unterschriften" (
	"id" serial PRIMARY KEY NOT NULL,
	"betrieb_id" integer NOT NULL,
	"angebot_id" integer NOT NULL,
	"dokument_id" integer NOT NULL,
	"rolle" text NOT NULL,
	"name" text NOT NULL,
	"funktion" text,
	"bild" text NOT NULL,
	"pruefsumme" text NOT NULL,
	"erfasst_von" text NOT NULL,
	"am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "unterschriften" ADD CONSTRAINT "unterschriften_betrieb_id_betriebe_id_fk" FOREIGN KEY ("betrieb_id") REFERENCES "public"."betriebe"("id") ON DELETE cascade ON UPDATE no action;