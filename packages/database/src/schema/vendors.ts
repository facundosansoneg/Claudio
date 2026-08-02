import { date, integer, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { properties, units } from "./properties";
import { expenses } from "./expenses";

// Proveedor (spec, sección 11.3). "Evaluación" es una calificación
// numérica 1-5 (no hay una escala más fina especificada en el spec);
// "historial de trabajos" no es una columna acá — se deriva de las
// work_orders que lo referencian, no se duplica.
export const vendors = pgTable("vendors", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  legalName: text("legal_name").notNull(),
  taxId: text("tax_id"), // RUT u otro documento legal
  category: text("category"), // rubro: plomería, electricidad, jardinería...
  contactName: text("contact_name"),
  email: text("email"),
  phone: text("phone"),
  bankAccountInfo: text("bank_account_info"),
  rating: integer("rating"), // evaluación 1-5
  notes: text("notes"),
  insuranceReference: text("insurance_reference"),
  insuranceExpiryDate: date("insurance_expiry_date"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid("created_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid("updated_by"),
});

// Orden de trabajo (spec, sección 11.2). Flujo: solicitud -> diagnóstico
// -> presupuesto -> aprobación -> ejecución -> control -> cierre ->
// gasto. `expenseId` se completa recién al cerrar, cuando closeWorkOrder
// crea el gasto real — antes de eso es null a propósito, no una
// estimación disfrazada de gasto. Varios presupuestos, fotos antes/
// después y SLA quedan para un tramo posterior (CLAUDE.md regla 6: no
// hay todavía un caso real que fije esa estructura).
export const workOrders = pgTable("work_orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  title: text("title").notNull(),
  description: text("description"),
  propertyId: uuid("property_id").references(() => properties.id),
  unitId: uuid("unit_id").references(() => units.id),
  vendorId: uuid("vendor_id").references(() => vendors.id),
  classification: text("classification").notNull().default("opex"), // opex, capex
  tenantRecoverable: text("tenant_recoverable").notNull().default("none"), // none, full, partial — mismo catálogo que expenses.tenant_recoverability
  currency: text("currency").notNull().default("UYU"),
  estimatedCost: numeric("estimated_cost", { precision: 20, scale: 6 }),
  actualCost: numeric("actual_cost", { precision: 20, scale: 6 }),
  ownerApproved: text("owner_approved").notNull().default("pending"), // pending, approved, rejected
  status: text("status").notNull().default("requested"), // requested, diagnosed, budgeted, approved, in_execution, controlled, closed, rejected
  expenseId: uuid("expense_id").references(() => expenses.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid("created_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid("updated_by"),
});
