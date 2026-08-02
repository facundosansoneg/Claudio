import { and, lt, notInArray } from "drizzle-orm";
import { tasks, withOrganizationContext, type Database } from "@farfalla/database";

export interface OverdueTask {
  taskId: string;
  title: string;
  priority: string;
  dueDate: string;
  status: string;
  daysOverdue: number;
}

export interface GetOverdueTasksInput {
  organizationId: string;
  today?: string;
}

function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(`${fromIso}T00:00:00Z`);
  const to = new Date(`${toIso}T00:00:00Z`);
  return Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Tareas vencidas (spec, CTRL-002): fecha límite pasada y todavía no
 * cerradas (ni completadas ni canceladas).
 */
export async function getOverdueTasks(db: Database, input: GetOverdueTasksInput): Promise<OverdueTask[]> {
  return withOrganizationContext(db, input.organizationId, async (tx) => {
    const today = input.today ?? new Date().toISOString().slice(0, 10);

    const rows = await tx
      .select({ taskId: tasks.id, title: tasks.title, priority: tasks.priority, dueDate: tasks.dueDate, status: tasks.status })
      .from(tasks)
      .where(and(lt(tasks.dueDate, today), notInArray(tasks.status, ["done", "cancelled"])));

    return rows
      .filter((row): row is typeof row & { dueDate: string } => row.dueDate !== null)
      .map((row) => ({ ...row, daysOverdue: daysBetween(row.dueDate, today) }));
  });
}
