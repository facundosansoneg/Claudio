import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq, sql } from "drizzle-orm";
import {
  createDatabase,
  withOrganizationContext,
  organizations,
  users,
  tasks,
  taskComments,
  type Database,
} from "@farfalla/database";
import { createTask } from "../src/operations/create-task";
import { updateTaskStatus } from "../src/operations/update-task-status";
import { addTaskComment } from "../src/operations/add-task-comment";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://farfalla:farfalla@localhost:5432/farfalla_test";
const MIGRATIONS_FOLDER = "../database/drizzle";

let db: Database;

async function setupOrgWithUser() {
  const organizationId = randomUUID();
  const userId = await withOrganizationContext(db, organizationId, async (tx) => {
    await tx.insert(organizations).values({ id: organizationId, name: "Org de prueba" });
    const [user] = await tx
      .insert(users)
      .values({ organizationId, email: `${randomUUID()}@farfalla.uy`, displayName: "Operador" })
      .returning({ id: users.id });
    return user!.id;
  });
  return { organizationId, userId };
}

beforeAll(async () => {
  db = createDatabase(TEST_DATABASE_URL);
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE TABLE task_comments, tasks, users, organizations RESTART IDENTITY CASCADE`);
});

describe("createTask (spec 11.1)", () => {
  it("crea una tarea con estado inicial 'open'", async () => {
    const { organizationId, userId } = await setupOrgWithUser();

    const taskId = await createTask(db, {
      organizationId,
      title: "Revisar caldera",
      taskType: "mantenimiento",
      priority: "high",
      createdBy: userId,
    });

    const [task] = await withOrganizationContext(db, organizationId, (tx) => tx.select().from(tasks).where(eq(tasks.id, taskId)));
    expect(task?.status).toBe("open");
    expect(task?.title).toBe("Revisar caldera");
  });

  it("rechaza un título vacío", async () => {
    const { organizationId, userId } = await setupOrgWithUser();

    await expect(createTask(db, { organizationId, title: "   ", createdBy: userId })).rejects.toThrow(/título/);
  });
});

describe("updateTaskStatus (máquina de estados)", () => {
  it("permite open -> in_progress -> done", async () => {
    const { organizationId, userId } = await setupOrgWithUser();
    const taskId = await createTask(db, { organizationId, title: "Tarea", createdBy: userId });

    await updateTaskStatus(db, { organizationId, taskId, newStatus: "in_progress", triggeredBy: userId });
    await updateTaskStatus(db, { organizationId, taskId, newStatus: "done", triggeredBy: userId });

    const [task] = await withOrganizationContext(db, organizationId, (tx) => tx.select().from(tasks).where(eq(tasks.id, taskId)));
    expect(task?.status).toBe("done");
  });

  it("rechaza una transición inválida (open -> open, o desde un estado terminal)", async () => {
    const { organizationId, userId } = await setupOrgWithUser();
    const taskId = await createTask(db, { organizationId, title: "Tarea", createdBy: userId });

    await expect(
      updateTaskStatus(db, { organizationId, taskId, newStatus: "open", triggeredBy: userId }),
    ).rejects.toThrow(/No se puede pasar/);

    await updateTaskStatus(db, { organizationId, taskId, newStatus: "cancelled", triggeredBy: userId });
    await expect(
      updateTaskStatus(db, { organizationId, taskId, newStatus: "in_progress", triggeredBy: userId }),
    ).rejects.toThrow(/No se puede pasar/);
  });
});

describe("addTaskComment", () => {
  it("agrega un comentario a una tarea existente", async () => {
    const { organizationId, userId } = await setupOrgWithUser();
    const taskId = await createTask(db, { organizationId, title: "Tarea", createdBy: userId });

    await addTaskComment(db, { organizationId, taskId, authorId: userId, body: "Ya coordiné con el proveedor" });

    const comments = await withOrganizationContext(db, organizationId, (tx) =>
      tx.select().from(taskComments).where(eq(taskComments.taskId, taskId)),
    );
    expect(comments).toHaveLength(1);
    expect(comments[0]?.body).toBe("Ya coordiné con el proveedor");
  });

  it("rechaza un comentario vacío", async () => {
    const { organizationId, userId } = await setupOrgWithUser();
    const taskId = await createTask(db, { organizationId, title: "Tarea", createdBy: userId });

    await expect(addTaskComment(db, { organizationId, taskId, authorId: userId, body: "  " })).rejects.toThrow(/vacío/);
  });
});
