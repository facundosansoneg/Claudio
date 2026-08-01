import { boolean, date, integer, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { owners } from "./owners";
import { tenants } from "./tenants";

// Series de numeración (spec, sección 3.5 y CLAUDE.md regla 6: "series/
// numeración" es explícitamente config, nunca hardcodeada). Cada serie
// lleva su propio contador — dos series distintas nunca comparten
// numeración.
export const invoiceSeries = pgTable("invoice_series", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  code: text("code").notNull(),
  name: text("name").notNull(),
  prefix: text("prefix").notNull(),
  nextNumber: integer("next_number").notNull().default(1),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid("created_by"),
});

// Facturación manual (spec, INV-001). Nace en 'draft' (editable, sin
// número) y pasa a 'confirmed' recién al confirmar — ahí se le asigna
// el número secuencial de la serie y queda inmutable (CLAUDE.md regla
// 3: un documento confirmado no se edita, solo se anula/nota de
// crédito en un tramo posterior — INV-003).
export const invoices = pgTable("invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  seriesId: uuid("series_id")
    .notNull()
    .references(() => invoiceSeries.id),
  number: text("number"), // null mientras está en draft
  documentType: text("document_type").notNull(),
  ownerId: uuid("owner_id").references(() => owners.id),
  tenantId: uuid("tenant_id").references(() => tenants.id),
  description: text("description").notNull(),
  currency: text("currency").notNull().default("UYU"),
  amount: numeric("amount", { precision: 20, scale: 6 }).notNull(),
  discountPercentage: numeric("discount_percentage", { precision: 12, scale: 8 }),
  hasVat: boolean("has_vat").notNull().default(false),
  vatPercentage: numeric("vat_percentage", { precision: 12, scale: 8 }),
  vatAmount: numeric("vat_amount", { precision: 20, scale: 6 }),
  totalAmount: numeric("total_amount", { precision: 20, scale: 6 }),
  status: text("status").notNull().default("draft"), // draft, confirmed, voided
  issueDate: date("issue_date"), // solo se fija al confirmar
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid("created_by"),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  confirmedBy: uuid("confirmed_by"),
});
