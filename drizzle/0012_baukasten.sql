ALTER TABLE "angebote" ADD COLUMN "module" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "angebote" ADD COLUMN "zusaetze" jsonb DEFAULT '[]'::jsonb NOT NULL;