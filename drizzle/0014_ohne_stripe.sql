ALTER TABLE "betriebe" DROP COLUMN "stripe_kunde_id";--> statement-breakpoint
ALTER TABLE "betriebe" DROP COLUMN "stripe_zahlart";--> statement-breakpoint
ALTER TABLE "projekte" DROP COLUMN "stripe_abo_id";--> statement-breakpoint
ALTER TABLE "rechnungen" DROP COLUMN "stripe_id";--> statement-breakpoint
ALTER TABLE "rechnungen" DROP COLUMN "stripe_url";