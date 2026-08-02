import { and, desc, eq, gte, isNull, lte, or } from "drizzle-orm";
import { leases, units, properties, marketEstimates, withOrganizationContext, type Database } from "@farfalla/database";
import { compareMoney, computeRatioPercentage, subtractMoney } from "../decimal";

export interface GetBelowMarketLeasesInput {
  organizationId: string;
  asOfDate: string;
}

export interface BelowMarketLease {
  leaseId: string;
  leaseNumber: string;
  propertyId: string;
  propertyName: string;
  unitId: string;
  unitCode: string;
  currency: string;
  contractualRent: string;
  benchmarkRent: string;
  benchmarkSource: "market_estimate" | "target_rent";
  /** Cuánto por debajo de mercado está la renta contractual, como % del benchmark. */
  gapPercentage: string;
}

/**
 * Propiedades con alquiler inferior al mercado (spec, sección 9.1). El
 * benchmark de mercado, por moneda del contrato: primero la última
 * `market_estimates.rent_central` vigente de la propiedad (sección
 * 10.3); si no hay, `units.target_rent`. Un contrato sin ningún
 * benchmark en su misma moneda queda fuera del reporte — nunca se
 * compara contra una moneda distinta ni se asume un benchmark.
 */
export async function getBelowMarketLeases(db: Database, input: GetBelowMarketLeasesInput): Promise<BelowMarketLease[]> {
  return withOrganizationContext(db, input.organizationId, async (tx) => {
    const activeLeaseRows = await tx
      .select({
        leaseId: leases.id,
        leaseNumber: leases.leaseNumber,
        currency: leases.currency,
        initialRent: leases.initialRent,
        unitId: units.id,
        unitCode: units.unitCode,
        targetRent: units.targetRent,
        targetRentCurrency: units.targetRentCurrency,
        propertyId: properties.id,
        propertyName: properties.name,
      })
      .from(leases)
      .innerJoin(units, eq(units.id, leases.unitId))
      .innerJoin(properties, eq(properties.id, units.propertyId))
      .where(
        and(
          eq(leases.status, "active"),
          lte(leases.startDate, input.asOfDate),
          or(isNull(leases.endDate), gte(leases.endDate, input.asOfDate)),
        ),
      );

    const allEstimates = await tx
      .select({
        propertyId: marketEstimates.propertyId,
        estimateDate: marketEstimates.estimateDate,
        currency: marketEstimates.currency,
        rentCentral: marketEstimates.rentCentral,
      })
      .from(marketEstimates)
      .where(lte(marketEstimates.estimateDate, input.asOfDate))
      .orderBy(desc(marketEstimates.estimateDate));

    const latestEstimateByPropertyCurrency = new Map<string, string>();
    for (const estimate of allEstimates) {
      if (!estimate.rentCentral) continue;
      const key = `${estimate.propertyId}::${estimate.currency}`;
      if (!latestEstimateByPropertyCurrency.has(key)) {
        latestEstimateByPropertyCurrency.set(key, estimate.rentCentral);
      }
    }

    const results: BelowMarketLease[] = [];
    for (const row of activeLeaseRows) {
      const estimateRent = latestEstimateByPropertyCurrency.get(`${row.propertyId}::${row.currency}`);
      const benchmarkRent = estimateRent ?? (row.targetRentCurrency === row.currency ? row.targetRent : null);
      if (!benchmarkRent) continue;

      if (compareMoney(row.initialRent, benchmarkRent) < 0) {
        results.push({
          leaseId: row.leaseId,
          leaseNumber: row.leaseNumber,
          propertyId: row.propertyId,
          propertyName: row.propertyName,
          unitId: row.unitId,
          unitCode: row.unitCode,
          currency: row.currency,
          contractualRent: row.initialRent,
          benchmarkRent,
          benchmarkSource: estimateRent ? "market_estimate" : "target_rent",
          gapPercentage: computeRatioPercentage(subtractMoney(benchmarkRent, row.initialRent), benchmarkRent),
        });
      }
    }

    return results;
  });
}
