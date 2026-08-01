import { date, integer, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { parties } from "./parties";
import { charges } from "./charges";

// Ingreso de fondos (spec, sección 7.7, PAY-001).
export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  payerPartyId: uuid("payer_party_id")
    .notNull()
    .references(() => parties.id),
  paymentDate: date("payment_date").notNull(),
  currency: text("currency").notNull(),
  amount: numeric("amount", { precision: 20, scale: 6 }).notNull(),
  channel: text("channel"),
  bankReference: text("bank_reference"),
  origin: text("origin").notNull().default("tenant"), // tenant, anda, cgn, other
  status: text("status").notNull().default("confirmed"), // confirmed, voided
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid("created_by"),
});

// Asignación de un pago a uno o varios cargos (spec, sección 7.7),
// permite pagos parciales (PAY-005).
export const paymentAllocations = pgTable("payment_allocations", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  paymentId: uuid("payment_id")
    .notNull()
    .references(() => payments.id),
  chargeId: uuid("charge_id")
    .notNull()
    .references(() => charges.id),
  appliedAmount: numeric("applied_amount", { precision: 20, scale: 6 }).notNull(),
  lateFeeApplied: numeric("late_fee_applied", { precision: 20, scale: 6 }).notNull().default("0"),
  discountApplied: numeric("discount_applied", { precision: 20, scale: 6 }).notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Comprobante de una aplicación de pago (spec, sección 7.7, PAY-003/004).
// Un recibo reimpreso conserva su ID y suma reprint_count (CLAUDE.md
// regla 3); una anulación no borra la fila, la marca "voided" y enlaza
// el recibo reversor.
export const receipts = pgTable("receipts", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  receiptNumber: text("receipt_number").notNull(),
  paymentId: uuid("payment_id")
    .notNull()
    .references(() => payments.id),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
  status: text("status").notNull().default("issued"), // issued, voided
  voidReason: text("void_reason"),
  reversalReceiptId: uuid("reversal_receipt_id"),
  reprintCount: integer("reprint_count").notNull().default(0),
  createdBy: uuid("created_by"),
});
