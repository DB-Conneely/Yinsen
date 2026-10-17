CREATE TABLE "deliverables" (
	"id" uuid PRIMARY KEY NOT NULL,
	"milestone_id" uuid NOT NULL,
	"parent_deliverable_id" uuid,
	"version" integer NOT NULL,
	"filename" text NOT NULL,
	"storage_key" text NOT NULL,
	"driver" text NOT NULL,
	"size" bigint NOT NULL,
	"mime_type" text NOT NULL,
	"sha256" text NOT NULL,
	"fingerprint" text NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"released" boolean DEFAULT false NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deliverables_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "deliverables_lineage" CHECK (("deliverables"."parent_deliverable_id" is null and "deliverables"."version"=1) or ("deliverables"."parent_deliverable_id" is not null and "deliverables"."parent_deliverable_id"<>"deliverables"."id" and "deliverables"."version">1)),
	CONSTRAINT "deliverables_size" CHECK ("deliverables"."size">0 and "deliverables"."size"<=104857600),
	CONSTRAINT "deliverables_driver" CHECK ("deliverables"."driver" in ('local','s3'))
);
--> statement-breakpoint
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_milestone_id_milestones_id_fk" FOREIGN KEY ("milestone_id") REFERENCES "public"."milestones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_uploaded_by_operator_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."operator"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "deliverables_id_milestone" ON "deliverables" USING btree ("id","milestone_id");--> statement-breakpoint
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_parent_milestone_fk" FOREIGN KEY ("parent_deliverable_id","milestone_id") REFERENCES "public"."deliverables"("id","milestone_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "deliverables_chain_version" ON "deliverables" USING btree (coalesce("parent_deliverable_id","id"),"version");--> statement-breakpoint
CREATE INDEX "deliverables_milestone" ON "deliverables" USING btree ("milestone_id");
