import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import { createDatabase, type Database } from "@farfalla/database";
import { seedDevUser, DEV_LOGIN_SUBJECT } from "../src/dev-login";
import { resolveUserContext } from "../src/resolve-user-context";
import { can } from "../src/authorize";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://farfalla:farfalla@localhost:5432/farfalla_test";

let db: Database;

beforeAll(async () => {
  db = createDatabase(TEST_DATABASE_URL);
  await migrate(db, { migrationsFolder: "../database/drizzle" });
});

afterAll(async () => {
  await db.execute(
    sql`TRUNCATE TABLE user_identities, user_scopes, roles, users, organizations RESTART IDENTITY CASCADE`,
  );
});

describe("seedDevUser — login de prueba sin Azure", () => {
  it("es idempotente y deja un usuario resoluble por resolveUserContext", async () => {
    const first = await seedDevUser(db);
    const second = await seedDevUser(db);

    expect(second.userId).toBe(first.userId);
    expect(second.organizationId).toBe(first.organizationId);

    const context = await resolveUserContext(db, DEV_LOGIN_SUBJECT);
    expect(context).not.toBeNull();
    expect(context?.userId).toBe(first.userId);
    expect(context?.roles.some((role) => role.roleCode === "system_admin")).toBe(true);

    await expect(
      can(db, {
        userId: first.userId,
        organizationId: first.organizationId,
        resource: "owner",
        action: "create",
        scope: { type: "organization" },
      }),
    ).resolves.toBe(true);
  });
});
