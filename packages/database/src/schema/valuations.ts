import { date, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { properties } from "./properties";

// Valoración manual estructurada (spec, sección 10.1 — etapa V1 de
// gestión patrimonial; comparables y estimación automática son un
// tramo posterior, sección 10.2/10.3). Es historial, no un "valor
// actual" mutable: cada tasación queda registrada con su propia fecha,
// nunca se sobrescribe (CLAUDE.md regla 4, "valores de mercado" está
// en la lista de vigencia obligatoria).
export const valuations = pgTable("valuations", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  propertyId: uuid("property_id")
    .notNull()
    .references(() => properties.id),
  valuationDate: date("valuation_date").notNull(),
  value: numeric("value", { precision: 20, scale: 6 }).notNull(),
  currency: text("currency").notNull().default("USD"),
  source: text("source"), // tasador externo, corredor, catastro, estimación interna...
  method: text("method"), // comparables, costo, ingreso, catastral...
  appraiser: text("appraiser"),
  confidence: text("confidence"), // low, medium, high
  notes: text("notes"),
  fileReference: text("file_reference"), // key en el storage de packages/documents, si hay respaldo adjunto
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid("created_by"),
});
