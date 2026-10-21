ALTER TABLE "settings" ADD COLUMN "light_background" text DEFAULT '#f4f4f0' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "light_surface" text DEFAULT '#fffefa' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "dark_background" text DEFAULT '#151a20' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "dark_surface" text DEFAULT '#1d242c' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_surfaces" CHECK ("settings"."light_background" ~ '^#[0-9A-Fa-f]{6}$' and "settings"."light_surface" ~ '^#[0-9A-Fa-f]{6}$' and "settings"."dark_background" ~ '^#[0-9A-Fa-f]{6}$' and "settings"."dark_surface" ~ '^#[0-9A-Fa-f]{6}$');
--> statement-breakpoint
UPDATE "settings" SET "light_background" = CASE WHEN "light_palette"='cool' THEN '#f0f4f8' ELSE '#f4f4f0' END,
"light_surface" = CASE WHEN "light_palette"='cool' THEN '#ffffff' ELSE '#fffefa' END,
"dark_background" = CASE WHEN "dark_palette"='midnight' THEN '#121827' ELSE '#151a20' END,
"dark_surface" = CASE WHEN "dark_palette"='midnight' THEN '#1a2336' ELSE '#1d242c' END;
