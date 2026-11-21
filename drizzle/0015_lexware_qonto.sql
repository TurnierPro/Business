ALTER TABLE "betriebe" ADD COLUMN "qonto_kunde_id" text;--> statement-breakpoint
ALTER TABLE "projekte" ADD COLUMN "qonto_abo_id" text;--> statement-breakpoint
ALTER TABLE "rechnungen" ADD COLUMN "lexware_id" text;