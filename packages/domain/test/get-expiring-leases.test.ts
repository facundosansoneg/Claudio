import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import { createDatabase, withOrganizationContext, organizations, properties, units, leases, type Database } from "@farfalla/database";
import { getExpiringLeases } from "../src/operations/get-expiring-leases";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://farfalla:farfalla@localhost:5432/farfalla_test";
const MIGRATIONS_FOLDER = "../database/drizzle";

let db: Database;

async function setupLease(endDate: string, status = "active") {
  const organizationId = randomUUID();
  return withOrganizationContext(db, organizationId, async (tx) => {
    await tx.insert(organizations).values({ id: organizationId, name: "Org de prueba" });
    const [property] = await tx
      .insert(properties)
      .values({ organizationId, internalCode: "P-1", name: "Propiedad", propertyType: "apartamento" })
      .returning({ id: properties.id });
    const [unit] = await tx
      .insert(units)
      .values({ organizationId, propertyId: property!.id, unitCode: "1", unitType: "apartamento" })
      .returning({ id: units.id });
    await tx.insert(leases).values({
      organizationId,
      unitId: unit!.id,
      leaseNumber: "L-1",
      startDate: "2020-01-01",
      endDate,
      currency: "USD",
      initialRent: "1000.000000",
      status,
    });
    return organizationId;
  });
}

beforeAll(async () => {
  db = createDatabase(TEST_DATABASE_URL);
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE TABLE leases, units, properties, organizations RESTART IDENTITY CASCADE`);
});

describe("getExpiringLeases (spec CTRL-001)", () => {
  it("incluye un contrato activo que vence dentro de la ventana", async () => {
    const organizationId = await setupLease("2026-08-15");

    const result = await getExpiringLeases(db, { organizationId, daysAhead: 30, today: "2026-08-01" });

    expect(result).toHaveLength(1);
    expect(result[0]?.daysUntilExpiration).toBe(14);
  });

  it("no incluye contratos que vencen fuera de la ventana", async () => {
    const organizationId = await setupLease("2026-12-01");

    const result = await getExpiringLeases(db, { organizationId, daysAhead: 30, today: "2026-08-01" });

    expect(result).toHaveLength(0);
  });

  it("no incluye contratos que no están activos", async () => {
    const organizationId = await setupLease("2026-08-15", "terminated");

    const result = await getExpiringLeases(db, { organizationId, daysAhead: 30, today: "2026-08-01" });

    expect(result).toHaveLength(0);
  });
});
