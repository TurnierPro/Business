CREATE TABLE "aktivitaeten" (
	"id" serial PRIMARY KEY NOT NULL,
	"betrieb_id" integer,
	"projekt_id" integer,
	"ticket_id" integer,
	"art" text NOT NULL,
	"titel" text NOT NULL,
	"text" text,
	"faellig_am" timestamp with time zone,
	"dauer_min" integer,
	"zustaendig" text,
	"erledigt_am" timestamp with time zone,
	"erstellt_von" text NOT NULL,
	"erstellt_am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_schluessel" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"praefix" text NOT NULL,
	"hash" text NOT NULL,
	"rechte" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"erstellt_von" text NOT NULL,
	"erstellt_am" timestamp with time zone DEFAULT now() NOT NULL,
	"zuletzt_am" timestamp with time zone,
	"widerrufen_am" timestamp with time zone,
	CONSTRAINT "api_schluessel_hash_unique" UNIQUE("hash")
);
--> statement-breakpoint
CREATE TABLE "kontakte" (
	"id" serial PRIMARY KEY NOT NULL,
	"betrieb_id" integer NOT NULL,
	"name" text NOT NULL,
	"rolle" text,
	"telefon" text,
	"email" text,
	"notiz" text,
	"haupt" boolean DEFAULT false NOT NULL,
	"erstellt_am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projekt_aufgaben" (
	"id" serial PRIMARY KEY NOT NULL,
	"projekt_id" integer NOT NULL,
	"phase" text NOT NULL,
	"titel" text NOT NULL,
	"schluessel" text,
	"reihenfolge" integer NOT NULL,
	"erledigt_am" timestamp with time zone,
	"erledigt_von" text
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" serial PRIMARY KEY NOT NULL,
	"betrieb_id" integer NOT NULL,
	"projekt_id" integer,
	"betreff" text NOT NULL,
	"beschreibung" text NOT NULL,
	"kategorie" text DEFAULT 'aenderung' NOT NULL,
	"prioritaet" text DEFAULT 'normal' NOT NULL,
	"status" text DEFAULT 'neu' NOT NULL,
	"quelle" text DEFAULT 'portal' NOT NULL,
	"zustaendig" text,
	"loesung" text,
	"erstellt_von" text NOT NULL,
	"erstellt_am" timestamp with time zone DEFAULT now() NOT NULL,
	"erledigt_am" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "zeiten" (
	"id" serial PRIMARY KEY NOT NULL,
	"betrieb_id" integer,
	"projekt_id" integer,
	"ticket_id" integer,
	"wer" text NOT NULL,
	"datum" timestamp with time zone DEFAULT now() NOT NULL,
	"minuten" integer NOT NULL,
	"taetigkeit" text NOT NULL,
	"notiz" text,
	"erstellt_am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "benutzer" ADD COLUMN "rolle" text DEFAULT 'admin' NOT NULL;--> statement-breakpoint
ALTER TABLE "benutzer" ADD COLUMN "aktiv" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "benutzer" ADD COLUMN "totp_geheim" text;--> statement-breakpoint
ALTER TABLE "benutzer" ADD COLUMN "totp_aktiv" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "benutzer" ADD COLUMN "kalender_token" text;--> statement-breakpoint
ALTER TABLE "betriebe" ADD COLUMN "tags" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "betriebe" ADD COLUMN "zustaendig" text;--> statement-breakpoint
ALTER TABLE "aktivitaeten" ADD CONSTRAINT "aktivitaeten_betrieb_id_betriebe_id_fk" FOREIGN KEY ("betrieb_id") REFERENCES "public"."betriebe"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kontakte" ADD CONSTRAINT "kontakte_betrieb_id_betriebe_id_fk" FOREIGN KEY ("betrieb_id") REFERENCES "public"."betriebe"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projekt_aufgaben" ADD CONSTRAINT "projekt_aufgaben_projekt_id_projekte_id_fk" FOREIGN KEY ("projekt_id") REFERENCES "public"."projekte"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_betrieb_id_betriebe_id_fk" FOREIGN KEY ("betrieb_id") REFERENCES "public"."betriebe"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zeiten" ADD CONSTRAINT "zeiten_betrieb_id_betriebe_id_fk" FOREIGN KEY ("betrieb_id") REFERENCES "public"."betriebe"("id") ON DELETE cascade ON UPDATE no action;