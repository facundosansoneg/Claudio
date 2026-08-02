import type { Database } from "@farfalla/database";
import { runTracked } from "../job-runner";

export const HEARTBEAT_QUEUE = "system.heartbeat";

/**
 * Job trivial de prueba: confirma que la cola persistente (pg-boss,
 * ADR 0004) y el bookkeeping en job_runs funcionan de punta a punta.
 * Los jobs con contenido de negocio real (generación de cargos,
 * reajustes, correos) se agregan en los Hitos 3 y 6.
 */
export async function runHeartbeat(db: Database, triggeredBy: string) {
  return runTracked(db, HEARTBEAT_QUEUE, { triggeredBy }, async () => {
    return { at: new Date().toISOString() };
  });
}
