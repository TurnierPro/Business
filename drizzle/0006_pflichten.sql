CREATE TABLE "anfragen" (
	"id" serial PRIMARY KEY NOT NULL,
	"betrieb_id" integer NOT NULL,
	"seiten_slug" text NOT NULL,
	"name" text NOT NULL,
	"kontakt" text NOT NULL,
	"nachricht" text NOT NULL,
	"dateien" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "angebote" ADD COLUMN "annahme" jsonb;--> statement-breakpoint
ALTER TABLE "betriebe" ADD COLUMN "datenquelle" text;--> statement-breakpoint
ALTER TABLE "projekte" ADD COLUMN "abnahme_status" text;--> statement-breakpoint
ALTER TABLE "projekte" ADD COLUMN "abnahme_frist" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "projekte" ADD COLUMN "abnahme_am" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "projekte" ADD COLUMN "abnahme_name" text;--> statement-breakpoint
ALTER TABLE "projekte" ADD COLUMN "abnahme_maengel" text;--> statement-breakpoint
ALTER TABLE "projekte" ADD COLUMN "onboarding" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "projekte" ADD COLUMN "gekuendigt_am" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "projekte" ADD COLUMN "ende_am" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "rechnungen" ADD COLUMN "faellig_am" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "rechnungen" ADD COLUMN "mahnstufe" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "rechnungen" ADD COLUMN "gemahnt_am" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "anfragen" ADD CONSTRAINT "anfragen_betrieb_id_betriebe_id_fk" FOREIGN KEY ("betrieb_id") REFERENCES "public"."betriebe"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
UPDATE "rechnungen" SET "faellig_am" = "erstellt_am" + interval '14 days' WHERE "faellig_am" IS NULL;
