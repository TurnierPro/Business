CREATE TABLE "besuche" (
	"id" serial PRIMARY KEY NOT NULL,
	"betrieb_id" integer NOT NULL,
	"am" timestamp with time zone DEFAULT now() NOT NULL,
	"inhaber_angetroffen" boolean DEFAULT false NOT NULL,
	"dauer_min" integer,
	"einwand" text,
	"paket" text,
	"variante" text,
	"ergebnis" text NOT NULL,
	"ruecktritt" boolean DEFAULT false NOT NULL,
	"einwilligung_kontakt" text,
	"art14_info" boolean DEFAULT false NOT NULL,
	"preistest" text,
	"erstellt_von" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "besuche" ADD CONSTRAINT "besuche_betrieb_id_betriebe_id_fk" FOREIGN KEY ("betrieb_id") REFERENCES "public"."betriebe"("id") ON DELETE cascade ON UPDATE no action;