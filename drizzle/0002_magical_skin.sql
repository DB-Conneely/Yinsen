CREATE TABLE "activity_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"client_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "client_sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"company" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "clients_email_unique" UNIQUE("email"),
	CONSTRAINT "clients_normalized_email" CHECK ("clients"."email" = lower(trim("clients"."email")))
);
--> statement-breakpoint
CREATE TABLE "magic_link_tokens" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"client_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_sessions" ADD CONSTRAINT "client_sessions_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "magic_link_tokens" ADD CONSTRAINT "magic_link_tokens_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_client_created" ON "activity_events" USING btree ("client_id","created_at");--> statement-breakpoint
CREATE INDEX "client_sessions_expiry" ON "client_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "magic_link_tokens_expiry" ON "magic_link_tokens" USING btree ("expires_at");