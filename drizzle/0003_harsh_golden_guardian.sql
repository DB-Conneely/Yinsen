CREATE TABLE "milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"position" integer NOT NULL,
	"due_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "milestones_position" CHECK ("milestones"."position" >= 0),
	CONSTRAINT "milestones_status" CHECK ("milestones"."status" in ('pending','in_progress','review','approved'))
);
--> statement-breakpoint
CREATE TABLE "project_activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_clients" (
	"project_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"role" text NOT NULL,
	CONSTRAINT "project_clients_project_id_client_id_pk" PRIMARY KEY("project_id","client_id"),
	CONSTRAINT "project_client_role" CHECK ("project_clients"."role" in ('primary','member'))
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"budget" integer,
	"currency" text NOT NULL,
	"start_date" date,
	"due_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "projects_status" CHECK ("projects"."status" in ('draft','pending_lockin','active','paused')),
	CONSTRAINT "projects_budget" CHECK ("projects"."budget" is null or "projects"."budget" >= 0),
	CONSTRAINT "projects_currency" CHECK ("projects"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "projects_dates" CHECK ("projects"."start_date" is null or "projects"."due_date" is null or "projects"."due_date" >= "projects"."start_date")
);
--> statement-breakpoint
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_activity" ADD CONSTRAINT "project_activity_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_clients" ADD CONSTRAINT "project_clients_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_clients" ADD CONSTRAINT "project_clients_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "milestones_project_position" ON "milestones" USING btree ("project_id","position");--> statement-breakpoint
CREATE INDEX "project_activity_created" ON "project_activity" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "project_one_primary" ON "project_clients" USING btree ("project_id") WHERE "project_clients"."role" = 'primary';