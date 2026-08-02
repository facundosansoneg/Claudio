import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq, sql } from "drizzle-orm";
import {
  createDatabase,
  withOrganizationContext,
  organizations,
  users,
  ownershipInterests,
  charges,
  receipts,
  type Database,
} from "@farfalla/database";
import { seedDemoDataset } from "../src/seed/seed-demo-dataset";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://farfalla:farfalla@localhost:5432/farfalla_test";

let db: Database;

beforeAll(async () => {
  db = createDatabase(TEST_DATABASE_URL);
  await migrate(db, { migrationsFolder: "../database/drizzle" });
});

afterAll(async () => {
  await db.execute(
    sql`TRUNCATE TABLE receipts, payment_allocations, payments, journal_lines, journal_entries, charges, lease_parties, leases, tenants, ownership_interests, units, properties, owners, parties, ledger_accounts, users, organizations RESTART IDENTITY CASCADE`,
  );
});

describe("seedDemoDataset", () => {
  it("es idempotente: correrlo varias veces no duplica participaciones, cargos ni recibos", async () => {
    const organizationId = randomUUID();
    const userId = await withOrganizationContext(db, organizationId, async (tx) => {
      await tx.insert(organizations).values({ id: organizationId, name: "Org de prueba" });
      const [user] = await tx
        .insert(users)
        .values({ organizationId, email: `${randomUUID()}@farfalla.uy`, displayName: "Operador" })
        .returning({ id: users.id });
      return user!.id;
    });

    await seedDemoDataset(db, organizationId, userId);
    await seedDemoDataset(db, organizationId, userId);
    const result = await seedDemoDataset(db, organizationId, userId);

    expect(result.ownerIds).toHaveLength(2);
    expect(result.propertyIds).toHaveLength(2);
    expect(result.leaseIds).toHaveLength(2);

    const counts = await withOrganizationContext(db, organizationId, async (tx) => {
      const [oi] = await tx
        .select({ value: sql<number>`count(*)::int` })
        .from(ownershipInterests)
        .where(eq(ownershipInterests.organizationId, organizationId));
      const [ch] = await tx
        .select({ value: sql<number>`count(*)::int` })
        .from(charges)
        .where(eq(charges.organizationId, organizationId));
      const [rc] = await tx
        .select({ value: sql<number>`count(*)::int` })
        .from(receipts)
        .where(eq(receipts.organizationId, organizationId));
      return { ownershipInterests: oi?.value, charges: ch?.value, receipts: rc?.value };
    });

    expect(counts.ownershipInterests).toBe(3);
    expect(counts.charges).toBe(6); // 2 contratos × 3 meses
    expect(counts.receipts).toBe(4); // 2 contratos × 2 meses ya cobrados
  });
});
