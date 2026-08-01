CREATE TABLE "commission_concept_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"commission_concept_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"percentage" numeric(12, 8),
	"min_amount" numeric(20, 6),
	"max_amount" numeric(20, 6),
	"description" text,
	"valid_from" date DEFAULT now() NOT NULL,
	"valid_to" date,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "commission_concepts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"payment_destination" text NOT NULL,
	"concept_type" text NOT NULL,
	"description" text,
	"percentage" numeric(12, 8) NOT NULL,
	"min_amount" numeric(20, 6),
	"max_amount" numeric(20, 6),
	"has_vat" boolean DEFAULT false NOT NULL,
	"has_commission_tax" boolean DEFAULT false NOT NULL,
	"valid_from" date DEFAULT now() NOT NULL,
	"valid_to" date,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
ALTER TABLE "commission_concept_overrides" ADD CONSTRAINT "commission_concept_overrides_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_concept_overrides" ADD CONSTRAINT "commission_concept_overrides_commission_concept_id_commission_concepts_id_fk" FOREIGN KEY ("commission_concept_id") REFERENCES "public"."commission_concepts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_concept_overrides" ADD CONSTRAINT "commission_concept_overrides_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_concepts" ADD CONSTRAINT "commission_concepts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;