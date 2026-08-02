import { date, jsonb, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { properties } from "./properties";
import { expenses } from "./expenses";
import { owners } from "./owners";

// Regla de distribución de gastos (spec, sección 7.9). "Drivers de
// gastos" está en la lista de CLAUDE.md regla 4 que exige vigencia —
// nunca se guarda solo la regla "actual". `propertyId` null = regla
// por defecto de la organización; `category` null = aplica a todas
// las categorías de gasto.
export const allocationRules = pgTable("allocation_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  propertyId: uuid("property_id").references(() => properties.id),
  category: text("category"),
  // direct, ownership_percentage, square_meters, unit_count,
  // market_value, rent_billed, rent_collected, days_occupied,
  // lease_count, fixed_percentage, custom_formula (spec, sección 7.9) —
  // implementados en este tramo: direct, ownership_percentage.
  driverType: text("driver_type").notNull(),
  // Config específica del driver (p.ej. fixed_percentage por
  // propietario); vacío para los drivers que no la necesitan.
  driverConfig: jsonb("driver_config").notNull().default({}),
  validFrom: date("valid_from").notNull().defaultNow(),
  validTo: date("valid_to"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid("created_by"),
});

// Ejecución de una distribución (spec, sección 7.9): conserva el gasto
// original, la regla usada, la base y los coeficientes resultantes —
// nunca se recalcula "en caliente" a partir del estado actual, para
// que una distribución ya hecha sea reproducible incluso si la regla
// cambia después.
export const allocationRuns = pgTable("allocation_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  expenseId: uuid("expense_id")
    .notNull()
    .references(() => expenses.id),
  allocationRuleId: uuid("allocation_rule_id")
    .notNull()
    .references(() => allocationRules.id),
  driverType: text("driver_type").notNull(),
  runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
  runBy: uuid("run_by"),
});

export const allocationLines = pgTable("allocation_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  allocationRunId: uuid("allocation_run_id")
    .notNull()
    .references(() => allocationRuns.id),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => owners.id),
  coefficient: numeric("coefficient", { precision: 12, scale: 8 }).notNull(),
  amount: numeric("amount", { precision: 20, scale: 6 }).notNull(),
});
