ALTER TABLE "betriebe" ADD COLUMN "portal_token" text;--> statement-breakpoint
ALTER TABLE "projekte" ADD COLUMN "inhalte_am" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "betriebe" ADD CONSTRAINT "betriebe_portal_token_unique" UNIQUE("portal_token");