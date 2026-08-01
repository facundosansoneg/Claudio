import { date, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { properties } from "./properties";

// Gasto de propiedad (spec, sección 7.9). Nace registrado; la
// distribución entre propietarios es un paso separado y auditable
// (allocation_runs), nunca implícito — misma separación
// operación/fiscalidad que el ciclo del alquiler (CLAUDE.md regla 5).
export const expenses = pgTable("expenses", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  propertyId: uuid("property_id")
    .notNull()
    .references(() => properties.id),
  vendorName: text("vendor_name"),
  documentReference: text("document_reference"),
  expenseDate: date("expense_date").notNull(),
  dueDate: date("due_date"),
  category: text("category").notNull(),
  // opex, maintenance, repair, capex, tax, insurance, fee, financial
  classification: text("classification").notNull(),
  // none, full, partial — spec: "Recuperable al inquilino: sí/no/parcial"
  tenantRecoverability: text("tenant_recoverability").notNull().default("none"),
  currency: text("currency").notNull().default("UYU"),
  amount: numeric("amount", { precision: 20, scale: 6 }).notNull(),
  approvalStatus: text("approval_status").notNull().default("pending"), // pending, approved, rejected
  paymentStatus: text("payment_status").notNull().default("unpaid"), // unpaid, paid
  allocationStatus: text("allocation_status").notNull().default("unallocated"), // unallocated, allocated
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid("created_by"),
});
