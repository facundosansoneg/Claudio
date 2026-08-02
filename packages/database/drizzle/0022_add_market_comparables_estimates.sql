CREATE TABLE "market_comparables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"transaction_type" text NOT NULL,
	"address" text,
	"neighborhood" text,
	"zone" text,
	"latitude" numeric(20, 10),
	"longitude" numeric(20, 10),
	"capture_date" date NOT NULL,
	"price" numeric(20, 6) NOT NULL,
	"currency" text NOT NULL,
	"area_m2" numeric(20, 6),
	"price_per_sqm" numeric(20, 6),
	"bedrooms" integer,
	"bathrooms" integer,
	"parking_spaces" integer,
	"has_terrace" text,
	"condition" text,
	"construction_year" integer,
	"amenities" text,
	"source" text NOT NULL,
	"url" text,
	"comparability_level" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "market_estimate_comparables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"market_estimate_id" uuid NOT NULL,
	"market_comparable_id" uuid NOT NULL,
	"weight" numeric(12, 8) NOT NULL,
	"price_per_sqm_at_selection" numeric(20, 6) NOT NULL,
	"distance_km" numeric(20, 6)
);
--> statement-breakpoint
CREATE TABLE "market_estimates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"estimate_date" date NOT NULL,
	"method" text DEFAULT 'comparables_weighted' NOT NULL,
	"currency" text NOT NULL,
	"value_min" numeric(20, 6),
	"value_central" numeric(20, 6),
	"value_max" numeric(20, 6),
	"rent_min" numeric(20, 6),
	"rent_central" numeric(20, 6),
	"rent_max" numeric(20, 6),
	"confidence" text NOT NULL,
	"adjustments_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
ALTER TABLE "market_comparables" ADD CONSTRAINT "market_comparables_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_estimate_comparables" ADD CONSTRAINT "market_estimate_comparables_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_estimate_comparables" ADD CONSTRAINT "market_estimate_comparables_market_estimate_id_market_estimates_id_fk" FOREIGN KEY ("market_estimate_id") REFERENCES "public"."market_estimates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_estimate_comparables" ADD CONSTRAINT "market_estimate_comparables_market_comparable_id_market_comparables_id_fk" FOREIGN KEY ("market_comparable_id") REFERENCES "public"."market_comparables"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_estimates" ADD CONSTRAINT "market_estimates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_estimates" ADD CONSTRAINT "market_estimates_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;