import { date, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { properties } from "./properties";
import { marketComparables } from "./market-comparables";

// Estimación automática inicial (spec, sección 10.3): nunca una cifra
// única opaca, siempre un rango (min/central/max) con su nivel de
// confianza y los comparables efectivamente usados — nunca se presenta
// como tasación oficial (sección 10.4). Es historial: cada corrida
// queda registrada con su propia fecha, no se sobrescribe.
export const marketEstimates = pgTable("market_estimates", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  propertyId: uuid("property_id")
    .notNull()
    .references(() => properties.id),
  estimateDate: date("estimate_date").notNull(),
  method: text("method").notNull().default("comparables_weighted"),
  currency: text("currency").notNull(),
  valueMin: numeric("value_min", { precision: 20, scale: 6 }),
  valueCentral: numeric("value_central", { precision: 20, scale: 6 }),
  valueMax: numeric("value_max", { precision: 20, scale: 6 }),
  rentMin: numeric("rent_min", { precision: 20, scale: 6 }),
  rentCentral: numeric("rent_central", { precision: 20, scale: 6 }),
  rentMax: numeric("rent_max", { precision: 20, scale: 6 }),
  confidence: text("confidence").notNull(), // low, medium, high — regla propia y documentada, no un estándar externo
  adjustmentsNotes: text("adjustments_notes"), // ajustes manuales que quien estima documenta (superficie, garaje, terraza, estado, antigüedad, amenities)
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid("created_by"),
});

// Comparables efectivamente usados en una estimación, con su ponderación
// (spec 10.3: "usar comparables ponderados"). Se snapshotea el precio/m²
// del comparable al momento de la estimación: si el comparable se marca
// inactivo después, la estimación pasada sigue siendo auditable tal
// como se calculó.
export const marketEstimateComparables = pgTable("market_estimate_comparables", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  marketEstimateId: uuid("market_estimate_id")
    .notNull()
    .references(() => marketEstimates.id),
  marketComparableId: uuid("market_comparable_id")
    .notNull()
    .references(() => marketComparables.id),
  weight: numeric("weight", { precision: 12, scale: 8 }).notNull(), // 0-100, suma 100 dentro de una estimación
  pricePerSqmAtSelection: numeric("price_per_sqm_at_selection", { precision: 20, scale: 6 }).notNull(),
  distanceKm: numeric("distance_km", { precision: 20, scale: 6 }), // distancia geográfica al inmueble (sección 10.2), null si falta lat/long
});
