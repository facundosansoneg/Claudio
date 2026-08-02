import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { withOrganizationContext, tasks, taskComments, properties, users } from "@farfalla/database";
import { getDb } from "@/lib/db";
import { getCurrentUserContext } from "@/lib/current-user";
import { hasPermission } from "@/lib/require-permission";
import { createTaskAction, updateTaskStatusAction, addTaskCommentAction } from "./actions";

const NEXT_STATUS: Record<string, { value: string; label: string }[]> = {
  open: [
    { value: "in_progress", label: "Iniciar" },
    { value: "cancelled", label: "Cancelar" },
  ],
  in_progress: [
    { value: "done", label: "Completar" },
    { value: "cancelled", label: "Cancelar" },
  ],
  done: [],
  cancelled: [],
};

export default async function TasksPage() {
  const context = await getCurrentUserContext();
  if (!context) {
    return (
      <main>
        <p>
          No hay sesión activa. <Link href="/">Volver</Link>
        </p>
      </main>
    );
  }

  const [canView, canCreate, canEdit, canComment] = await Promise.all([
    hasPermission(context, "task", "view"),
    hasPermission(context, "task", "create"),
    hasPermission(context, "task", "edit"),
    hasPermission(context, "task", "comment"),
  ]);

  if (!canView) {
    return (
      <main>
        <p>No tenés permiso para ver tareas.</p>
      </main>
    );
  }

  const { tasksList, propertiesList, commentsByTask } = await withOrganizationContext(
    getDb(),
    context.organizationId,
    async (tx) => {
      const tasksRows = await tx
        .select({
          id: tasks.id,
          title: tasks.title,
          description: tasks.description,
          taskType: tasks.taskType,
          priority: tasks.priority,
          status: tasks.status,
          dueDate: tasks.dueDate,
          propertyName: properties.name,
          createdByName: users.displayName,
        })
        .from(tasks)
        .leftJoin(properties, eq(properties.id, tasks.propertyId))
        .leftJoin(users, eq(users.id, tasks.createdBy))
        .orderBy(desc(tasks.createdAt));

      const propertiesRows = await tx.select({ id: properties.id, name: properties.name }).from(properties);

      const commentsRows = await tx
        .select({ id: taskComments.id, taskId: taskComments.taskId, body: taskComments.body, createdAt: taskComments.createdAt })
        .from(taskComments)
        .orderBy(taskComments.createdAt);
      const grouped = new Map<string, typeof commentsRows>();
      for (const comment of commentsRows) {
        const list = grouped.get(comment.taskId) ?? [];
        list.push(comment);
        grouped.set(comment.taskId, list);
      }

      return { tasksList: tasksRows, propertiesList: propertiesRows, commentsByTask: grouped };
    },
  );

  return (
    <main>
      <p>
        <Link href="/">← Dashboard</Link>
      </p>
      <h1>Tareas</h1>
      <p>
        <small>
          Spec, sección 11.1. Checklist, archivos adjuntos y responsable asignado quedan para un
          tramo posterior — historial de cambios ya queda en audit_log.
        </small>
      </p>

      {tasksList.length === 0 ? (
        <p>Todavía no hay tareas cargadas.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Título</th>
              <th>Tipo</th>
              <th>Prioridad</th>
              <th>Vencimiento</th>
              <th>Propiedad</th>
              <th>Estado</th>
              <th>Creada por</th>
              {canEdit && <th></th>}
            </tr>
          </thead>
          <tbody>
            {tasksList.map((task) => (
              <tr key={task.id}>
                <td>
                  {task.title}
                  {task.description && (
                    <>
                      <br />
                      <small>{task.description}</small>
                    </>
                  )}
                </td>
                <td>{task.taskType}</td>
                <td>{task.priority}</td>
                <td>{task.dueDate ?? "—"}</td>
                <td>{task.propertyName ?? "—"}</td>
                <td>{task.status}</td>
                <td>{task.createdByName ?? "—"}</td>
                {canEdit && (
                  <td>
                    {NEXT_STATUS[task.status]?.map((transition) => (
                      <form key={transition.value} action={updateTaskStatusAction} style={{ display: "inline" }}>
                        <input type="hidden" name="taskId" value={task.id} />
                        <input type="hidden" name="newStatus" value={transition.value} />
                        <button type="submit">{transition.label}</button>{" "}
                      </form>
                    ))}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {canComment && (
        <>
          <h2>Comentarios</h2>
          {tasksList.map((task) => (
            <div key={task.id}>
              <p>
                <strong>{task.title}</strong>
              </p>
              <ul>
                {(commentsByTask.get(task.id) ?? []).map((comment) => (
                  <li key={comment.id}>{comment.body}</li>
                ))}
              </ul>
              <form action={addTaskCommentAction}>
                <input type="hidden" name="taskId" value={task.id} />
                <input name="body" placeholder="Agregar comentario" required />
                <button type="submit">Comentar</button>
              </form>
            </div>
          ))}
        </>
      )}

      {canCreate && (
        <>
          <h2>Nueva tarea</h2>
          <form action={createTaskAction}>
            <div>
              <label>
                Título <input name="title" required />
              </label>
            </div>
            <div>
              <label>
                Descripción <input name="description" />
              </label>
            </div>
            <div>
              <label>
                Tipo{" "}
                <select name="taskType" defaultValue="general">
                  <option value="general">General</option>
                  <option value="mantenimiento">Mantenimiento</option>
                  <option value="cobranza">Cobranza</option>
                  <option value="administrativa">Administrativa</option>
                </select>
              </label>
            </div>
            <div>
              <label>
                Prioridad{" "}
                <select name="priority" defaultValue="medium">
                  <option value="low">Baja</option>
                  <option value="medium">Media</option>
                  <option value="high">Alta</option>
                  <option value="urgent">Urgente</option>
                </select>
              </label>
            </div>
            <div>
              <label>
                Fecha límite <input type="date" name="dueDate" />
              </label>
            </div>
            <div>
              <label>
                Propiedad (opcional){" "}
                <select name="propertyId" defaultValue="">
                  <option value="">—</option>
                  {propertiesList.map((property) => (
                    <option key={property.id} value={property.id}>
                      {property.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button type="submit">Crear tarea</button>
          </form>
        </>
      )}
    </main>
  );
}
