import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { parties } from "./parties";

// Inquilino: otro rol sobre una party (spec, sección 7.4, TEN-001), igual
// que owners — no duplica la persona si además es propietaria o garante.
export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  partyId: uuid("party_id")
    .notNull()
    .references(() => parties.id),
  legacySgaCode: text("legacy_sga_code"),
  bankReference: text("bank_reference"),
  communicationPreference: text("communication_preference"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid("created_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid("updated_by"),
});
