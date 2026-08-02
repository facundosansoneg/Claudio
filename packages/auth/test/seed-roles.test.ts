import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql, eq } from "drizzle-orm";
import { createDatabase, organizations, roles, type Database } from "@farfalla/database";
import { ROLE_DEFINITIONS, seedRoles } from "../src/seed-roles";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://farfalla:farfalla@localhost:5432/farfalla_test";

let db: Database;

beforeAll(async () => {
  db = createDatabase(TEST_DATABASE_URL);
  await migrate(db, { migrationsFolder: "../database/drizzle" });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE TABLE roles, organizations RESTART IDENTITY CASCADE`);
});

describe("seedRoles", () => {
  it("crea los 9 roles mínimos de la sección 5.2 y es idempotente", async () => {
    const organizationId = randomUUID();
    await db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.current_organization_id', ${organizationId}, true)`);
      await tx.insert(organizations).values({ id: organizationId, name: "Org de prueba" });
      await seedRoles(tx as unknown as Database, organizationId);
      await seedRoles(tx as unknown as Database, organizationId); // no debe duplicar
    });

    const seeded = await db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.current_organization_id', ${organizationId}, true)`);
      return tx.select().from(roles).where(eq(roles.organizationId, organizationId));
    });

    expect(seeded).toHaveLength(ROLE_DEFINITIONS.length);
    expect(new Set(seeded.map((r) => r.code))).toEqual(
      new Set(ROLE_DEFINITIONS.map((r) => r.code)),
    );
  });
});
