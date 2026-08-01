import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import {
  createDatabase,
  withOrganizationContext,
  organizations,
  users,
  roles,
  userScopes,
  userIdentities,
  type Database,
} from "@farfalla/database";
import { resolveUserContext } from "../src/resolve-user-context";

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

describe("resolveUserContext — login vía Entra ID (ADR 0002)", () => {
  it("resuelve organización, usuario y roles a partir del oid, sin conocer la organización de antemano", async () => {
    const organizationId = randomUUID();
    const externalAuthSubject = `entra-oid-${randomUUID()}`;

    const userId = await withOrganizationContext(db, organizationId, async (tx) => {
      await tx.insert(organizations).values({ id: organizationId, name: "Farfalla Demo" });
      const [role] = await tx
        .insert(roles)
        .values({ organizationId, code: "property_manager", name: "Gestor de propiedades" })
        .returning({ id: roles.id });
      const [user] = await tx
        .insert(users)
        .values({ organizationId, email: "gestor@farfalla.uy", displayName: "Gestor Demo" })
        .returning({ id: users.id });
      if (!role || !user) throw new Error("setup falló");

      await tx.insert(userScopes).values({
        organizationId,
        userId: user.id,
        roleId: role.id,
        scopeType: "organization",
      });
      await tx.insert(userIdentities).values({
        organizationId,
        userId: user.id,
        externalAuthSubject,
      });

      return user.id;
    });

    const context = await resolveUserContext(db, externalAuthSubject);

    expect(context).not.toBeNull();
    expect(context?.userId).toBe(userId);
    expect(context?.organizationId).toBe(organizationId);
    expect(context?.email).toBe("gestor@farfalla.uy");
    expect(context?.roles).toHaveLength(1);
    expect(context?.roles[0]).toMatchObject({
      roleCode: "property_manager",
      scopeType: "organization",
    });
  });

  it("devuelve null para un oid que no tiene identidad registrada", async () => {
    const context = await resolveUserContext(db, `oid-inexistente-${randomUUID()}`);
    expect(context).toBeNull();
  });
});
