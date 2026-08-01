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
  permissions,
  rolePermissions,
  userScopes,
  type Database,
} from "@farfalla/database";
import { can } from "../src/authorize";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://farfalla:farfalla@localhost:5432/farfalla_test";
// Las migraciones viven en @farfalla/database; se corren contra la misma
// base de test que usa ese paquete.
const MIGRATIONS_FOLDER = "../database/drizzle";

let db: Database;

async function createOrganization() {
  const id = randomUUID();
  await db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.current_organization_id', ${id}, true)`);
    await tx.insert(organizations).values({ id, name: `Org ${id.slice(0, 8)}` });
  });
  return id;
}

beforeAll(async () => {
  db = createDatabase(TEST_DATABASE_URL);
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
});

afterAll(async () => {
  await db.execute(
    sql`TRUNCATE TABLE role_permissions, permissions, user_scopes, roles, users, organizations RESTART IDENTITY CASCADE`,
  );
});

describe("can() — autorización RBAC por alcance (ADR 0002)", () => {
  it("autoriza cuando el rol tiene el permiso y el alcance coincide exactamente", async () => {
    const organizationId = await createOrganization();
    const propertyId = randomUUID();

    const grantedUserId = await withOrganizationContext(db, organizationId, async (tx) => {
      const [role] = await tx
        .insert(roles)
        .values({ organizationId, code: "property_manager", name: "Gestor de propiedades" })
        .returning({ id: roles.id });
      const [permission] = await tx
        .insert(permissions)
        .values({ resource: "lease", action: "view" })
        .onConflictDoUpdate({
          target: [permissions.resource, permissions.action],
          set: { description: null },
        })
        .returning({ id: permissions.id });
      const [user] = await tx
        .insert(users)
        .values({ organizationId, email: `${randomUUID()}@farfalla.uy`, displayName: "Gestor" })
        .returning({ id: users.id });
      if (!role || !permission || !user) throw new Error("setup falló");

      await tx.insert(rolePermissions).values({ roleId: role.id, permissionId: permission.id });
      await tx.insert(userScopes).values({
        organizationId,
        userId: user.id,
        roleId: role.id,
        scopeType: "property",
        scopeId: propertyId,
      });

      return user.id;
    });

    await expect(
      can(db, {
        userId: grantedUserId,
        organizationId,
        resource: "lease",
        action: "view",
        scope: { type: "property", id: propertyId },
      }),
    ).resolves.toBe(true);

    await expect(
      can(db, {
        userId: grantedUserId,
        organizationId,
        resource: "lease",
        action: "approve", // acción distinta a la otorgada
        scope: { type: "property", id: propertyId },
      }),
    ).resolves.toBe(false);

    await expect(
      can(db, {
        userId: grantedUserId,
        organizationId,
        resource: "lease",
        action: "view",
        scope: { type: "property", id: randomUUID() }, // otra propiedad
      }),
    ).resolves.toBe(false);
  });

  it("un alcance de organización autoriza cualquier propiedad dentro de ella", async () => {
    const organizationId = await createOrganization();

    const directorUserId = await withOrganizationContext(db, organizationId, async (tx) => {
      const [role] = await tx
        .insert(roles)
        .values({ organizationId, code: "portfolio_director", name: "Director patrimonial" })
        .returning({ id: roles.id });
      const [permission] = await tx
        .insert(permissions)
        .values({ resource: "report", action: "export" })
        .onConflictDoUpdate({
          target: [permissions.resource, permissions.action],
          set: { description: null },
        })
        .returning({ id: permissions.id });
      const [user] = await tx
        .insert(users)
        .values({ organizationId, email: `${randomUUID()}@farfalla.uy`, displayName: "Directora" })
        .returning({ id: users.id });
      if (!role || !permission || !user) throw new Error("setup falló");

      await tx.insert(rolePermissions).values({ roleId: role.id, permissionId: permission.id });
      await tx.insert(userScopes).values({
        organizationId,
        userId: user.id,
        roleId: role.id,
        scopeType: "organization",
        scopeId: null,
      });

      return user.id;
    });

    await expect(
      can(db, {
        userId: directorUserId,
        organizationId,
        resource: "report",
        action: "export",
        scope: { type: "property", id: randomUUID() },
      }),
    ).resolves.toBe(true);
  });

  it("no autoriza un permiso cuya vigencia ya venció", async () => {
    const organizationId = await createOrganization();
    const propertyId = randomUUID();

    const userId = await withOrganizationContext(db, organizationId, async (tx) => {
      const [role] = await tx
        .insert(roles)
        .values({ organizationId, code: "operator", name: "Operador" })
        .returning({ id: roles.id });
      const [permission] = await tx
        .insert(permissions)
        .values({ resource: "charge", action: "create" })
        .onConflictDoUpdate({
          target: [permissions.resource, permissions.action],
          set: { description: null },
        })
        .returning({ id: permissions.id });
      const [user] = await tx
        .insert(users)
        .values({ organizationId, email: `${randomUUID()}@farfalla.uy`, displayName: "Ex operador" })
        .returning({ id: users.id });
      if (!role || !permission || !user) throw new Error("setup falló");

      await tx.insert(rolePermissions).values({
        roleId: role.id,
        permissionId: permission.id,
        validFrom: "2020-01-01",
        validTo: "2020-12-31", // venció hace años
      });
      await tx.insert(userScopes).values({
        organizationId,
        userId: user.id,
        roleId: role.id,
        scopeType: "property",
        scopeId: propertyId,
      });

      return user.id;
    });

    await expect(
      can(db, {
        userId,
        organizationId,
        resource: "charge",
        action: "create",
        scope: { type: "property", id: propertyId },
      }),
    ).resolves.toBe(false);
  });
});
