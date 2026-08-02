import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import {
  createDatabase,
  withOrganizationContext,
  organizations,
  families,
  parties,
  owners,
  properties,
  units,
  leases,
  valuations,
  ownershipInterests,
  type Database,
} from "@farfalla/database";
import { getYieldByDimension } from "../src/patrimonial/get-yield-by-dimension";

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
    sql`TRUNCATE TABLE ownership_interests, valuations, leases, units, properties, owners, families, parties, organizations RESTART IDENTITY CASCADE`,
  );
});

async function setupTwoProperties() {
  const organizationId = randomUUID();
  return withOrganizationContext(db, organizationId, async (tx) => {
    await tx.insert(organizations).values({ id: organizationId, name: "Org de prueba" });
    const [family] = await tx.insert(families).values({ organizationId, name: "Familia Pérez" }).returning({ id: families.id });

    const [partyA] = await tx.insert(parties).values({ organizationId, partyType: "person", displayName: "Propietario A" }).returning({ id: parties.id });
    const [ownerA] = await tx.insert(owners).values({ organizationId, partyId: partyA!.id, familyId: family!.id }).returning({ id: owners.id });
    const [partyB] = await tx.insert(parties).values({ organizationId, partyType: "person", displayName: "Propietario B" }).returning({ id: parties.id });
    const [ownerB] = await tx.insert(owners).values({ organizationId, partyId: partyB!.id }).returning({ id: owners.id });

    // Propiedad 1: apartamento en Pocitos, 100% de ownerA, yield 6%
    const [property1] = await tx
      .insert(properties)
      .values({ organizationId, internalCode: "P-1", name: "Apto Pocitos", propertyType: "apartamento", neighborhood: "Pocitos" })
      .returning({ id: properties.id });
    const [unit1] = await tx
      .insert(units)
      .values({ organizationId, propertyId: property1!.id, unitCode: "1", unitType: "apartamento" })
      .returning({ id: units.id });
    await tx.insert(leases).values({
      organizationId,
      unitId: unit1!.id,
      leaseNumber: "L-1",
      startDate: "2026-01-01",
      endDate: "2027-12-31",
      currency: "USD",
      initialRent: "2500.000000", // anual 30000
      status: "active",
    });
    await tx.insert(valuations).values({ organizationId, propertyId: property1!.id, valuationDate: "2026-06-01", value: "500000.000000", currency: "USD" });
    await tx.insert(ownershipInterests).values({
      organizationId,
      propertyId: property1!.id,
      ownerId: ownerA!.id,
      legalPercentage: "100",
      economicPercentage: "100",
      rentDistributionPercentage: "100",
      taxContributionPercentage: "100",
      validFrom: "2020-01-01",
    });

    // Propiedad 2: casa en Carrasco, 50/50 entre ownerA y ownerB, yield 10%
    const [property2] = await tx
      .insert(properties)
      .values({ organizationId, internalCode: "P-2", name: "Casa Carrasco", propertyType: "casa", neighborhood: "Carrasco" })
      .returning({ id: properties.id });
    const [unit2] = await tx
      .insert(units)
      .values({ organizationId, propertyId: property2!.id, unitCode: "1", unitType: "casa" })
      .returning({ id: units.id });
    await tx.insert(leases).values({
      organizationId,
      unitId: unit2!.id,
      leaseNumber: "L-2",
      startDate: "2026-01-01",
      endDate: "2027-12-31",
      currency: "USD",
      initialRent: "2500.000000", // anual 30000, sobre 300000 = 10%
      status: "active",
    });
    await tx.insert(valuations).values({ organizationId, propertyId: property2!.id, valuationDate: "2026-06-01", value: "300000.000000", currency: "USD" });
    await tx.insert(ownershipInterests).values([
      {
        organizationId,
        propertyId: property2!.id,
        ownerId: ownerA!.id,
        legalPercentage: "50",
        economicPercentage: "50",
        rentDistributionPercentage: "50",
        taxContributionPercentage: "50",
        validFrom: "2020-01-01",
      },
      {
        organizationId,
        propertyId: property2!.id,
        ownerId: ownerB!.id,
        legalPercentage: "50",
        economicPercentage: "50",
        rentDistributionPercentage: "50",
        taxContributionPercentage: "50",
        validFrom: "2020-01-01",
      },
    ]);

    return { organizationId, ownerAId: ownerA!.id, ownerBId: ownerB!.id, familyId: family!.id };
  });
}

describe("getYieldByDimension (spec 9.1/9.3)", () => {
  it("agrega yield bruto por tipo de inmueble y por barrio", async () => {
    const { organizationId } = await setupTwoProperties();

    const result = await getYieldByDimension(db, { organizationId, asOfDate: "2026-08-01" });

    const apartamento = result.byPropertyType.find((g) => g.key === "apartamento");
    expect(apartamento?.marketValue).toBe("500000.000000");
    expect(apartamento?.yieldPercentage).toBe("6.00000000");

    const casa = result.byPropertyType.find((g) => g.key === "casa");
    expect(casa?.yieldPercentage).toBe("10.00000000");

    const pocitos = result.byNeighborhood.find((g) => g.key === "Pocitos");
    expect(pocitos?.yieldPercentage).toBe("6.00000000");
  });

  it("prorratea valor y renta por participación económica al agregar por propietario", async () => {
    const { organizationId, ownerAId, ownerBId } = await setupTwoProperties();

    const result = await getYieldByDimension(db, { organizationId, asOfDate: "2026-08-01" });

    // ownerA: 100% de P1 (500000/30000) + 50% de P2 (150000/15000) = 650000/45000 => 6.92307692%
    const ownerA = result.byOwner.find((g) => g.key === ownerAId);
    expect(ownerA?.marketValue).toBe("650000.000000");
    expect(ownerA?.annualizedRent).toBe("45000.000000");

    // ownerB: solo 50% de P2 = 150000/15000 = 10%
    const ownerB = result.byOwner.find((g) => g.key === ownerBId);
    expect(ownerB?.marketValue).toBe("150000.000000");
    expect(ownerB?.yieldPercentage).toBe("10.00000000");
  });

  it("agrega por familia sumando los propietarios que pertenecen a ella", async () => {
    const { organizationId, familyId } = await setupTwoProperties();

    const result = await getYieldByDimension(db, { organizationId, asOfDate: "2026-08-01" });

    // Familia Pérez == ownerA (ownerB no tiene familia asignada)
    const family = result.byFamily.find((g) => g.key === familyId);
    expect(family?.marketValue).toBe("650000.000000");
  });

  it("excluye propiedades sin valoración o sin renta activa en la misma moneda", async () => {
    const organizationId = randomUUID();
    await withOrganizationContext(db, organizationId, async (tx) => {
      await tx.insert(organizations).values({ id: organizationId, name: "Org sin datos" });
      await tx
        .insert(properties)
        .values({ organizationId, internalCode: "P-1", name: "Propiedad sin valorar", propertyType: "apartamento" });
    });

    const result = await getYieldByDimension(db, { organizationId, asOfDate: "2026-08-01" });

    expect(result.byPropertyType).toHaveLength(0);
    expect(result.byNeighborhood).toHaveLength(0);
    expect(result.byOwner).toHaveLength(0);
  });
});
