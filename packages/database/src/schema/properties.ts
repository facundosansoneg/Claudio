import { date, integer, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

// Propiedad (spec, sección 7.3, PROP-001/002): identificada normalmente
// por padrón y dirección. Distinta de "unidad" (espacio arrendable
// dentro de la propiedad, PROP-003).
export const properties = pgTable("properties", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  internalCode: text("internal_code").notNull(),
  legacySgaCode: text("legacy_sga_code"),
  name: text("name").notNull(),
  propertyType: text("property_type").notNull(), // apartamento, casa, local, terreno, otro
  cadastralNumber: text("cadastral_number"), // padrón
  street: text("street"),
  doorNumber: text("door_number"),
  apartment: text("apartment"),
  neighborhood: text("neighborhood"),
  city: text("city"),
  department: text("department"),
  country: text("country").notNull().default("Uruguay"),
  postalCode: text("postal_code"),
  latitude: numeric("latitude", { precision: 20, scale: 10 }),
  longitude: numeric("longitude", { precision: 20, scale: 10 }),
  occupancyStatus: text("occupancy_status").notNull().default("vacant"), // vacant, occupied
  constructionYear: integer("construction_year"),
  landAreaM2: numeric("land_area_m2", { precision: 20, scale: 6 }),
  builtAreaM2: numeric("built_area_m2", { precision: 20, scale: 6 }),
  referenceCurrency: text("reference_currency").notNull().default("UYU"),
  acquisitionValue: numeric("acquisition_value", { precision: 20, scale: 6 }),
  acquisitionDate: date("acquisition_date"),
  acquisitionExpenses: numeric("acquisition_expenses", { precision: 20, scale: 6 }),
  assetStatus: text("asset_status").notNull().default("active"), // active, sold, inactive
  notes: text("notes"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid("created_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid("updated_by"),
});

// Unidad arrendable dentro de una propiedad (spec, sección 7.3, PROP-003).
export const units = pgTable("units", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  propertyId: uuid("property_id")
    .notNull()
    .references(() => properties.id),
  unitCode: text("unit_code").notNull(), // puerta/apartamento/local
  unitType: text("unit_type").notNull(),
  bedrooms: integer("bedrooms"),
  bathrooms: integer("bathrooms"),
  parkingSpaces: integer("parking_spaces"),
  areaM2: numeric("area_m2", { precision: 20, scale: 6 }),
  occupancyStatus: text("occupancy_status").notNull().default("vacant"),
  targetRent: numeric("target_rent", { precision: 20, scale: 6 }),
  targetRentCurrency: text("target_rent_currency").notNull().default("UYU"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid("created_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid("updated_by"),
});
