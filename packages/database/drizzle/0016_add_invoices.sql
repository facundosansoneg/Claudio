CREATE TABLE "invoice_series" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"prefix" text NOT NULL,
	"next_number" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"series_id" uuid NOT NULL,
	"number" text,
	"document_type" text NOT NULL,
	"owner_id" uuid,
	"tenant_id" uuid,
	"description" text NOT NULL,
	"currency" text DEFAULT 'UYU' NOT NULL,
	"amount" numeric(20, 6) NOT NULL,
	"discount_percentage" numeric(12, 8),
	"has_vat" boolean DEFAULT false NOT NULL,
	"vat_percentage" numeric(12, 8),
	"vat_amount" numeric(20, 6),
	"total_amount" numeric(20, 6),
	"status" text DEFAULT 'draft' NOT NULL,
	"issue_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"confirmed_at" timestamp with time zone,
	"confirmed_by" uuid
);
--> statement-breakpoint
ALTER TABLE "invoice_series" ADD CONSTRAINT "invoice_series_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_series_id_invoice_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."invoice_series"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;