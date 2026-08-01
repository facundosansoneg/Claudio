import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import {
  createDatabase,
  withOrganizationContext,
  organizations,
  parties,
  tenants,
  properties,
  units,
  leases,
  leaseParties,
  valuations,
  type Database,
} from "@farfalla/database";
import { getPropertyYield } from "../src/patrimonial/get-property-yield";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://farfalla:farfalla@localhost:5432/farfalla_test";
const MIGRATIONS_FOLDER = "../database/drizzle";

let db: Database;

async function setupPropertyWithLease(rentCurrency: string, initialRent: string) {
  const organizationId = randomUUID();
  const propertyId = await withOrganizationContext(db, organizationId, async (tx) => {
    await tx.insert(organizations).values({ id: organizationId, name: "Org de prueba" });
    const [property] = await tx
      .insert(properties)
      .values({ organizationId, internalCode: "P-1", name: "Propiedad", propertyType: "apartamento" })
      .returning({ id: properties.id });
    const [unit] = await tx
      .insert(units)
      .values({ organizationId, propertyId: property!.id, unitCode: "1", unitType: "apartamento" })
      .returning({ id: units.id });

    const [tenantParty] = await tx
      .insert(parties)
      .values({ organizationId, partyType: "person", displayName: "Inquilino" })
      .returning({ id: parties.id });
    const [tenant] = await tx.insert(tenants).values({ organizationId, partyId: tenantParty!.id }).returning({ id: tenants.id });

    const [lease] = await tx
      .insert(leases)
      .values({
        organizationId,
        unitId: unit!.id,
        leaseNumber: "L-1",
        startDate: "2026-01-01",
        endDate: "2027-12-31",
        currency: rentCurrency,
        initialRent,
        status: "active",
      })
      .returning({ id: leases.id });

    await tx.insert(leaseParties).values({
      organizationId,
      leaseId: lease!.id,
      partyId: tenantParty!.id,
      tenantId: tenant!.id,
      role: "tenant",
    });

    return property!.id;
  });
  return { organizationId, propertyId };
}

beforeAll(async () => {
  db = createDatabase(TEST_DATABASE_URL);
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
});

afterAll(async () => {
  await db.execute(
    sql`TRUNCATE TABLE valuations, lease_parties, leases, tenants, units, properties, parties, organizations RESTART IDENTITY CASCADE`,
  );
});

describe("getPropertyYield", () => {
  it("calcula el yield bruto cuando la valoración y la renta están en la misma moneda", async () => {
    const { organizationId, propertyId } = await setupPropertyWithLease("USD", "2500.000000");
    await withOrganizationContext(db, organizationId, (tx) =>
      tx.insert(valuations).values({
        organizationId,
        propertyId,
        valuationDate: "2026-06-01",
        value: "500000.000000",
        currency: "USD",
      }),
    );

    const result = await getPropertyYield(db, { organizationId, propertyId, asOfDate: "2026-08-01" });

    expect(result.marketValue).toBe("500000.000000");
    expect(result.annualizedRent).toBe("30000.000000"); // 2500 * 12
    expect(result.grossYieldPercentage).toBe("6.00000000"); // 30000 / 500000
  });

  it("devuelve null cuando la propiedad todavía no tiene valoración", async () => {
    const { organizationId, propertyId } = await setupPropertyWithLease("USD", "2500.000000");

    const result = await getPropertyYield(db, { organizationId, propertyId, asOfDate: "2026-08-01" });

    expect(result.marketValue).toBeNull();
    expect(result.grossYieldPercentage).toBeNull();
  });

  it("no mezcla monedas: renta en UYU y valoración en USD da annualizedRent null", async () => {
    const { organizationId, propertyId } = await setupPropertyWithLease("UYU", "30000.000000");
    await withOrganizationContext(db, organizationId, (tx) =>
      tx.insert(valuations).values({
        organizationId,
        propertyId,
        valuationDate: "2026-06-01",
        value: "500000.000000",
        currency: "USD",
      }),
    );

    const result = await getPropertyYield(db, { organizationId, propertyId, asOfDate: "2026-08-01" });

    expect(result.marketValue).toBe("500000.000000"); // la valoración sí existe
    expect(result.annualizedRent).toBeNull(); // pero no hay renta en USD para compararla
    expect(result.grossYieldPercentage).toBeNull();
  });

  it("usa la valoración más reciente vigente a la fecha de referencia, no la más nueva de todas", async () => {
    const { organizationId, propertyId } = await setupPropertyWithLease("USD", "2500.000000");
    await withOrganizationContext(db, organizationId, (tx) =>
      tx.insert(valuations).values([
        { organizationId, propertyId, valuationDate: "2025-01-01", value: "400000.000000", currency: "USD" },
        { organizationId, propertyId, valuationDate: "2027-01-01", value: "600000.000000", currency: "USD" }, // futura, no debe usarse
      ]),
    );

    const result = await getPropertyYield(db, { organizationId, propertyId, asOfDate: "2026-08-01" });

    expect(result.marketValue).toBe("400000.000000");
    expect(result.valuationDate).toBe("2025-01-01");
  });
});
