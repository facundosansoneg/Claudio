import { tasks, recordAuditEvent, withOrganizationContext, type Database } from "@farfalla/database";

export interface CreateTaskInput {
  organizationId: string;
  title: string;
  description?: string | null;
  taskType?: string;
  priority?: string;
  assignedTo?: string | null;
  dueDate?: string | null;
  propertyId?: string | null;
  unitId?: string | null;
  leaseId?: string | null;
  ownerId?: string | null;
  tenantId?: string | null;
  checklist?: { text: string; done: boolean }[] | null;
  createdBy: string;
}

/**
 * Alta de tarea (spec, sección 11.1). Sin reglas de negocio propias más
 * allá de la vinculación opcional a propiedad/unidad/contrato/
 * propietario/inquilino — la validación de transición de estado vive en
 * updateTaskStatus, no acá.
 */
export async function createTask(db: Database, input: CreateTaskInput): Promise<string> {
  if (!input.title.trim()) {
    throw new Error("El título es obligatorio");
  }

  return withOrganizationContext(db, input.organizationId, async (tx) => {
    const [task] = await tx
      .insert(tasks)
      .values({
        organizationId: input.organizationId,
        title: input.title,
        description: input.description ?? null,
        taskType: input.taskType ?? "general",
        priority: input.priority ?? "medium",
        assignedTo: input.assignedTo ?? null,
        dueDate: input.dueDate ?? null,
        propertyId: input.propertyId ?? null,
        unitId: input.unitId ?? null,
        leaseId: input.leaseId ?? null,
        ownerId: input.ownerId ?? null,
        tenantId: input.tenantId ?? null,
        checklist: input.checklist ?? null,
        createdBy: input.createdBy,
        updatedBy: input.createdBy,
      })
      .returning({ id: tasks.id });
    if (!task) throw new Error("No se pudo crear la tarea");

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      userId: input.createdBy,
      entityType: "tasks",
      entityId: task.id,
      action: "create",
      newState: { title: input.title, taskType: input.taskType ?? "general", priority: input.priority ?? "medium" },
    });

    return task.id;
  });
}
