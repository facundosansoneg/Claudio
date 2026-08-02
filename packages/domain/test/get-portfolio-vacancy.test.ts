import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import { createDatabase, withOrganizationContext, organizations, properties, units, leases, type Database } from "@farfalla/database";
import { getPortfolioVacancy } from "../src/patrimonial/get-portfolio-vacancy";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://farfalla:farfalla@localhost:5432/farfalla_test";
const MIGRATIONS_FOLDER = "../database/drizzle";

let db: Database;

beforeAll(async () => {
  db = createDatabase(TEST_DATABASE_URL);
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE TABLE leases, units, properties, organizations RESTART IDENTITY CASCADE`);
});

describe("getPortfolioVacancy (spec 9.1)", () => {
  it("calcula vacancia física y económica sobre 2 unidades ocupadas y 1 vacante con target_rent", async () => {
    const organizationId = randomUUID();
    await withOrganizationContext(db, organizationId, async (tx) => {
      await tx.insert(organizations).values({ id: organizationId, name: "Org de prueba" });
      const [property] = await tx
        .insert(properties)
        .values({ organizationId, internalCode: "P-1", name: "Propiedad", propertyType: "apartamento" })
        .returning({ id: properties.id });

      const [unitA] = await tx
        .insert(units)
        .values({ organizationId, propertyId: property!.id, unitCode: "A", unitType: "apartamento", occupancyStatus: "occupied" })
        .returning({ id: units.id });
      const [unitB] = await tx
        .insert(units)
        .values({ organizationId, propertyId: property!.id, unitCode: "B", unitType: "apartamento", occupancyStatus: "occupied" })
        .returning({ id: units.id });
      await tx.insert(units).values({
        organizationId,
        propertyId: property!.id,
        unitCode: "C",
        unitType: "apartamento",
        occupancyStatus: "vacant",
        targetRent: "1000.000000",
        targetRentCurrency: "USD",
      });

      await tx.insert(leases).values([
        {
          organizationId,
          unitId: unitA!.id,
          leaseNumber: "L-A",
          startDate: "2026-01-01",
          endDate: "2027-12-31",
          currency: "USD",
          initialRent: "900.000000",
          status: "active",
        },
        {
          organizationId,
          unitId: unitB!.id,
          leaseNumber: "L-B",
          startDate: "2026-01-01",
          endDate: "2027-12-31",
          currency: "USD",
          initialRent: "1100.000000",
          status: "active",
        },
      ]);
    });

    const result = await getPortfolioVacancy(db, { organizationId, asOfDate: "2026-08-01" });

    expect(result.totalUnits).toBe(3);
    expect(result.vacantUnits).toBe(1);
    expect(result.physicalVacancyPercentage).toBe("33.33333333"); // 1/3

    const usd = result.byCurrency.find((c) => c.currency === "USD");
    expect(usd?.potentialGrossRent).toBe("3000.000000"); // 900+1100+1000
    expect(usd?.contractedRent).toBe("2000.000000"); // 900+1100
    expect(usd?.economicVacancyPercentage).toBe("33.33333333"); // 1000/3000
    expect(result.unitsExcludedForMissingRent).toBe(0);
  });

  it("excluye del cálculo económico las unidades vacantes sin target_rent, en vez de asumir 0", async () => {
    const organizationId = randomUUID();
    await withOrganizationContext(db, organizationId, async (tx) => {
      await tx.insert(organizations).values({ id: organizationId, name: "Org de prueba" });
      const [property] = await tx
        .insert(properties)
        .values({ organizationId, internalCode: "P-1", name: "Propiedad", propertyType: "apartamento" })
        .returning({ id: properties.id });
      await tx.insert(units).values({
        organizationId,
        propertyId: property!.id,
        unitCode: "A",
        unitType: "apartamento",
        occupancyStatus: "vacant",
      });
    });

    const result = await getPortfolioVacancy(db, { organizationId, asOfDate: "2026-08-01" });

    expect(result.unitsExcludedForMissingRent).toBe(1);
    expect(result.byCurrency).toHaveLength(0);
    expect(result.physicalVacancyPercentage).toBe("100.00000000");
  });

  it("devuelve null cuando la organización no tiene unidades", async () => {
    const organizationId = randomUUID();
    await withOrganizationContext(db, organizationId, (tx) =>
      tx.insert(organizations).values({ id: organizationId, name: "Org vacía" }),
    );

    const result = await getPortfolioVacancy(db, { organizationId, asOfDate: "2026-08-01" });

    expect(result.totalUnits).toBe(0);
    expect(result.physicalVacancyPercentage).toBeNull();
  });
});
