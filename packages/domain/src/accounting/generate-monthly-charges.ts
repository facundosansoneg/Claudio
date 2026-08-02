import { and, eq, gte, isNull, lte, or } from "drizzle-orm";
import { leases, withOrganizationContext, type Database } from "@farfalla/database";
import { generateCharge } from "./generate-charge";

export interface GenerateMonthlyChargesInput {
  organizationId: string;
  /** "YYYY-MM" */
  period: string;
  triggeredBy: string | null; // null = job/sistema
}

export interface GenerateMonthlyChargesResult {
  period: string;
  created: number;
  alreadyExisted: number;
  leaseIds: string[];
}

function dueDateFor(period: string, dueDay: number | null): string {
  const day = dueDay && dueDay >= 1 && dueDay <= 28 ? dueDay : 1;
  return `${period}-${String(day).padStart(2, "0")}`;
}

/**
 * Generación mensual de cargos (spec, sección 15, primer job listado).
 * Recorre los contratos activos vigentes en el período y devenga el
 * cargo de alquiler de cada uno vía generateCharge, que ya es
 * idempotente por (lease, period, chargeType) — correr esto dos veces
 * para el mismo período nunca duplica cargos. Solo genera "rent": los
 * cargos de consumo, mora y ajustes se generan por sus propios flujos
 * (no hay un monto fijo mensual que asumir para esos conceptos).
 */
export async function generateMonthlyCharges(
  db: Database,
  input: GenerateMonthlyChargesInput,
): Promise<GenerateMonthlyChargesResult> {
  const periodStart = `${input.period}-01`;

  const activeLeases = await withOrganizationContext(db, input.organizationId, (tx) =>
    tx
      .select()
      .from(leases)
      .where(and(eq(leases.status, "active"), lte(leases.startDate, periodStart), or(isNull(leases.endDate), gte(leases.endDate, periodStart)))),
  );

  let created = 0;
  let alreadyExisted = 0;
  const leaseIds: string[] = [];

  for (const lease of activeLeases) {
    const result = await generateCharge(db, {
      organizationId: input.organizationId,
      leaseId: lease.id,
      chargeType: "rent",
      period: input.period,
      dueDate: dueDateFor(input.period, lease.dueDay),
      amount: lease.initialRent,
      triggeredBy: input.triggeredBy,
    });
    if (result.created) created += 1;
    else alreadyExisted += 1;
    leaseIds.push(lease.id);
  }

  return { period: input.period, created, alreadyExisted, leaseIds };
}
