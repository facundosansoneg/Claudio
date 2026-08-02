import { type Database } from "@farfalla/database";
import { getAlertsCenter } from "@farfalla/domain";
import { runTracked } from "../job-runner";

export const EXPIRING_CONTROLS_QUEUE = "alerts.expiring-controls";

// CTRL-001: "días previos configurables" — mismo default que la UI
// (apps/web/app/page.tsx) hasta que se lleve a `parameters`.
const DEFAULT_ALERT_WINDOW_DAYS = 30;

/**
 * Control de vencimientos (spec, sección 15 y CTRL-001/CTRL-002): corre
 * el centro de alertas para UNA organización explícita y deja el
 * resultado en job_runs.result. Todavía no envía nada — el envío por
 * correo (EMAIL-006, "recordatorio previo al vencimiento") está
 * bloqueado por credenciales reales de Microsoft 365 (ADR 0005); esto
 * deja la señal calculada y auditable, lista para conectar el envío
 * cuando haya esas credenciales.
 *
 * Igual que runGenerateMonthlyCharges: no enumera "todas las
 * organizaciones" — `organizations` tiene RLS forzada por su propio id
 * y no hay (todavía) un rol de sistema con BYPASSRLS dedicado a ese
 * directorio. Cada organización encola su propia corrida.
 */
export async function runExpiringControls(
  db: Database,
  triggeredBy: string,
  organizationId: string,
  daysAhead = DEFAULT_ALERT_WINDOW_DAYS,
) {
  return runTracked(
    db,
    EXPIRING_CONTROLS_QUEUE,
    { organizationId, triggeredBy, params: { daysAhead } },
    async () => {
      const alerts = await getAlertsCenter(db, { organizationId, daysAhead });
      return {
        expiringTaxExemptions: alerts.expiringTaxExemptions.length,
        expiringLeases: alerts.expiringLeases.length,
        overdueTasks: alerts.overdueTasks.length,
        belowMarketLeases: alerts.belowMarketLeases.length,
      };
    },
  );
}
