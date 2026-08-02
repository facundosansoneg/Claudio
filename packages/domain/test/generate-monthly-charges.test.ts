import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { and, eq, sql } from "drizzle-orm";
import {
  createDatabase,
  withOrganizationContext,
  organizations,
  users,
  properties,
  units,
  leases,
  charges,
  type Database,
} from "@farfalla/database";
import { seedChartOfAccounts } from "../src/accounting/chart-of-accounts";
import { generateMonthlyCharges } from "../src/accounting/generate-monthly-charges";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://farfalla:farfalla@localhost:5432/farfalla_test";
const MIGRATIONS_FOLDER = "../database/drizzle";

let db: Database;

async function setupOrgWithLeases() {
  const organizationId = randomUUID();
  const { userId, activeLeaseId } = await withOrganizationContext(db, organizationId, async (tx) => {
    await tx.insert(organizations).values({ id: organizationId, name: "Org de prueba" });
    await seedChartOfAccounts(tx, organizationId);
    const [user] = await tx
      .insert(users)
      .values({ organizationId, email: `${randomUUID()}@farfalla.uy`, displayName: "Operador" })
      .returning({ id: users.id });
    const [property] = await tx
      .insert(properties)
      .values({ organizationId, internalCode: "P-1", name: "Propiedad", propertyType: "apartamento" })
      .returning({ id: properties.id });

    const [activeUnit] = await tx
      .insert(units)
      .values({ organizationId, propertyId: property!.id, unitCode: "1", unitType: "apartamento" })
      .returning({ id: units.id });
    const [activeLease] = await tx
      .insert(leases)
      .values({
        organizationId,
        unitId: activeUnit!.id,
        leaseNumber: "L-active",
        startDate: "2026-01-01",
        endDate: "2027-12-31",
        currency: "USD",
        initialRent: "1000.000000",
        dueDay: 10,
        status: "active",
      })
      .returning({ id: leases.id });

    const [terminatedUnit] = await tx
      .insert(units)
      .values({ organizationId, propertyId: property!.id, unitCode: "2", unitType: "apartamento" })
      .returning({ id: units.id });
    await tx.insert(leases).values({
      organizationId,
      unitId: terminatedUnit!.id,
      leaseNumber: "L-terminated",
      startDate: "2025-01-01",
      endDate: "2025-12-31",
      currency: "USD",
      initialRent: "800.000000",
      status: "terminated",
    });

    return { userId: user!.id, activeLeaseId: activeLease!.id };
  });
  return { organizationId, userId, activeLeaseId };
}

beforeAll(async () => {
  db = createDatabase(TEST_DATABASE_URL);
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
});

afterAll(async () => {
  await db.execute(
    sql`TRUNCATE TABLE journal_lines, journal_entries, charges, leases, units, properties, ledger_accounts, users, organizations RESTART IDENTITY CASCADE`,
  );
});

describe("generateMonthlyCharges (spec sección 15)", () => {
  it("genera el cargo de alquiler solo para contratos activos, con el día de vencimiento del contrato", async () => {
    const { organizationId, userId, activeLeaseId } = await setupOrgWithLeases();

    const result = await generateMonthlyCharges(db, { organizationId, period: "2026-08", triggeredBy: userId });

    expect(result.created).toBe(1);
    expect(result.alreadyExisted).toBe(0);

    const [charge] = await withOrganizationContext(db, organizationId, (tx) =>
      tx.select().from(charges).where(and(eq(charges.leaseId, activeLeaseId), eq(charges.period, "2026-08"))),
    );
    expect(charge?.originalAmount).toBe("1000.000000");
    expect(charge?.dueDate).toBe("2026-08-10");
  });

  it("es idempotente: correrlo dos veces para el mismo período no duplica cargos", async () => {
    const { organizationId, userId } = await setupOrgWithLeases();

    await generateMonthlyCharges(db, { organizationId, period: "2026-08", triggeredBy: userId });
    const second = await generateMonthlyCharges(db, { organizationId, period: "2026-08", triggeredBy: userId });

    expect(second.created).toBe(0);
    expect(second.alreadyExisted).toBe(1);
  });
});
