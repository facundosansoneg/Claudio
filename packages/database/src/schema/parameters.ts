import { date, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

// Tabla de configuración genérica (spec, sección 3.5): tipos de
// documento, conceptos de movimiento, tasas fiscales, tipos de garantía,
// reglas de mora, tipos de reajuste, conceptos de comisión, tipos de
// factura, series/numeración, reglas de distribución y fuentes de
// cotización/índice. Cada categoría define su propia forma dentro de
// `value` (jsonb); los hitos siguientes agregan validación Zod por
// categoría en packages/domain sin requerir una tabla nueva por concepto.
export const parameters = pgTable("parameters", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  category: text("category").notNull(),
  code: text("code").notNull(),
  label: text("label").notNull(),
  value: jsonb("value").notNull().default({}),
  validFrom: date("valid_from").notNull().defaultNow(),
  validTo: date("valid_to"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid("created_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid("updated_by"),
});
