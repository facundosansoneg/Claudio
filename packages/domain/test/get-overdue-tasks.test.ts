import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import { createDatabase, withOrganizationContext, organizations, users, tasks, type Database } from "@farfalla/database";
import { getOverdueTasks } from "../src/operations/get-overdue-tasks";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://farfalla:farfalla@localhost:5432/farfalla_test";
const MIGRATIONS_FOLDER = "../database/drizzle";

let db: Database;

async function setupOrg() {
  const organizationId = randomUUID();
  await withOrganizationContext(db, organizationId, (tx) => tx.insert(organizations).values({ id: organizationId, name: "Org de prueba" }));
  return organizationId;
}

beforeAll(async () => {
  db = createDatabase(TEST_DATABASE_URL);
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE TABLE tasks, users, organizations RESTART IDENTITY CASCADE`);
});

describe("getOverdueTasks (spec CTRL-002)", () => {
  it("incluye una tarea abierta con fecha límite pasada", async () => {
    const organizationId = await setupOrg();
    await withOrganizationContext(db, organizationId, (tx) =>
      tx.insert(tasks).values({ organizationId, title: "Tarea vencida", dueDate: "2026-07-20", status: "open" }),
    );

    const result = await getOverdueTasks(db, { organizationId, today: "2026-08-01" });

    expect(result).toHaveLength(1);
    expect(result[0]?.daysOverdue).toBe(12);
  });

  it("no incluye tareas completadas o canceladas aunque estén vencidas", async () => {
    const organizationId = await setupOrg();
    await withOrganizationContext(db, organizationId, (tx) =>
      tx.insert(tasks).values([
        { organizationId, title: "Completada", dueDate: "2026-07-20", status: "done" },
        { organizationId, title: "Cancelada", dueDate: "2026-07-20", status: "cancelled" },
      ]),
    );

    const result = await getOverdueTasks(db, { organizationId, today: "2026-08-01" });

    expect(result).toHaveLength(0);
  });

  it("no incluye tareas sin fecha límite o con fecha futura", async () => {
    const organizationId = await setupOrg();
    await withOrganizationContext(db, organizationId, (tx) =>
      tx.insert(tasks).values([
        { organizationId, title: "Sin fecha", status: "open" },
        { organizationId, title: "Futura", dueDate: "2026-09-01", status: "open" },
      ]),
    );

    const result = await getOverdueTasks(db, { organizationId, today: "2026-08-01" });

    expect(result).toHaveLength(0);
  });
});
