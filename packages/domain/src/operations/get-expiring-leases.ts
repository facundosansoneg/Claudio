import { and, eq, gte, lte } from "drizzle-orm";
import { leases, units, properties, withOrganizationContext, type Database } from "@farfalla/database";

export interface ExpiringLease {
  leaseId: string;
  leaseNumber: string;
  propertyId: string;
  propertyName: string;
  unitCode: string;
  endDate: string;
  daysUntilExpiration: number;
}

export interface GetExpiringLeasesInput {
  organizationId: string;
  /** Ventana de alerta en días (spec, CTRL-001: "días previos configurables"). */
  daysAhead: number;
  today?: string;
}

function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(`${fromIso}T00:00:00Z`);
  const to = new Date(`${toIso}T00:00:00Z`);
  return Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Contratos próximos a vencer (spec, CTRL-001). Solo contratos activos
 * cuyo `end_date` cae dentro de la ventana de días configurada.
 */
export async function getExpiringLeases(db: Database, input: GetExpiringLeasesInput): Promise<ExpiringLease[]> {
  return withOrganizationContext(db, input.organizationId, async (tx) => {
    const today = input.today ?? new Date().toISOString().slice(0, 10);
    const horizon = new Date(`${today}T00:00:00Z`);
    horizon.setUTCDate(horizon.getUTCDate() + input.daysAhead);
    const horizonIso = horizon.toISOString().slice(0, 10);

    const rows = await tx
      .select({
        leaseId: leases.id,
        leaseNumber: leases.leaseNumber,
        endDate: leases.endDate,
        unitCode: units.unitCode,
        propertyId: properties.id,
        propertyName: properties.name,
      })
      .from(leases)
      .innerJoin(units, eq(units.id, leases.unitId))
      .innerJoin(properties, eq(properties.id, units.propertyId))
      .where(and(eq(leases.status, "active"), gte(leases.endDate, today), lte(leases.endDate, horizonIso)));

    return rows.map((row) => ({ ...row, daysUntilExpiration: daysBetween(today, row.endDate) }));
  });
}
