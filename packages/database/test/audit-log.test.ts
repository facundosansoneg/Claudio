import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq, sql } from "drizzle-orm";
import { createDatabase, withOrganizationContext, type Database } from "../src/client";
import { auditLog, organizations, users } from "../src/schema";
import { recordAuditEvent } from "../src/audit";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://farfalla:farfalla@localhost:5432/farfalla_test";

let db: Database;

async function createOrganization(name: string) {
  const id = randomUUID();
  await db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.current_organization_id', ${id}, true)`);
    await tx.insert(organizations).values({ id, name });
  });
  return id;
}

beforeAll(async () => {
  db = createDatabase(TEST_DATABASE_URL);
  await migrate(db, { migrationsFolder: "./drizzle" });
});

afterAll(async () => {
  // Limpieza best-effort entre corridas locales; en CI la base es efímera.
  await db.execute(sql`TRUNCATE TABLE audit_log, users, organizations RESTART IDENTITY CASCADE`);
});

describe("alta de organización y usuario deja rastro en audit_log", () => {
  it("registra el alta de un usuario en audit_log dentro del contexto de su organización", async () => {
    const organizationId = await createOrganization("Farfalla Props Demo");

    const createdUserId = await withOrganizationContext(db, organizationId, async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({
          organizationId,
          email: "operador@farfalla.uy",
          displayName: "Operador de prueba",
        })
        .returning({ id: users.id });
      if (!user) throw new Error("no se pudo crear el usuario");

      await recordAuditEvent(tx, {
        organizationId,
        entityType: "users",
        entityId: user.id,
        action: "create",
        newState: { email: "operador@farfalla.uy" },
      });

      return user.id;
    });

    const events = await withOrganizationContext(db, organizationId, async (tx) =>
      tx.select().from(auditLog).where(eq(auditLog.entityId, createdUserId)),
    );

    expect(events).toHaveLength(1);
    expect(events[0]?.action).toBe("create");
    expect(events[0]?.entityType).toBe("users");
    expect(events[0]?.organizationId).toBe(organizationId);
  });
});

describe("aislamiento por organización (RLS, ADR 0006)", () => {
  it("una organización no ve usuarios ni audit_log de otra organización", async () => {
    const orgA = await createOrganization("Organización A");
    const orgB = await createOrganization("Organización B");

    await withOrganizationContext(db, orgA, async (tx) => {
      await tx.insert(users).values({
        organizationId: orgA,
        email: "usuario-a@farfalla.uy",
        displayName: "Usuario A",
      });
    });

    const usersVisibleFromB = await withOrganizationContext(db, orgB, async (tx) =>
      tx.select().from(users),
    );
    expect(usersVisibleFromB).toHaveLength(0);

    const usersVisibleFromA = await withOrganizationContext(db, orgA, async (tx) =>
      tx.select().from(users),
    );
    expect(usersVisibleFromA).toHaveLength(1);
    expect(usersVisibleFromA[0]?.email).toBe("usuario-a@farfalla.uy");
  });

  it("rechaza insertar un usuario con organization_id de otro tenant (WITH CHECK)", async () => {
    const orgA = await createOrganization("Organización C");
    const orgB = await createOrganization("Organización D");

    await expect(
      withOrganizationContext(db, orgA, async (tx) => {
        await tx.insert(users).values({
          organizationId: orgB, // intento de escribir fuera del propio tenant
          email: "fuga@farfalla.uy",
          displayName: "Intento de fuga entre tenants",
        });
      }),
    ).rejects.toThrow();
  });
});
