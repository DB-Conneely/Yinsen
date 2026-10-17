CREATE TABLE "message_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"storage_key" text NOT NULL,
	"driver" text NOT NULL,
	"size" bigint NOT NULL,
	"mime_type" text NOT NULL,
	"sha256" text NOT NULL,
	CONSTRAINT "message_attachments_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "message_attachment_size" CHECK ("message_attachments"."size" > 0 and "message_attachments"."size" <= 104857600),
	CONSTRAINT "message_attachment_driver" CHECK ("message_attachments"."driver" in ('local','s3'))
);
--> statement-breakpoint
CREATE TABLE "message_reads" (
	"message_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"actor_type" text NOT NULL,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "message_reads_message_id_actor_id_pk" PRIMARY KEY("message_id","actor_id"),
	CONSTRAINT "message_reader_type" CHECK ("message_reads"."actor_type" in ('operator','client'))
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"position" bigserial NOT NULL,
	"client_id" uuid,
	"project_id" uuid,
	"sender_type" text NOT NULL,
	"sender_id" uuid NOT NULL,
	"body" text NOT NULL,
	"fingerprint" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messages_position_unique" UNIQUE("position"),
	CONSTRAINT "message_one_conversation" CHECK (("messages"."client_id" is null) <> ("messages"."project_id" is null)),
	CONSTRAINT "message_sender_type" CHECK ("messages"."sender_type" in ('operator','client')),
	CONSTRAINT "message_body_length" CHECK (length("messages"."body") <= 4000)
);
--> statement-breakpoint
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_reads" ADD CONSTRAINT "message_reads_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "message_attachments_message" ON "message_attachments" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "messages_client_position" ON "messages" USING btree ("client_id","position");--> statement-breakpoint
CREATE INDEX "messages_project_position" ON "messages" USING btree ("project_id","position");