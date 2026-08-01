import { and, desc, eq, lte } from "drizzle-orm";
import { leases, units, valuations, withOrganizationContext, type Database } from "@farfalla/database";
import { computeRatioPercentage, formatFixedPoint, MONEY_SCALE, parseFixedPoint, sumFixedPoint } from "../decimal";

export interface GetPropertyYieldInput {
  organizationId: string;
  propertyId: string;
  asOfDate: string;
}

export interface PropertyYieldResult {
  propertyId: string;
  marketValue: string | null;
  marketValueCurrency: string | null;
  valuationDate: string | null;
  /** Alquiler contractual anualizado (spec, sección 9.2), solo de contratos activos en la misma moneda que la valoración. */
  annualizedRent: string | null;
  /**
   * Yield bruto = alquiler anualizado / valor de mercado (spec,
   * sección 9.2). Null si no hay valoración, o si no hay renta
   * activa en la misma moneda que la valoración — nunca se convierte
   * moneda implícitamente para poder calcular un número (CLAUDE.md
   * regla 8).
   */
  grossYieldPercentage: string | null;
}

/**
 * Yield bruto sobre valor de mercado (spec, sección 9.2): la primera
 * métrica del dashboard patrimonial. NOI, yield neto, cash-on-cash,
 * retorno total y XIRR quedan para un tramo posterior — requieren
 * capital invertido acumulado, deuda y series de flujo que todavía no
 * están modeladas.
 */
export async function getPropertyYield(db: Database, input: GetPropertyYieldInput): Promise<PropertyYieldResult> {
  return withOrganizationContext(db, input.organizationId, async (tx) => {
    const [latestValuation] = await tx
      .select()
      .from(valuations)
      .where(and(eq(valuations.propertyId, input.propertyId), lte(valuations.valuationDate, input.asOfDate)))
      .orderBy(desc(valuations.valuationDate))
      .limit(1);

    if (!latestValuation) {
      return {
        propertyId: input.propertyId,
        marketValue: null,
        marketValueCurrency: null,
        valuationDate: null,
        annualizedRent: null,
        grossYieldPercentage: null,
      };
    }

    const activeLeases = await tx
      .select({ initialRent: leases.initialRent, currency: leases.currency })
      .from(leases)
      .innerJoin(units, eq(units.id, leases.unitId))
      .where(
        and(
          eq(units.propertyId, input.propertyId),
          eq(leases.status, "active"),
          lte(leases.startDate, input.asOfDate),
        ),
      );

    const rentsInValuationCurrency = activeLeases.filter((lease) => lease.currency === latestValuation.currency);
    const annualizedRent =
      rentsInValuationCurrency.length === 0
        ? null
        : formatFixedPoint(
            sumFixedPoint(rentsInValuationCurrency.map((lease) => parseFixedPoint(lease.initialRent, MONEY_SCALE) * 12n)),
            MONEY_SCALE,
          );

    const grossYieldPercentage =
      annualizedRent !== null ? computeRatioPercentage(annualizedRent, latestValuation.value) : null;

    return {
      propertyId: input.propertyId,
      marketValue: latestValuation.value,
      marketValueCurrency: latestValuation.currency,
      valuationDate: latestValuation.valuationDate,
      annualizedRent,
      grossYieldPercentage,
    };
  });
}
