import { and, lte, ne } from "drizzle-orm";
import { charges, withOrganizationContext, type Database } from "@farfalla/database";
import { addMoney, computeRatioPercentage } from "../decimal";

export interface GetPortfolioDelinquencyInput {
  organizationId: string;
  asOfDate: string;
}

export interface DelinquencyByCurrency {
  currency: string;
  billed: string;
  overdueBalance: string;
  delinquencyPercentage: string;
}

export interface PortfolioDelinquencyResult {
  byCurrency: DelinquencyByCurrency[];
}

/**
 * Morosidad (spec, sección 9.1): saldo vencido sin cobrar / total
 * facturado, por moneda, sobre los cargos con vencimiento a la fecha
 * de corte o anterior (se excluyen los anulados). No mezcla monedas —
 * cada moneda calcula su propio porcentaje.
 */
export async function getPortfolioDelinquency(
  db: Database,
  input: GetPortfolioDelinquencyInput,
): Promise<PortfolioDelinquencyResult> {
  return withOrganizationContext(db, input.organizationId, async (tx) => {
    const dueCharges = await tx
      .select({ currency: charges.currency, originalAmount: charges.originalAmount, balance: charges.balance })
      .from(charges)
      .where(and(lte(charges.dueDate, input.asOfDate), ne(charges.status, "cancelled")));

    const billedByCurrency = new Map<string, string>();
    const overdueByCurrency = new Map<string, string>();

    for (const charge of dueCharges) {
      billedByCurrency.set(charge.currency, addMoney(billedByCurrency.get(charge.currency) ?? "0.000000", charge.originalAmount));
      overdueByCurrency.set(charge.currency, addMoney(overdueByCurrency.get(charge.currency) ?? "0.000000", charge.balance));
    }

    const byCurrency: DelinquencyByCurrency[] = [...billedByCurrency.entries()].map(([currency, billed]) => ({
      currency,
      billed,
      overdueBalance: overdueByCurrency.get(currency) ?? "0.000000",
      delinquencyPercentage: computeRatioPercentage(overdueByCurrency.get(currency) ?? "0.000000", billed),
    }));

    return { byCurrency };
  });
}
