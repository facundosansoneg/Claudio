import { and, eq, gte, isNotNull, lte } from "drizzle-orm";
import { properties, taxExemptions, units, withOrganizationContext, type Database } from "@farfalla/database";

export interface ExpiringTaxExemption {
  id: string;
  propertyId: string;
  propertyName: string;
  taxType: string;
  reason: string;
  validTo: string;
  daysUntilExpiration: number;
}

export interface GetExpiringTaxExemptionsInput {
  organizationId: string;
  /** Ventana de alerta en días (spec, TAX-004: "días configurables"). */
  daysAhead: number;
  /** TAX-004: "poder limitar el control a viviendas ocupadas". */
  occupiedOnly?: boolean;
  /** Fecha de referencia; por defecto hoy (inyectable para pruebas deterministas). */
  today?: string;
}

function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(`${fromIso}T00:00:00Z`);
  const to = new Date(`${toIso}T00:00:00Z`);
  return Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Exoneraciones fiscales próximas a vencer (spec, TAX-004). Solo alerta
 * sobre exoneraciones con `valid_to` definido (una exoneración sin
 * fecha de fin no vence). No envía nada por sí sola — la automatización
 * de avisos vive en el Hito 6; esto es la consulta que la alimenta.
 */
export async function getExpiringTaxExemptions(
  db: Database,
  input: GetExpiringTaxExemptionsInput,
): Promise<ExpiringTaxExemption[]> {
  return withOrganizationContext(db, input.organizationId, async (tx) => {
    const today = input.today ?? new Date().toISOString().slice(0, 10);
    const horizon = new Date(`${today}T00:00:00Z`);
    horizon.setUTCDate(horizon.getUTCDate() + input.daysAhead);
    const horizonIso = horizon.toISOString().slice(0, 10);

    const rows = await tx
      .select({
        id: taxExemptions.id,
        propertyId: taxExemptions.propertyId,
        propertyName: properties.name,
        taxType: taxExemptions.taxType,
        reason: taxExemptions.reason,
        validTo: taxExemptions.validTo,
      })
      .from(taxExemptions)
      .innerJoin(properties, eq(properties.id, taxExemptions.propertyId))
      .where(
        and(
          eq(taxExemptions.status, "active"),
          isNotNull(taxExemptions.validTo),
          gte(taxExemptions.validTo, today),
          lte(taxExemptions.validTo, horizonIso),
        ),
      );

    if (!input.occupiedOnly) {
      return rows.map((row) => ({
        ...row,
        validTo: row.validTo as string,
        daysUntilExpiration: daysBetween(today, row.validTo as string),
      }));
    }

    const occupiedUnits = await tx
      .select({ propertyId: units.propertyId })
      .from(units)
      .where(eq(units.occupancyStatus, "occupied"));
    const occupiedPropertyIds = new Set(occupiedUnits.map((u) => u.propertyId));

    return rows
      .filter((row) => occupiedPropertyIds.has(row.propertyId))
      .map((row) => ({
        ...row,
        validTo: row.validTo as string,
        daysUntilExpiration: daysBetween(today, row.validTo as string),
      }));
  });
}
