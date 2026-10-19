CREATE TABLE "unterlagen" (
	"key" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'offen' NOT NULL,
	"notiz" text,
	"datei_pfad" text,
	"datei_name" text,
	"geaendert_von" text,
	"geaendert_am" timestamp with time zone
);
