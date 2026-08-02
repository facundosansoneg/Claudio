import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import {
  createDatabase,
  withOrganizationContext,
  organizations,
  users,
  parties,
  owners,
  properties,
  units,
  ownershipInterests,
  expenses,
  allocationRules,
  type Database,
} from "@farfalla/database";
import { seedChartOfAccounts } from "../src/accounting/chart-of-accounts";
import { runExpenseAllocation } from "../src/expenses/run-expense-allocation";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://farfalla:farfalla@localhost:5432/farfalla_test";
const MIGRATIONS_FOLDER = "../database/drizzle";

let db: Database;

async function setupSharedProperty() {
  const organizationId = randomUUID();
  return withOrganizationContext(db, organizationId, async (tx) => {
    await tx.insert(organizations).values({ id: organizationId, name: "Org de prueba" });
    await seedChartOfAccounts(tx, organizationId);
    const [user] = await tx
      .insert(users)
      .values({ organizationId, email: `${randomUUID()}@farfalla.uy`, displayName: "Operador" })
      .returning({ id: users.id });

    const [partyA] = await tx
      .insert(parties)
      .values({ organizationId, partyType: "person", displayName: "Propietario A" })
      .returning({ id: parties.id });
    const [ownerA] = await tx.insert(owners).values({ organizationId, partyId: partyA!.id }).returning({ id: owners.id });
    const [partyB] = await tx
      .insert(parties)
      .values({ organizationId, partyType: "person", displayName: "Propietario B" })
      .returning({ id: parties.id });
    const [ownerB] = await tx.insert(owners).values({ organizationId, partyId: partyB!.id }).returning({ id: owners.id });

    const [property] = await tx
      .insert(properties)
      .values({ organizationId, internalCode: "P-1", name: "Propiedad compartida", propertyType: "apartamento" })
      .returning({ id: properties.id });
    await tx.insert(units).values({ organizationId, propertyId: property!.id, unitCode: "101", unitType: "apartamento" });

    await tx.insert(ownershipInterests).values([
      {
        organizationId,
        propertyId: property!.id,
        ownerId: ownerA!.id,
        legalPercentage: "60",
        economicPercentage: "60",
        rentDistributionPercentage: "60",
        taxContributionPercentage: "60",
        validFrom: "2020-01-01",
      },
      {
        organizationId,
        propertyId: property!.id,
        ownerId: ownerB!.id,
        legalPercentage: "40",
        economicPercentage: "40",
        rentDistributionPercentage: "40",
        taxContributionPercentage: "40",
        validFrom: "2020-01-01",
      },
    ]);

    return { organizationId, ownerAId: ownerA!.id, ownerBId: ownerB!.id, propertyId: property!.id, userId: user!.id };
  });
}

beforeAll(async () => {
  db = createDatabase(TEST_DATABASE_URL);
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
});

afterAll(async () => {
  await db.execute(
    sql`TRUNCATE TABLE journal_lines, journal_entries, allocation_lines, allocation_runs, allocation_rules, expenses, ownership_interests, units, properties, owners, parties, ledger_accounts, users, organizations RESTART IDENTITY CASCADE`,
  );
});

