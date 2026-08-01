import { date, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { owners } from "./owners";

// Perfil fiscal del propietario (spec, sección 7.10, TAX-001). La tasa
// nunca se hardcodea en código (CLAUDE.md regla 6/13): siempre se lee de
// acá, versionada por vigencia.
export const taxProfiles = pgTable("tax_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => owners.id),
  taxType: text("tax_type").notNull(), // irpf, irnr, other
  percentage: numeric("percentage", { precision: 12, scale: 8 }).notNull(),
  taxResidency: text("tax_residency"),
  source: text("source"), // fundamento/norma
  validFrom: date("valid_from").notNull().defaultNow(),
  validTo: date("valid_to"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid("created_by"),
});
