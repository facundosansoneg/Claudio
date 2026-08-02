import { eq } from "drizzle-orm";
import { jobRuns, type Database } from "@farfalla/database";

export interface TrackedJobContext {
  organizationId?: string;
  triggeredBy: string;
  params?: unknown;
}

/**
 * Envuelve la ejecución de un job con bookkeeping en `job_runs` (spec,
 * sección 15): registra inicio, fin, parámetros, resultado y error,
 * independiente del propio tracking interno de pg-boss (ADR 0004).
 */
export async function runTracked<T>(
  db: Database,
  jobName: string,
  context: TrackedJobContext,
  fn: () => Promise<T>,
): Promise<T> {
  const [run] = await db
    .insert(jobRuns)
    .values({
      jobName,
      organizationId: context.organizationId ?? null,
      triggeredBy: context.triggeredBy,
      params: context.params ?? null,
      status: "running",
    })
    .returning({ id: jobRuns.id });
  if (!run) throw new Error("no se pudo registrar el job_run");

  try {
    const result = await fn();
    await db
      .update(jobRuns)
      .set({ status: "succeeded", finishedAt: new Date(), result: (result ?? null) as unknown })
      .where(eq(jobRuns.id, run.id));
    return result;
  } catch (error) {
    await db
      .update(jobRuns)
      .set({
        status: "failed",
        finishedAt: new Date(),
        error: error instanceof Error ? error.message : String(error),
      })
      .where(eq(jobRuns.id, run.id));
    throw error;
  }
}
