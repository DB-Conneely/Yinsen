ALTER TABLE "messages" ADD COLUMN "type" text DEFAULT 'message' NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "chain_id" uuid;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "reply_to" uuid;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "proposal_data" jsonb;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "proposal_message_id" uuid;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "proposal_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_chain_id_messages_id_fk" FOREIGN KEY ("chain_id") REFERENCES "public"."messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_reply_to_messages_id_fk" FOREIGN KEY ("reply_to") REFERENCES "public"."messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_proposal_message_id_messages_id_fk" FOREIGN KEY ("proposal_message_id") REFERENCES "public"."messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "proposal_one_successor" ON "messages" USING btree ("reply_to") WHERE "messages"."reply_to" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "proposal_one_terminal" ON "messages" USING btree ("chain_id") WHERE "messages"."type" in ('accept','reject');--> statement-breakpoint
CREATE INDEX "messages_proposal_chain" ON "messages" USING btree ("chain_id","position");--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_proposal_message_id_unique" UNIQUE("proposal_message_id");--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "message_proposal_shape" CHECK (("messages"."type" = 'message' and "messages"."chain_id" is null and "messages"."reply_to" is null and "messages"."proposal_data" is null) or ("messages"."client_id" is not null and "messages"."chain_id" is not null and (("messages"."type" = 'proposal' and "messages"."chain_id" = "messages"."id" and "messages"."reply_to" is null and "messages"."proposal_data" is not null) or ("messages"."type" = 'counter' and "messages"."reply_to" is not null and "messages"."proposal_data" is not null) or ("messages"."type" in ('accept','reject') and "messages"."reply_to" is not null and "messages"."proposal_data" is null))));--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_proposal_snapshot" CHECK (("projects"."proposal_message_id" is null) = ("projects"."proposal_snapshot" is null));--> statement-breakpoint
CREATE FUNCTION preserve_project_agreement() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.proposal_message_id IS NOT NULL AND
     (NEW.proposal_message_id IS DISTINCT FROM OLD.proposal_message_id OR NEW.proposal_snapshot IS DISTINCT FROM OLD.proposal_snapshot) THEN
    RAISE EXCEPTION 'Accepted proposal identity and snapshot are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER preserve_project_agreement BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION preserve_project_agreement();
