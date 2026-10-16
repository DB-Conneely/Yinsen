CREATE TABLE "installation" (
	"singleton" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "installation_singleton" CHECK ("installation"."singleton" = true)
);
--> statement-breakpoint
INSERT INTO "installation" DEFAULT VALUES;
