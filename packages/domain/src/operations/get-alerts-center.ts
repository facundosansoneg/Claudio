import { type Database } from "@farfalla/database";
import { getExpiringTaxExemptions, type ExpiringTaxExemption } from "../accounting/expiring-tax-exemptions";
import { getExpiringLeases, type ExpiringLease } from "./get-expiring-leases";
import { getOverdueTasks, type OverdueTask } from "./get-overdue-tasks";
import { getPortfolioDelinquency, type DelinquencyByCurrency } from "../patrimonial/get-portfolio-delinquency";
import { getBelowMarketLeases, type BelowMarketLease } from "../patrimonial/get-below-market-leases";

export interface GetAlertsCenterInput {
  organizationId: string;
  /** Ventana de alerta en días para exoneraciones y contratos (spec, CTRL-001). */
  daysAhead: number;
  today?: string;
}

export interface AlertsCenterResult {
  expiringTaxExemptions: ExpiringTaxExemption[];
  expiringLeases: ExpiringLease[];
  overdueTasks: OverdueTask[];
  delinquencyByCurrency: DelinquencyByCurrency[];
  belowMarketLeases: BelowMarketLease[];
}

/**
 * Centro de alertas (spec, CTRL-001/CTRL-002). Combina las señales ya
 * modeladas: exoneraciones y contratos próximos a vencer, tareas
 * vencidas, alquileres vencidos (morosidad) y rentas por debajo de
 * mercado. Quedan explícitamente afuera — porque no hay dato real
 * detrás todavía, no por omisión — pagos sin aplicar, saldos a favor y
 * conciliaciones pendientes (sección 12, conciliación bancaria no
 * implementada), documentos vencidos y seguros próximos a vencer
 * (no hay tracking de vencimientos documentales/pólizas), gastos fuera
 * de presupuesto (no hay feature de presupuesto) y propiedades con
 * rendimiento inferior al objetivo (no hay un "yield objetivo" por
 * propiedad configurado), y reajustes próximos (adjustment_schedule,
 * sección 7.6, todavía no implementada).
 */
export async function getAlertsCenter(db: Database, input: GetAlertsCenterInput): Promise<AlertsCenterResult> {
  const today = input.today ?? new Date().toISOString().slice(0, 10);

  const [expiringTaxExemptions, expiringLeases, overdueTasks, delinquency, belowMarketLeases] = await Promise.all([
    getExpiringTaxExemptions(db, { organizationId: input.organizationId, daysAhead: input.daysAhead, today }),
    getExpiringLeases(db, { organizationId: input.organizationId, daysAhead: input.daysAhead, today }),
    getOverdueTasks(db, { organizationId: input.organizationId, today }),
    getPortfolioDelinquency(db, { organizationId: input.organizationId, asOfDate: today }),
    getBelowMarketLeases(db, { organizationId: input.organizationId, asOfDate: today }),
  ]);

  return {
    expiringTaxExemptions,
    expiringLeases,
    overdueTasks,
    delinquencyByCurrency: delinquency.byCurrency,
    belowMarketLeases,
  };
}
