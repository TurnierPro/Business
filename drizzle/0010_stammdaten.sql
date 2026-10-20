CREATE TABLE "katalog_eintraege" (
	"key" text PRIMARY KEY NOT NULL,
	"art" text NOT NULL,
	"daten" jsonb NOT NULL,
	"geaendert_von" text NOT NULL,
	"geaendert_am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sollwerte" (
	"monat" text PRIMARY KEY NOT NULL,
	"umsatz" integer NOT NULL,
	"auftraege" integer NOT NULL,
	"geaendert_von" text NOT NULL,
	"geaendert_am" timestamp with time zone DEFAULT now() NOT NULL
);
