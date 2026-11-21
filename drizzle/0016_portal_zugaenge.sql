CREATE TABLE "portal_zugaenge" (
	"id" serial PRIMARY KEY NOT NULL,
	"betrieb_id" integer NOT NULL,
	"kontakt_id" integer,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"token" text NOT NULL,
	"erstellt_von" text NOT NULL,
	"erstellt_am" timestamp with time zone DEFAULT now() NOT NULL,
	"zuletzt_am" timestamp with time zone,
	"gesperrt_am" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "portal_zugaenge" ADD CONSTRAINT "portal_zugaenge_betrieb_id_betriebe_id_fk" FOREIGN KEY ("betrieb_id") REFERENCES "public"."betriebe"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "portal_zugang_token" ON "portal_zugaenge" USING btree ("token");