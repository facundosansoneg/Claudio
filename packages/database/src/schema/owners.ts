import { boolean, date, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { families, organizations } from "./organizations";
import { parties } from "./parties";

// Propietario: un rol sobre una party (spec, sección 7.2). No duplica la
// persona — resuelve directamente OWN-003/TAX-002 sin necesitar el
// mecanismo de "propietarios duplicados" de SGA (ver docs/domain-model.md).
export const owners = pgTable("owners", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  partyId: uuid("party_id")
    .notNull()
    .references(() => parties.id),
  familyId: uuid("family_id").references(() => families.id),
  legacySgaCode: text("legacy_sga_code"),
  settlementType: text("settlement_type").notNull().default("normal"), // normal, group
  sendInvoicesAndWithholdingsAutomatically: boolean("send_invoices_and_withholdings_automatically")
    .notNull()
    .default(false),
  blockManualMovements: boolean("block_manual_movements").notNull().default(false),
  paymentInstructions: text("payment_instructions"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid("created_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid("updated_by"),
});

// Grupo operativo y fiscal de propietarios (spec, sección 7.2, OWN-003).
export const ownerGroups = pgTable("owner_groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  name: text("name").notNull(),
  notes: text("notes"),
  validFrom: date("valid_from").notNull().defaultNow(),
  validTo: date("valid_to"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid("created_by"),
});

export const ownerGroupMembers = pgTable("owner_group_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  ownerGroupId: uuid("owner_group_id")
    .notNull()
    .references(() => ownerGroups.id),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => owners.id),
  percentage: numeric("percentage", { precision: 12, scale: 8 }),
  rule: text("rule"),
  validFrom: date("valid_from").notNull().defaultNow(),
  validTo: date("valid_to"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid("created_by"),
});
