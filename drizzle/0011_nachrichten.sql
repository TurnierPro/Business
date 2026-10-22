CREATE TABLE "nachrichten" (
	"id" serial PRIMARY KEY NOT NULL,
	"kanal" text NOT NULL,
	"richtung" text NOT NULL,
	"betrieb_id" integer,
	"kontakt_id" integer,
	"ticket_id" integer,
	"postausgang_id" integer,
	"externe_id" text,
	"absender" text NOT NULL,
	"empfaenger" text,
	"betreff" text,
	"inhalt" text NOT NULL,
	"anhaenge" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"dauer_sek" integer,
	"status" text DEFAULT 'neu' NOT NULL,
	"quelle" text NOT NULL,
	"zeit" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "nachrichten" ADD CONSTRAINT "nachrichten_betrieb_id_betriebe_id_fk" FOREIGN KEY ("betrieb_id") REFERENCES "public"."betriebe"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "nachrichten_extern" ON "nachrichten" USING btree ("kanal","externe_id");