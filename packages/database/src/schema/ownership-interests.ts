import { check, date, numeric, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizations } from "./organizations";
import { owners } from "./owners";
import { properties, units } from "./properties";

// Participación de un propietario en una propiedad o unidad, con cuatro
// dimensiones independientes (spec, sección 7.2): legal, económica, de
// distribución de renta y de aporte fiscal. Es la pieza central que
// reemplaza el mecanismo de "propietarios duplicados" de SGA para
// representar tratamientos fiscales distintos (TAX-003). Cada dimensión
// debe sumar 100% entre todos los propietarios de una property/unit en
// cualquier fecha — validado en packages/domain, no en la base (la suma
// depende de todas las filas vigentes a una fecha, no de una sola fila).
export const ownershipInterests = pgTable(
  "ownership_interests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    propertyId: uuid("property_id").references(() => properties.id),
    unitId: uuid("unit_id").references(() => units.id),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => owners.id),
    legalPercentage: numeric("legal_percentage", { precision: 12, scale: 8 }).notNull(),
    economicPercentage: numeric("economic_percentage", { precision: 12, scale: 8 }).notNull(),
    rentDistributionPercentage: numeric("rent_distribution_percentage", {
      precision: 12,
      scale: 8,
    }).notNull(),
    taxContributionPercentage: numeric("tax_contribution_percentage", {
      precision: 12,
      scale: 8,
    }).notNull(),
    validFrom: date("valid_from").notNull().defaultNow(),
    validTo: date("valid_to"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid("created_by"),
  },
  (table) => [
    // Exactamente uno de property_id / unit_id (spec, sección 7.2: "property_id o unit_id").
    check(
      "ownership_interests_property_xor_unit",
      sql`(${table.propertyId} is not null and ${table.unitId} is null) or (${table.propertyId} is null and ${table.unitId} is not null)`,
    ),
  ],
);
