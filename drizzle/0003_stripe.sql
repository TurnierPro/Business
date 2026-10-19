ALTER TABLE "angebote" ADD COLUMN "positionen" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "betriebe" ADD COLUMN "stripe_kunde_id" text;--> statement-breakpoint
ALTER TABLE "betriebe" ADD COLUMN "stripe_zahlart" text;--> statement-breakpoint
ALTER TABLE "projekte" ADD COLUMN "stripe_abo_id" text;--> statement-breakpoint
ALTER TABLE "rechnungen" ADD COLUMN "quelle" text DEFAULT 'eigen' NOT NULL;--> statement-breakpoint
ALTER TABLE "rechnungen" ADD COLUMN "stripe_id" text;--> statement-breakpoint
ALTER TABLE "rechnungen" ADD COLUMN "stripe_url" text;