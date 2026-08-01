import { boolean, date, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { owners } from "./owners";

// Catálogo de conceptos de comisión (spec, sección 8.10, COMM-001).
// Nunca se hardcodea una tasa de comisión en código — se lee de acá,
// versionada por vigencia (CLAUDE.md regla 4/6).
export const commissionConcepts = pgTable("commission_concepts", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  code: text("code").notNull(),
  name: text("name").notNull(),
  paymentDestination: text("payment_destination").notNull(), // owner | administration
  conceptType: text("concept_type").notNull(), // both | owner | tenant | property
  description: text("description"),
  percentage: numeric("percentage", { precision: 12, scale: 8 }).notNull(),
  minAmount: numeric("min_amount", { precision: 20, scale: 6 }),
  maxAmount: numeric("max_amount", { precision: 20, scale: 6 }),
  hasVat: boolean("has_vat").notNull().default(false),
  hasCommissionTax: boolean("has_commission_tax").notNull().default(false),
  validFrom: date("valid_from").notNull().defaultNow(),
  validTo: date("valid_to"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid("created_by"),
});

// Overrides por propietario (spec, COMM-002): un propietario puntual
// puede tener porcentaje, mínimo, máximo y descripción distintos del
// concepto base, sin duplicar el concepto entero. Un campo en null
// significa "usar el valor del concepto base" (spec, "permitir...
// diferentes", no "reemplazar todo").
export const commissionConceptOverrides = pgTable("commission_concept_overrides", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  commissionConceptId: uuid("commission_concept_id")
    .notNull()
    .references(() => commissionConcepts.id),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => owners.id),
  percentage: numeric("percentage", { precision: 12, scale: 8 }),
  minAmount: numeric("min_amount", { precision: 20, scale: 6 }),
  maxAmount: numeric("max_amount", { precision: 20, scale: 6 }),
  description: text("description"),
  validFrom: date("valid_from").notNull().defaultNow(),
  validTo: date("valid_to"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid("created_by"),
});
