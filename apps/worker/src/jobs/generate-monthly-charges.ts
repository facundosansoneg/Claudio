import { type Database } from "@farfalla/database";
import { generateMonthlyCharges } from "@farfalla/domain";
import { runTracked } from "../job-runner";

export const GENERATE_MONTHLY_CHARGES_QUEUE = "billing.generate-monthly-charges";

/**
 * Generación mensual de cargos (spec, sección 15, primer job listado).
 * Corre para UNA organización explícita — generateMonthlyCharges ya es
 * idempotente por contrato+período, así que reintentar o correr el
 * mismo mes dos veces nunca duplica cargos.
 *
 * No hace fan-out automático a "todas las organizaciones activas": la
 * tabla `organizations` tiene RLS forzada comparando contra su propio
 * id (packages/database/drizzle/0001_enable_row_level_security.sql),
 * así que ninguna conexión con el rol de aplicación puede enumerar
 * organizaciones de otro tenant — ni debería, es la garantía de
 * aislamiento que ADR 0006 protege a propósito. Programar esto para
 * "todas las organizaciones" requeriría un rol de sistema separado con
 * BYPASSRLS usado solo para ese directorio, nunca para leer datos de
 * negocio — es una decisión de infraestructura real que no se toma
 * calladamente acá. Hasta que exista ese mecanismo, cada organización
 * debe encolar su propia corrida (`boss.send(GENERATE_MONTHLY_CHARGES_QUEUE,
 * { organizationId })`).
 *
 * `jobRunsLabel` identifica quién disparó la corrida en job_runs
 * (texto libre, ej. "schedule"). Es distinto de `triggeredByUserId`
 * (createdBy de los asientos y userId de audit_log, ambos uuid
 * nullable — null significa "job/sistema", como ya documenta el
 * comentario de audit_log.user_id): un job automático no tiene un
 * usuario real detrás, así que nunca se le pone un valor inventado.
 */
export async function runGenerateMonthlyCharges(
  db: Database,
  jobRunsLabel: string,
  organizationId: string,
  period?: string,
  triggeredByUserId: string | null = null,
) {
  const targetPeriod = period ?? new Date().toISOString().slice(0, 7);

  return runTracked(
    db,
    GENERATE_MONTHLY_CHARGES_QUEUE,
    { organizationId, triggeredBy: jobRunsLabel, params: { period: targetPeriod } },
    () => generateMonthlyCharges(db, { organizationId, period: targetPeriod, triggeredBy: triggeredByUserId }),
  );
}
