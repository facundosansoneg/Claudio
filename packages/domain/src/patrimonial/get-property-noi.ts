import { and, desc, eq, gte, lte } from "drizzle-orm";
import {
  charges,
  leases,
  units,
  payments,
  paymentAllocations,
  expenses,
  valuations,
  withOrganizationContext,
  type Database,
} from "@farfalla/database";
import { addMoney, computeRatioPercentage, subtractMoney, parseFixedPoint, formatFixedPoint, MONEY_SCALE } from "../decimal";

export interface GetPropertyNoiInput {
  organizationId: string;
  propertyId: string;
  periodStart: string;
  periodEnd: string;
}

export interface PropertyNoiByCurrency {
  currency: string;
  /** Ingreso efectivo simplificado: alquiler realmente cobrado en el período (spec, sección 9.2). No descompone vacancia/incobrables/bonificaciones por separado todavía. */
  collectedIncome: string;
  /** Gastos operativos atribuibles: clasificaciones opex, maintenance, repair, tax e insurance — excluye capex, fee y financial. */
  operatingExpenses: string;
  noi: string;
}

export interface PropertyNoiResult {
  propertyId: string;
  periodStart: string;
  periodEnd: string;
  byCurrency: PropertyNoiByCurrency[];
  /** Yield neto = NOI anualizado / última valoración vigente, solo si coinciden monedas. */
  netYieldPercentage: string | null;
  netYieldCurrency: string | null;
}

const OPERATING_CLASSIFICATIONS = new Set(["opex", "maintenance", "repair", "tax", "insurance"]);

function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(`${fromIso}T00:00:00Z`);
  const to = new Date(`${toIso}T00:00:00Z`);
  return Math.max(1, Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)) + 1);
}

/**
 * NOI simplificado (spec, sección 9.2) y yield neto sobre valor de
 * mercado, por moneda. Simplificaciones explícitas de este tramo:
 *
 * - "Ingreso efectivo" se aproxima como alquiler realmente cobrado en
 *   el período (payment_allocations aplicadas a cargos de la
 *   propiedad) — no descompone pérdida por vacancia, incobrables ni
 *   bonificaciones como líneas separadas todavía.
 * - "Gastos operativos atribuibles" toma expenses con clasificación
 *   opex/maintenance/repair/tax/insurance; excluye capex (es capital,
 *   no operativo, per la fórmula del spec) y fee/financial (ambiguos,
 *   se dejan afuera hasta confirmar el criterio contable).
 * - El NOI se anualiza prorrateando por los días del período elegido
 *   (365/días del período), no asume que el período sea siempre un
 *   año calendario.
 *
 * Nunca mezcla monedas al calcular yield neto — si el NOI está en una
 * moneda distinta de la última valoración, netYieldPercentage es null.
 */
export async function getPropertyNOI(db: Database, input: GetPropertyNoiInput): Promise<PropertyNoiResult> {
  return withOrganizationContext(db, input.organizationId, async (tx) => {
    const incomeRows = await tx
      .select({ currency: payments.currency, appliedAmount: paymentAllocations.appliedAmount })
      .from(paymentAllocations)
      .innerJoin(payments, eq(payments.id, paymentAllocations.paymentId))
      .innerJoin(charges, eq(charges.id, paymentAllocations.chargeId))
      .innerJoin(leases, eq(leases.id, charges.leaseId))
      .innerJoin(units, eq(units.id, leases.unitId))
      .where(
        and(
          eq(units.propertyId, input.propertyId),
          eq(payments.status, "confirmed"),
          gte(payments.paymentDate, input.periodStart),
          lte(payments.paymentDate, input.periodEnd),
        ),
      );

    const expenseRows = await tx
      .select({ currency: expenses.currency, amount: expenses.amount, classification: expenses.classification })
      .from(expenses)
      .where(
        and(
          eq(expenses.propertyId, input.propertyId),
          gte(expenses.expenseDate, input.periodStart),
          lte(expenses.expenseDate, input.periodEnd),
        ),
      );

    const incomeByCurrency = new Map<string, string>();
    for (const row of incomeRows) {
      incomeByCurrency.set(row.currency, addMoney(incomeByCurrency.get(row.currency) ?? "0.000000", row.appliedAmount));
    }

    const expensesByCurrency = new Map<string, string>();
    for (const row of expenseRows) {
      if (!OPERATING_CLASSIFICATIONS.has(row.classification)) continue;
      expensesByCurrency.set(row.currency, addMoney(expensesByCurrency.get(row.currency) ?? "0.000000", row.amount));
    }

    const currencies = new Set([...incomeByCurrency.keys(), ...expensesByCurrency.keys()]);
    const byCurrency: PropertyNoiByCurrency[] = [...currencies].map((currency) => {
      const collectedIncome = incomeByCurrency.get(currency) ?? "0.000000";
      const operatingExpenses = expensesByCurrency.get(currency) ?? "0.000000";
      return { currency, collectedIncome, operatingExpenses, noi: subtractMoney(collectedIncome, operatingExpenses) };
    });

    const [latestValuation] = await tx
      .select()
      .from(valuations)
      .where(and(eq(valuations.propertyId, input.propertyId), lte(valuations.valuationDate, input.periodEnd)))
      .orderBy(desc(valuations.valuationDate))
      .limit(1);

    let netYieldPercentage: string | null = null;
    let netYieldCurrency: string | null = null;
    if (latestValuation) {
      const matching = byCurrency.find((entry) => entry.currency === latestValuation.currency);
      if (matching) {
        const periodDays = daysBetween(input.periodStart, input.periodEnd);
        const annualizedNoi = formatFixedPoint(
          (parseFixedPoint(matching.noi, MONEY_SCALE) * 365n) / BigInt(periodDays),
          MONEY_SCALE,
        );
        netYieldPercentage = computeRatioPercentage(annualizedNoi, latestValuation.value);
        netYieldCurrency = latestValuation.currency;
      }
    }

    return {
      propertyId: input.propertyId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      byCurrency,
      netYieldPercentage,
      netYieldCurrency,
    };
  });
}
