import { integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

// Lote de importación genérico (spec, sección 16, Hito 7). No hay
// formato ni esquema real de SGA todavía (docs/open-decisions.md,
// ítem 8) — este es el importador CSV genérico y configurable que
// CLAUDE.md regla 7 pide mientras tanto: entityType identifica qué se
// está importando (hoy solo "owners"), no un parser específico de SGA.
// Un lote nunca se re-commitea: una vez "committed" es evidencia
// inmutable de qué se importó y cuándo (spec 16.1, "mantener evidencia
// de cada lote importado").
export const importBatches = pgTable("import_batches", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  entityType: text("entity_type").notNull(), // owners (únicas soportada hoy); properties, tenants, etc. quedan para tramos futuros
  sourceFilename: text("source_filename"),
  status: text("status").notNull().default("validated"), // validated, committed, failed
  totalRows: integer("total_rows").notNull(),
  validRowCount: integer("valid_row_count").notNull(),
  invalidRowCount: integer("invalid_row_count").notNull(),
  importedRowCount: integer("imported_row_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid("created_by"),
  committedAt: timestamp("committed_at", { withTimezone: true }),
  committedBy: uuid("committed_by"),
});

// Cada fila cruda del CSV, con su resultado de validación (spec 16.3:
// los controles de migración necesitan poder auditar fila por fila, no
// solo el total del lote).
export const importRows = pgTable("import_rows", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  batchId: uuid("batch_id")
    .notNull()
    .references(() => importBatches.id),
  rowNumber: integer("row_number").notNull(),
  rawData: jsonb("raw_data").notNull(),
  status: text("status").notNull(), // valid, invalid, imported
  errors: jsonb("errors"), // string[] cuando status = invalid
  importedEntityId: uuid("imported_entity_id"), // id del owner creado, una vez importada
});