describe("runExpenseAllocation (MOV-004)", () => {
  it("distribuye por ownership_percentage según la participación económica vigente", async () => {
    const { organizationId, ownerAId, ownerBId, propertyId, userId } = await setupSharedProperty();

    await withOrganizationContext(db, organizationId, (tx) =>
      tx.insert(allocationRules).values({
        organizationId,
        propertyId,
        category: "plomeria",
        driverType: "ownership_percentage",
        validFrom: "2020-01-01",
      }),
    );

    const [expense] = await withOrganizationContext(db, organizationId, (tx) =>
      tx
        .insert(expenses)
        .values({
          organizationId,
          propertyId,
          vendorName: "Plomero SA",
          expenseDate: "2026-08-01",
          category: "plomeria",
          classification: "repair",
          currency: "UYU",
          amount: "10000.000000",
        })
        .returning(),
    );

    const result = await runExpenseAllocation(db, { organizationId, expenseId: expense!.id, triggeredBy: userId });

    const lineA = result.lines.find((l) => l.ownerId === ownerAId);
    const lineB = result.lines.find((l) => l.ownerId === ownerBId);
    expect(lineA?.amount).toBe("6000.000000");
    expect(lineB?.amount).toBe("4000.000000");
    expect(result.driverType).toBe("ownership_percentage");
  });

  it("distribuye por direct 100% al propietario indicado en driverConfig", async () => {
    const { organizationId, ownerAId, propertyId, userId } = await setupSharedProperty();

    await withOrganizationContext(db, organizationId, (tx) =>
      tx.insert(allocationRules).values({
        organizationId,
        propertyId,
        category: "multa",
        driverType: "direct",
        driverConfig: { ownerId: ownerAId },
        validFrom: "2020-01-01",
      }),
    );

    const [expense] = await withOrganizationContext(db, organizationId, (tx) =>
      tx
        .insert(expenses)
        .values({
          organizationId,
          propertyId,
          expenseDate: "2026-08-01",
          category: "multa",
          classification: "opex",
          currency: "UYU",
          amount: "5000.000000",
        })
        .returning(),
    );

    const result = await runExpenseAllocation(db, { organizationId, expenseId: expense!.id, triggeredBy: userId });

    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]?.ownerId).toBe(ownerAId);
    expect(result.lines[0]?.amount).toBe("5000.000000");
  });

  it("es idempotente: no permite distribuir el mismo gasto dos veces", async () => {
    const { organizationId, propertyId, userId } = await setupSharedProperty();
    await withOrganizationContext(db, organizationId, (tx) =>
      tx.insert(allocationRules).values({
        organizationId,
        propertyId,
        category: "jardineria",
        driverType: "ownership_percentage",
        validFrom: "2020-01-01",
      }),
    );
    const [expense] = await withOrganizationContext(db, organizationId, (tx) =>
      tx
        .insert(expenses)
        .values({
          organizationId,
          propertyId,
          expenseDate: "2026-08-01",
          category: "jardineria",
          classification: "maintenance",
          currency: "UYU",
          amount: "1000.000000",
        })
        .returning(),
    );

    await runExpenseAllocation(db, { organizationId, expenseId: expense!.id, triggeredBy: userId });
    await expect(
      runExpenseAllocation(db, { organizationId, expenseId: expense!.id, triggeredBy: userId }),
    ).rejects.toThrow(/ya fue distribuido/);
  });

  it("rechaza un driver todavía no implementado en vez de calcular algo incorrecto", async () => {
    const { organizationId, propertyId, userId } = await setupSharedProperty();
    await withOrganizationContext(db, organizationId, (tx) =>
      tx.insert(allocationRules).values({
        organizationId,
        propertyId,
        category: "pintura",
        driverType: "square_meters",
        validFrom: "2020-01-01",
      }),
    );
    const [expense] = await withOrganizationContext(db, organizationId, (tx) =>
      tx
        .insert(expenses)
        .values({
          organizationId,
          propertyId,
          expenseDate: "2026-08-01",
          category: "pintura",
          classification: "maintenance",
          currency: "UYU",
          amount: "1000.000000",
        })
        .returning(),
    );

    await expect(
      runExpenseAllocation(db, { organizationId, expenseId: expense!.id, triggeredBy: userId }),
    ).rejects.toThrow(/todavía no está implementado/);
  });

  it("rechaza distribuir sin una regla de distribución vigente configurada", async () => {
    const { organizationId, propertyId, userId } = await setupSharedProperty();
    const [expense] = await withOrganizationContext(db, organizationId, (tx) =>
      tx
        .insert(expenses)
        .values({
          organizationId,
          propertyId,
          expenseDate: "2026-08-01",
          category: "sin-regla",
          classification: "opex",
          currency: "UYU",
          amount: "1000.000000",
        })
        .returning(),
    );

    await expect(
      runExpenseAllocation(db, { organizationId, expenseId: expense!.id, triggeredBy: userId }),
    ).rejects.toThrow(/No hay una regla de distribución/);
  });
});
