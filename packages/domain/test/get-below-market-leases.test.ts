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
  marketEstimates,
  type Database,
} from "@farfalla/database";
import { getBelowMarketLeases } from "../src/patrimonial/get-below-market-leases";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://farfalla:farfalla@localhost:5432/farfalla_test";
const MIGRATIONS_FOLDER = "../database/drizzle";

let db: Database;

beforeAll(async () => {
  db = createDatabase(TEST_DATABASE_URL);
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
});

afterAll(async () => {
  await db.execute(
    sql`TRUNCATE TABLE market_estimates, leases, units, properties, organizations RESTART IDENTITY CASCADE`,
  );
});

async function setupPropertyWithLease(input: { initialRent: string; targetRent?: string | null }) {
  const organizationId = randomUUID();
  return withOrganizationContext(db, organizationId, async (tx) => {
    await tx.insert(organizations).values({ id: organizationId, name: "Org de prueba" });
    const [property] = await tx
      .insert(properties)
      .values({ organizationId, internalCode: "P-1", name: "Propiedad", propertyType: "apartamento" })
      .returning({ id: properties.id });
    const [unit] = await tx
      .insert(units)
      .values({
        organizationId,
        propertyId: property!.id,
        unitCode: "1",
        unitType: "apartamento",
        targetRent: input.targetRent ?? null,
        targetRentCurrency: "USD",
      })
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
        initialRent: input.initialRent,
        status: "active",
      })
      .returning({ id: leases.id });
    return { organizationId, propertyId: property!.id, leaseId: lease!.id };
  });
}

describe("getBelowMarketLeases (spec 9.1)", () => {
  it("detecta un contrato por debajo de target_rent cuando no hay market_estimate", async () => {
    const { organizationId, leaseId } = await setupPropertyWithLease({ initialRent: "800.000000", targetRent: "1000.000000" });

    const result = await getBelowMarketLeases(db, { organizationId, asOfDate: "2026-08-01" });

    expect(result).toHaveLength(1);
    expect(result[0]?.leaseId).toBe(leaseId);
    expect(result[0]?.benchmarkSource).toBe("target_rent");
    expect(result[0]?.gapPercentage).toBe("20.00000000"); // (1000-800)/1000
  });

  it("prioriza la última estimación de mercado por sobre target_rent", async () => {
    const { organizationId, propertyId } = await setupPropertyWithLease({ initialRent: "900.000000", targetRent: "1000.000000" });
    await withOrganizationContext(db, organizationId, (tx) =>
      tx.insert(marketEstimates).values({
        organizationId,
        propertyId,
        estimateDate: "2026-07-01",
        currency: "USD",
        rentCentral: "1200.000000",
        confidence: "medium",
      }),
    );

    const result = await getBelowMarketLeases(db, { organizationId, asOfDate: "2026-08-01" });

    expect(result).toHaveLength(1);
    expect(result[0]?.benchmarkSource).toBe("market_estimate");
    expect(result[0]?.benchmarkRent).toBe("1200.000000");
  });

  it("no incluye contratos con renta igual o superior al benchmark", async () => {
    const { organizationId } = await setupPropertyWithLease({ initialRent: "1000.000000", targetRent: "1000.000000" });

    const result = await getBelowMarketLeases(db, { organizationId, asOfDate: "2026-08-01" });

    expect(result).toHaveLength(0);
  });

  it("no incluye contratos sin ningún benchmark disponible", async () => {
    const { organizationId } = await setupPropertyWithLease({ initialRent: "800.000000", targetRent: null });

    const result = await getBelowMarketLeases(db, { organizationId, asOfDate: "2026-08-01" });

    expect(result).toHaveLength(0);
  });
});
