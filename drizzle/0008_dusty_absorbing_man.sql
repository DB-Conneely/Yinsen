CREATE TABLE "checkout_attempts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"invoice_id" uuid NOT NULL,
	"fingerprint" text NOT NULL,
	"account_id" text NOT NULL,
	"livemode" boolean NOT NULL,
	"amount" integer NOT NULL,
	"currency" text NOT NULL,
	"provider_amount" bigint NOT NULL,
	"idempotency_key" text NOT NULL,
	"parameters" jsonb NOT NULL,
	"session_id" text,
	"state" text DEFAULT 'uncertain' NOT NULL,
	"problem" text,
	"expiration_failed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "checkout_attempts_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "checkout_attempts_session_id_unique" UNIQUE("session_id"),
	CONSTRAINT "checkout_state" CHECK ("checkout_attempts"."state" in ('uncertain','open','complete','expired','failed')),
	CONSTRAINT "checkout_amount" CHECK ("checkout_attempts"."amount">0 and "checkout_attempts"."provider_amount">0)
);
--> statement-breakpoint
CREATE TABLE "stripe_events" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"attempt_id" uuid,
	"outcome" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stripe_payments" (
	"payment_id" text PRIMARY KEY NOT NULL,
	"attempt_id" uuid NOT NULL,
	"event_id" text NOT NULL,
	"session_id" text NOT NULL,
	"amount" bigint NOT NULL,
	"currency" text NOT NULL,
	"exception" text,
	"resolution" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "checkout_attempts" ADD CONSTRAINT "checkout_attempts_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stripe_events" ADD CONSTRAINT "stripe_events_attempt_id_checkout_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."checkout_attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stripe_payments" ADD CONSTRAINT "stripe_payments_attempt_id_checkout_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."checkout_attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stripe_payments" ADD CONSTRAINT "stripe_payments_event_id_stripe_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."stripe_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "checkout_invoice" ON "checkout_attempts" USING btree ("invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "checkout_one_active" ON "checkout_attempts" USING btree ("invoice_id") WHERE "checkout_attempts"."state" in ('uncertain','open');
