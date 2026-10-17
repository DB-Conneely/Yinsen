CREATE TABLE "invoice_line_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"description" text NOT NULL,
	"quantity_hundredths" integer NOT NULL,
	"unit_price" integer NOT NULL,
	"amount" integer NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "invoice_items_values" CHECK ("invoice_line_items"."quantity_hundredths">0 and "invoice_line_items"."unit_price">=0 and "invoice_line_items"."amount">=0 and "invoice_line_items"."position">=0)
);
--> statement-breakpoint
CREATE TABLE "invoice_milestones" (
	"invoice_id" uuid NOT NULL,
	"milestone_id" uuid NOT NULL,
	CONSTRAINT "invoice_milestones_invoice_id_milestone_id_pk" PRIMARY KEY("invoice_id","milestone_id")
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"client_id" uuid NOT NULL,
	"project_id" uuid,
	"invoice_number" text NOT NULL,
	"prefix" text NOT NULL,
	"sequence" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"currency" text NOT NULL,
	"amount" integer NOT NULL,
	"total_override" integer,
	"due_date" date,
	"notes" text DEFAULT '' NOT NULL,
	"recipient_name" text NOT NULL,
	"recipient_email" text NOT NULL,
	"issuer_name" text NOT NULL,
	"issuer_email" text NOT NULL,
	"brand_colour" text NOT NULL,
	"payment_instructions" text NOT NULL,
	"email_id" text,
	"email_failed" boolean DEFAULT false NOT NULL,
	"sent_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"settlement_data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "invoices_invoice_number_unique" UNIQUE("invoice_number"),
	CONSTRAINT "invoices_status" CHECK ("invoices"."status" in ('draft','sent','overdue','paid','settled','cancelled')),
	CONSTRAINT "invoices_amount" CHECK ("invoices"."amount">0 and ("invoices"."total_override" is null or "invoices"."total_override">0)),
	CONSTRAINT "invoices_currency" CHECK ("invoices"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "invoices_sequence" CHECK ("invoices"."sequence">0),
	CONSTRAINT "invoices_money_received" CHECK (("invoices"."status" in ('paid','settled')) = ("invoices"."paid_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "invoice_prefix" text DEFAULT 'INV' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "invoice_next_number" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "payment_instructions" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_milestones" ADD CONSTRAINT "invoice_milestones_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_milestones" ADD CONSTRAINT "invoice_milestones_milestone_id_milestones_id_fk" FOREIGN KEY ("milestone_id") REFERENCES "public"."milestones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_items_position" ON "invoice_line_items" USING btree ("invoice_id","position");--> statement-breakpoint
CREATE INDEX "invoices_client" ON "invoices" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "invoices_project" ON "invoices" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "invoices_status_due" ON "invoices" USING btree ("status","due_date");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_prefix_sequence" ON "invoices" USING btree ("prefix","sequence");--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_invoice_prefix" CHECK ("settings"."invoice_prefix" ~ '^[A-Z0-9]{1,10}$');--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_invoice_counter" CHECK ("settings"."invoice_next_number" between 1 and 2147483647);