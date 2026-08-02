import { date, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { properties } from "./properties";

// Exoneración fiscal por vivienda (spec, sección 8.8, TAX-002). Se
// asigna a la propiedad — no al propietario — con vigencia y
// respaldo documental, para poder modelar una misma persona con
// propiedades gravadas y exoneradas sin duplicarla (a diferencia del
// mecanismo SGA de "propietarios duplicados").
export const taxExemptions = pgTable("tax_exemptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  propertyId: uuid("property_id")
    .notNull()
    .references(() => properties.id),
  taxType: text("tax_type").notNull(), // irpf, irnr, other — misma dimensión que tax_profiles.tax_type
  reason: text("reason").notNull(),
  documentReference: text("document_reference"), // respaldo documental (nº de resolución, expediente, etc.)
  validFrom: date("valid_from").notNull(),
  validTo: date("valid_to"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid("created_by"),
});
