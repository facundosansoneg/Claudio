import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import {
  createDatabase,
  withOrganizationContext,
  organizations,
  properties,
  units,
  leases,
  charges,
  type Database,
} from "@farfalla/database";
import { getPortfolioDelinquency } from "../src/patrimonial/get-portfolio-delinquency";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://farfalla:farfalla@localhost:5432/farfalla_test";
const MIGRATIONS_FOLDER = "../database/drizzle";

let db: Database;

async function setupLease() {
  const organizationId = randomUUID();
  const leaseId = await withOrganizationContext(db, organizationId, async (tx) => {
    await tx.insert(organizations).values({ id: organizationId, name: "Org de prueba" });
    const [property] = await tx
      .insert(properties)
      .values({ organizationId, internalCode: "P-1", name: "Propiedad", propertyType: "apartamento" })
      .returning({ id: properties.id });
    const [unit] = await tx
      .insert(units)
      .values({ organizationId, propertyId: property!.id, unitCode: "1", unitType: "apartamento" })
      .returning({ id: units.id });
    const [lease] = await tx
      .insert(leases)
      .values({
        organizationId,
        unitId: unit!.id,
        leaseNumber: "L-1",
        startDate: "2026-01-01",
        endDate: "2027-12-31",
        currency: "USD",
        initialRent: "1000.000000",
        status: "active",
      })
      .returning({ id: leases.id });
    return lease!.id;
  });
  return { organizationId, leaseId };
}

beforeAll(async () => {
  db = createDatabase(TEST_DATABASE_URL);
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE TABLE charges, leases, units, properties, organizations RESTART IDENTITY CASCADE`);
});

describe("getPortfolioDelinquency (spec 9.1)", () => {
  it("calcula el saldo vencido sobre facturado, por moneda", async () => {
    const { organizationId, leaseId } = await setupLease();
    await withOrganizationContext(db, organizationId, (tx) =>
      tx.insert(charges).values([
        {
          organizationId,
          leaseId,
          chargeType: "rent",
          period: "2026-06",
          dueDate: "2026-06-01",
          currency: "USD",
          originalAmount: "1000.000000",
          balance: "1000.000000", // impago total
          status: "pending",
        },
        {
          organizationId,
          leaseId,
          chargeType: "rent",
          period: "2026-07",
          dueDate: "2026-07-01",
          currency: "USD",
          originalAmount: "1000.000000",
          balance: "0.000000", // cobrado
          status: "paid",
        },
      ]),
    );

    const result = await getPortfolioDelinquency(db, { organizationId, asOfDate: "2026-08-01" });

    const usd = result.byCurrency.find((c) => c.currency === "USD");
    expect(usd?.billed).toBe("2000.000000");
    expect(usd?.overdueBalance).toBe("1000.000000");
    expect(usd?.delinquencyPercentage).toBe("50.00000000");
  });

  it("no incluye cargos todavía no vencidos ni cargos anulados", async () => {
    const { organizationId, leaseId } = await setupLease();
    await withOrganizationContext(db, organizationId, (tx) =>
      tx.insert(charges).values([
        {
          organizationId,
          leaseId,
          chargeType: "rent",
          period: "2026-09",
          dueDate: "2026-09-01", // futuro respecto al asOfDate
          currency: "USD",
          originalAmount: "1000.000000",
          balance: "1000.000000",
          status: "pending",
        },
        {
          organizationId,
          leaseId,
          chargeType: "rent",
          period: "2026-07",
          dueDate: "2026-07-01",
          currency: "USD",
          originalAmount: "1000.000000",
          balance: "1000.000000",
          status: "cancelled",
        },
      ]),
    );

    const result = await getPortfolioDelinquency(db, { organizationId, asOfDate: "2026-08-01" });

    expect(result.byCurrency).toHaveLength(0);
  });
});
