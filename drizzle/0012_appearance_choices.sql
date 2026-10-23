ALTER TABLE "settings" DROP CONSTRAINT "settings_appearance";--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "finish" text DEFAULT 'clean' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ALTER COLUMN "finish" SET DEFAULT 'layered';--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_appearance" CHECK ("settings"."typography" in ('editorial','modern','humanist') and "settings"."density" in ('comfortable','compact') and "settings"."corners" in ('soft','square') and "settings"."finish" in ('clean','layered') and "settings"."light_palette" in ('warm','cool','chalk') and "settings"."dark_palette" in ('slate','midnight','charcoal'));
