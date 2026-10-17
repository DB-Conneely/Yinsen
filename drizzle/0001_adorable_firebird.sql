CREATE TABLE "operator" (
	"singleton" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "operator_id_unique" UNIQUE("id"),
	CONSTRAINT "operator_email_unique" UNIQUE("email"),
	CONSTRAINT "operator_singleton" CHECK ("operator"."singleton" = true)
);
--> statement-breakpoint
CREATE TABLE "operator_sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"operator_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"singleton" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"brand_name" text NOT NULL,
	"brand_colour" text DEFAULT '#2457A7' NOT NULL,
	"default_currency" text DEFAULT 'GBP' NOT NULL,
	"welcome_text" text DEFAULT 'Welcome to your client portal.' NOT NULL,
	CONSTRAINT "settings_singleton" CHECK ("settings"."singleton" = true),
	CONSTRAINT "settings_colour" CHECK ("settings"."brand_colour" ~ '^#[0-9A-Fa-f]{6}$'),
	CONSTRAINT "settings_currency" CHECK ("settings"."default_currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
ALTER TABLE "operator" ADD CONSTRAINT "operator_singleton_installation_singleton_fk" FOREIGN KEY ("singleton") REFERENCES "public"."installation"("singleton") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operator_sessions" ADD CONSTRAINT "operator_sessions_operator_id_operator_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."operator"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_singleton_operator_singleton_fk" FOREIGN KEY ("singleton") REFERENCES "public"."operator"("singleton") ON DELETE no action ON UPDATE no action;