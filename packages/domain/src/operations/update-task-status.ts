import { eq } from "drizzle-orm";
import { tasks, recordAuditEvent, withOrganizationContext, type Database } from "@farfalla/database";

export interface UpdateTaskStatusInput {
  organizationId: string;
  taskId: string;
  newStatus: string;
  triggeredBy: string;
}

// Máquina de estados de una tarea (spec, sección 11.1, "estado"):
// open/in_progress pueden cancelarse o avanzar; done y cancelled son
// terminales. Rechaza transiciones fuera de esta lista en vez de
// aceptar cualquier valor de estado.
const VALID_TRANSITIONS: Record<string, string[]> = {
  open: ["in_progress", "done", "cancelled"],
  in_progress: ["done", "cancelled"],
  done: [],
  cancelled: [],
};

export async function updateTaskStatus(db: Database, input: UpdateTaskStatusInput): Promise<void> {
  return withOrganizationContext(db, input.organizationId, async (tx) => {
    const [task] = await tx.select().from(tasks).where(eq(tasks.id, input.taskId));
    if (!task) throw new Error("Tarea no encontrada");

    const allowed = VALID_TRANSITIONS[task.status] ?? [];
    if (!allowed.includes(input.newStatus)) {
      throw new Error(`No se puede pasar la tarea de "${task.status}" a "${input.newStatus}"`);
    }

    await tx
      .update(tasks)
      .set({ status: input.newStatus, updatedBy: input.triggeredBy, updatedAt: new Date() })
      .where(eq(tasks.id, input.taskId));

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      userId: input.triggeredBy,
      entityType: "tasks",
      entityId: input.taskId,
      action: "status_change",
      previousState: { status: task.status },
      newState: { status: input.newStatus },
    });
  });
}
