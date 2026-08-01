CREATE TABLE "owner_group_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"owner_group_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"percentage" numeric(12, 8),
	"rule" text,
	"valid_from" date DEFAULT now() NOT NULL,
	"valid_to" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "owner_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"notes" text,
	"valid_from" date DEFAULT now() NOT NULL,
	"valid_to" date,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "owners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"party_id" uuid NOT NULL,
	"family_id" uuid,
	"legacy_sga_code" text,
	"settlement_type" text DEFAULT 'normal' NOT NULL,
	"send_invoices_and_withholdings_automatically" boolean DEFAULT false NOT NULL,
	"block_manual_movements" boolean DEFAULT false NOT NULL,
	"payment_instructions" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "properties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"internal_code" text NOT NULL,
	"legacy_sga_code" text,
	"name" text NOT NULL,
	"property_type" text NOT NULL,
	"cadastral_number" text,
	"street" text,
	"door_number" text,
	"apartment" text,
	"neighborhood" text,
	"city" text,
	"department" text,
	"country" text DEFAULT 'Uruguay' NOT NULL,
	"postal_code" text,
	"latitude" numeric(20, 10),
	"longitude" numeric(20, 10),
	"occupancy_status" text DEFAULT 'vacant' NOT NULL,
	"construction_year" integer,
	"land_area_m2" numeric(20, 6),
	"built_area_m2" numeric(20, 6),
	"reference_currency" text DEFAULT 'UYU' NOT NULL,
	"acquisition_value" numeric(20, 6),
	"acquisition_date" date,
	"acquisition_expenses" numeric(20, 6),
	"asset_status" text DEFAULT 'active' NOT NULL,
	"notes" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"unit_code" text NOT NULL,
	"unit_type" text NOT NULL,
	"bedrooms" integer,
	"bathrooms" integer,
	"parking_spaces" integer,
	"area_m2" numeric(20, 6),
	"occupancy_status" text DEFAULT 'vacant' NOT NULL,
	"target_rent" numeric(20, 6),
	"target_rent_currency" text DEFAULT 'UYU' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "ownership_interests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"property_id" uuid,
	"unit_id" uuid,
	"owner_id" uuid NOT NULL,
	"legal_percentage" numeric(12, 8) NOT NULL,
	"economic_percentage" numeric(12, 8) NOT NULL,
	"rent_distribution_percentage" numeric(12, 8) NOT NULL,
	"tax_contribution_percentage" numeric(12, 8) NOT NULL,
	"valid_from" date DEFAULT now() NOT NULL,
	"valid_to" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	CONSTRAINT "ownership_interests_property_xor_unit" CHECK (("ownership_interests"."property_id" is not null and "ownership_interests"."unit_id" is null) or ("ownership_interests"."property_id" is null and "ownership_interests"."unit_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "owner_group_members" ADD CONSTRAINT "owner_group_members_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_group_members" ADD CONSTRAINT "owner_group_members_owner_group_id_owner_groups_id_fk" FOREIGN KEY ("owner_group_id") REFERENCES "public"."owner_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_group_members" ADD CONSTRAINT "owner_group_members_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_groups" ADD CONSTRAINT "owner_groups_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owners" ADD CONSTRAINT "owners_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owners" ADD CONSTRAINT "owners_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owners" ADD CONSTRAINT "owners_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ownership_interests" ADD CONSTRAINT "ownership_interests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ownership_interests" ADD CONSTRAINT "ownership_interests_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ownership_interests" ADD CONSTRAINT "ownership_interests_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ownership_interests" ADD CONSTRAINT "ownership_interests_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE no action ON UPDATE no action;