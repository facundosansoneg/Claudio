import { date, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { leases } from "./leases";

// Obligación a cobrar (spec, sección 7.7). El devengamiento
// (GenerateRentCharges) crea estas filas; el cobro y la contabilización
// son pasos separados (sección 3.4).
export const charges = pgTable("charges", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  leaseId: uuid("lease_id")
    .notNull()
    .references(() => leases.id),
  chargeType: text("charge_type").notNull(), // rent, consumption, late_fee, adjustment, deposit, other
  period: text("period").notNull(), // "YYYY-MM"
  dueDate: date("due_date").notNull(),
  currency: text("currency").notNull(),
  originalAmount: numeric("original_amount", { precision: 20, scale: 6 }).notNull(),
  balance: numeric("balance", { precision: 20, scale: 6 }).notNull(),
  status: text("status").notNull().default("pending"), // pending, partially_paid, paid, cancelled
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid("created_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid("updated_by"),
});
