import { date, integer, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

// Comparable de venta o alquiler cargado manualmente (spec, sección 10.2 /
// 7.11). Es la materia prima de la estimación automática inicial
// (sección 10.3) — nunca se genera sola: alguien la carga a mano o via
// CSV (CLAUDE.md regla 7, no hay integración con portales inmobiliarios
// documentada). pricePerSqm se calcula y persiste al insertar (price /
// areaM2), no es una columna generada: si areaM2 falta, pricePerSqm
// queda null y el comparable no puede usarse en una estimación por m².
export const marketComparables = pgTable("market_comparables", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  transactionType: text("transaction_type").notNull(), // sale, rent
  address: text("address"),
  neighborhood: text("neighborhood"),
  zone: text("zone"),
  latitude: numeric("latitude", { precision: 20, scale: 10 }),
  longitude: numeric("longitude", { precision: 20, scale: 10 }),
  captureDate: date("capture_date").notNull(),
  price: numeric("price", { precision: 20, scale: 6 }).notNull(),
  currency: text("currency").notNull(),
  areaM2: numeric("area_m2", { precision: 20, scale: 6 }),
  pricePerSqm: numeric("price_per_sqm", { precision: 20, scale: 6 }),
  bedrooms: integer("bedrooms"),
  bathrooms: integer("bathrooms"),
  parkingSpaces: integer("parking_spaces"),
  hasTerrace: text("has_terrace"), // yes, no, unknown — evitamos boolean para no fingir certeza sobre datos de portales
  condition: text("condition"), // estado: a estrenar, muy bueno, bueno, a refaccionar...
  constructionYear: integer("construction_year"),
  amenities: text("amenities"), // lista libre separada por coma; catálogo estructurado queda para un tramo posterior
  source: text("source").notNull(),
  url: text("url"),
  comparabilityLevel: text("comparability_level"), // juicio de quien carga el dato: high, medium, low
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid("created_by"),
});
