CREATE TABLE "branding_assets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"driver" text NOT NULL,
	"size" integer NOT NULL,
	"mime_type" text NOT NULL,
	"sha256" text NOT NULL,
	CONSTRAINT "branding_assets_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "issuer_details" jsonb;--> statement-breakpoint
ALTER TABLE "operator" ADD COLUMN "auth_generation" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "operator_sessions" ADD COLUMN "id" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "contact_email" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "contact_phone" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "business_address" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "website" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "logo_id" uuid;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "typography" text DEFAULT 'editorial' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "density" text DEFAULT 'comfortable' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "corners" text DEFAULT 'soft' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "light_palette" text DEFAULT 'warm' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "dark_palette" text DEFAULT 'slate' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "allow_automatic_updates" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_logo_id_branding_assets_id_fk" FOREIGN KEY ("logo_id") REFERENCES "public"."branding_assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operator_sessions" ADD CONSTRAINT "operator_sessions_id_unique" UNIQUE("id");--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_appearance" CHECK ("settings"."typography" in ('editorial','modern') and "settings"."density" in ('comfortable','compact') and "settings"."corners" in ('soft','square') and "settings"."light_palette" in ('warm','cool') and "settings"."dark_palette" in ('slate','midnight'));