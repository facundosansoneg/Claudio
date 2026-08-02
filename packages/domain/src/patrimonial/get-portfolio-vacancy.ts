import { and, eq, lte, or, isNull, gte } from "drizzle-orm";
import { units, leases, withOrganizationContext, type Database } from "@farfalla/database";
import { addMoney, computeCountRatioPercentage, computeRatioPercentage, subtractMoney } from "../decimal";

export interface GetPortfolioVacancyInput {
  organizationId: string;
  asOfDate: string;
}

export interface VacancyByCurrency {
  currency: string;
  potentialGrossRent: string;
  contractedRent: string;
  economicVacancyPercentage: string;
}

export interface PortfolioVacancyResult {
  totalUnits: number;
  vacantUnits: number;
  physicalVacancyPercentage: string | null;
  byCurrency: VacancyByCurrency[];
  /** Unidades vacantes sin target_rent cargado — quedan fuera del cálculo de vacancia económica en vez de asumir 0 (CLAUDE.md regla 7). */
  unitsExcludedForMissingRent: number;
}

/**
 * Vacancia física y económica (spec, sección 9.1). Física = unidades
 * vacantes / unidades totales de la organización. Económica, por
 * moneda = (ingreso bruto potencial − renta contratada) / ingreso
 * bruto potencial, donde el potencial usa la renta del contrato activo
 * para unidades ocupadas y `units.target_rent` para vacantes. Una
 * unidad vacante sin `target_rent` cargado se excluye del cálculo
 * económico en vez de tratarse como potencial cero.
 */
export async function getPortfolioVacancy(db: Database, input: GetPortfolioVacancyInput): Promise<PortfolioVacancyResult> {
  return withOrganizationContext(db, input.organizationId, async (tx) => {
    const allUnits = await tx
      .select({
        id: units.id,
        occupancyStatus: units.occupancyStatus,
        targetRent: units.targetRent,
        targetRentCurrency: units.targetRentCurrency,
      })
      .from(units);

    const totalUnits = allUnits.length;
    const vacantUnits = allUnits.filter((u) => u.occupancyStatus === "vacant").length;
    const physicalVacancyPercentage = totalUnits === 0 ? null : computeCountRatioPercentage(vacantUnits, totalUnits);

    const activeLeases = await tx
      .select({ unitId: leases.unitId, currency: leases.currency, initialRent: leases.initialRent })
      .from(leases)
      .where(
        and(
          eq(leases.status, "active"),
          lte(leases.startDate, input.asOfDate),
          or(isNull(leases.endDate), gte(leases.endDate, input.asOfDate)),
        ),
      );
    const activeLeaseByUnit = new Map(activeLeases.map((l) => [l.unitId, l]));

    const potentialByCurrency = new Map<string, string>();
    const contractedByCurrency = new Map<string, string>();
    let unitsExcludedForMissingRent = 0;

    for (const unit of allUnits) {
      const activeLease = activeLeaseByUnit.get(unit.id);
      if (activeLease) {
        potentialByCurrency.set(
          activeLease.currency,
          addMoney(potentialByCurrency.get(activeLease.currency) ?? "0.000000", activeLease.initialRent),
        );
        contractedByCurrency.set(
          activeLease.currency,
          addMoney(contractedByCurrency.get(activeLease.currency) ?? "0.000000", activeLease.initialRent),
        );
      } else if (unit.targetRent) {
        const currency = unit.targetRentCurrency;
        potentialByCurrency.set(currency, addMoney(potentialByCurrency.get(currency) ?? "0.000000", unit.targetRent));
      } else {
        unitsExcludedForMissingRent += 1;
      }
    }

    const byCurrency: VacancyByCurrency[] = [...potentialByCurrency.entries()].map(([currency, potentialGrossRent]) => {
      const contractedRent = contractedByCurrency.get(currency) ?? "0.000000";
      return {
        currency,
        potentialGrossRent,
        contractedRent,
        economicVacancyPercentage: computeRatioPercentage(
          subtractMoney(potentialGrossRent, contractedRent),
          potentialGrossRent,
        ),
      };
    });

    return { totalUnits, vacantUnits, physicalVacancyPercentage, byCurrency, unitsExcludedForMissingRent };
  });
}
