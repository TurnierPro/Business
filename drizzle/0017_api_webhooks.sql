CREATE TABLE "api_protokoll" (
	"id" serial PRIMARY KEY NOT NULL,
	"schluessel_id" integer,
	"name" text,
	"methode" text NOT NULL,
	"pfad" text NOT NULL,
	"ergebnis" text NOT NULL,
	"am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhooks" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"ereignisse" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"geheimnis" text NOT NULL,
	"aktiv" boolean DEFAULT true NOT NULL,
	"letzter_versand" timestamp with time zone,
	"letzter_fehler" text,
	"erstellt_von" text NOT NULL,
	"erstellt_am" timestamp with time zone DEFAULT now() NOT NULL
);
