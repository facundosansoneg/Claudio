import { eq } from "drizzle-orm";
import { tasks, taskComments, recordAuditEvent, withOrganizationContext, type Database } from "@farfalla/database";

export interface AddTaskCommentInput {
  organizationId: string;
  taskId: string;
  body: string;
  authorId: string;
}

export async function addTaskComment(db: Database, input: AddTaskCommentInput): Promise<string> {
  if (!input.body.trim()) {
    throw new Error("El comentario no puede estar vacío");
  }

  return withOrganizationContext(db, input.organizationId, async (tx) => {
    const [task] = await tx.select({ id: tasks.id }).from(tasks).where(eq(tasks.id, input.taskId));
    if (!task) throw new Error("Tarea no encontrada");

    const [comment] = await tx
      .insert(taskComments)
      .values({ organizationId: input.organizationId, taskId: input.taskId, authorId: input.authorId, body: input.body })
      .returning({ id: taskComments.id });
    if (!comment) throw new Error("No se pudo agregar el comentario");

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      userId: input.authorId,
      entityType: "task_comments",
      entityId: comment.id,
      action: "create",
      newState: { taskId: input.taskId },
    });

    return comment.id;
  });
}
