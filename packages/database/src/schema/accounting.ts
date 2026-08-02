import { date, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { organizations, families } from "./organizations";
import { owners } from "./owners";
import { properties, units } from "./properties";
import { leases } from "./leases";
import { tenants } from "./tenants";

// Plan de cuentas mínimo por organización (spec, sección 7.8; ver
// docs/accounting-rules.md para el listado propuesto).
export const ledgerAccounts = pgTable(
  "ledger_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    accountType: text("account_type").notNull(), // asset, liability, income, expense
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("ledger_accounts_organization_id_code_idx").on(table.organizationId, table.code)],
);

// Ledger inmutable (CLAUDE.md regla 3): un asiento "posted" no se edita
// ni se borra; una corrección es un asiento de reversión enlazado.
export const journalEntries = pgTable("journal_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  economicDate: date("economic_date").notNull(),
  accountingDate: date("accounting_date").notNull(),
  period: text("period").notNull(), // "YYYY-MM"
  source: text("source").notNull(), // charge_generation, payment, receipt_reversal, ...
  sourceDocumentType: text("source_document_type"),
  sourceDocumentId: uuid("source_document_id"),
  status: text("status").notNull().default("posted"), // draft, posted, reversed
  reversedEntryId: uuid("reversed_entry_id"),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid("created_by"),
});

export const journalLines = pgTable("journal_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  journalEntryId: uuid("journal_entry_id")
    .notNull()
    .references(() => journalEntries.id),
  accountId: uuid("account_id")
    .notNull()
    .references(() => ledgerAccounts.id),
  debit: numeric("debit", { precision: 20, scale: 6 }).notNull().default("0"),
  credit: numeric("credit", { precision: 20, scale: 6 }).notNull().default("0"),
  originalCurrency: text("original_currency").notNull(),
  originalAmount: numeric("original_amount", { precision: 20, scale: 6 }).notNull(),
  // Dimensiones (spec, sección 7.8) — todas nullable, se completan según
  // el tipo de línea.
  familyId: uuid("family_id").references(() => families.id),
  ownerId: uuid("owner_id").references(() => owners.id),
  propertyId: uuid("property_id").references(() => properties.id),
  unitId: uuid("unit_id").references(() => units.id),
  leaseId: uuid("lease_id").references(() => leases.id),
  tenantId: uuid("tenant_id").references(() => tenants.id),
});
