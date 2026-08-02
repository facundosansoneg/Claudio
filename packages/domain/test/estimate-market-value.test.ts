import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import {
  createDatabase,
  withOrganizationContext,
  organizations,
  users,
  properties,
  marketComparables,
  marketEstimates,
  marketEstimateComparables,
  type Database,
} from "@farfalla/database";
import { estimateMarketValue } from "../src/patrimonial/estimate-market-value";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://farfalla:farfalla@localhost:5432/farfalla_test";
const MIGRATIONS_FOLDER = "../database/drizzle";

let db: Database;

async function setupProperty(overrides: Partial<typeof properties.$inferInsert> = {}) {
  const organizationId = randomUUID();
  return withOrganizationContext(db, organizationId, async (tx) => {
    await tx.insert(organizations).values({ id: organizationId, name: "Org de prueba" });
    const [user] = await tx
      .insert(users)
      .values({ organizationId, email: `${randomUUID()}@farfalla.uy`, displayName: "Operador" })
      .returning({ id: users.id });
    const [property] = await tx
      .insert(properties)
      .values({
        organizationId,
        internalCode: "P-1",
        name: "Propiedad",
        propertyType: "apartamento",
        builtAreaM2: "100.000000",
        latitude: "-34.9011",
        longitude: "-56.1645",
        ...overrides,
      })
      .returning({ id: properties.id });
    return { organizationId, propertyId: property!.id, userId: user!.id };
  });
}

async function insertComparable(
  organizationId: string,
  values: Partial<typeof marketComparables.$inferInsert> & { pricePerSqm: string },
) {
  return withOrganizationContext(db, organizationId, async (tx) => {
    const [comparable] = await tx
      .insert(marketComparables)
      .values({
        organizationId,
        transactionType: "sale",
        captureDate: "2026-07-01",
        price: "100000.000000",
        currency: "USD",
        source: "portal-x",
        ...values,
      })
      .returning({ id: marketComparables.id });
    return comparable!.id;
  });
}

beforeAll(async () => {
  db = createDatabase(TEST_DATABASE_URL);
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
});

afterAll(async () => {
  await db.execute(
    sql`TRUNCATE TABLE market_estimate_comparables, market_estimates, market_comparables, properties, users, organizations RESTART IDENTITY CASCADE`,
  );
});

describe("estimateMarketValue (spec 10.3)", () => {
  it("calcula min/central/max ponderado y confianza media con 3 comparables de venta", async () => {
    const { organizationId, propertyId, userId } = await setupProperty();
    const c1 = await insertComparable(organizationId, { pricePerSqm: "1000.000000", latitude: "-34.90", longitude: "-56.16" });
    const c2 = await insertComparable(organizationId, { pricePerSqm: "1200.000000" });
    const c3 = await insertComparable(organizationId, { pricePerSqm: "1400.000000" });

    const result = await estimateMarketValue(db, {
      organizationId,
      propertyId,
      estimateDate: "2026-08-01",
      comparables: [
        { comparableId: c1, weight: "50" },
        { comparableId: c2, weight: "30" },
        { comparableId: c3, weight: "20" },
      ],
      triggeredBy: userId,
    });

    // ponderado: 1000*.5 + 1200*.3 + 1400*.2 = 1140 → ×100m² = 114000
    expect(result.valueCentral).toBe("114000.000000");
    expect(result.valueMin).toBe("100000.000000"); // Q1 (1000) × 100
    expect(result.valueMax).toBe("140000.000000"); // Q3 (1400) × 100
    expect(result.confidence).toBe("medium");
    expect(result.currency).toBe("USD");
    expect(result.rentCentral).toBeNull();

    const links = await withOrganizationContext(db, organizationId, (tx) =>
      tx.select().from(marketEstimateComparables).where(sql`market_estimate_id = ${result.marketEstimateId}`),
    );
    expect(links).toHaveLength(3);
    const link1 = links.find((l) => l.marketComparableId === c1);
    expect(link1?.distanceKm).not.toBeNull();
  });

  it("calcula venta y alquiler por separado en la misma corrida", async () => {
    const { organizationId, propertyId, userId } = await setupProperty();
    const sale1 = await insertComparable(organizationId, { transactionType: "sale", pricePerSqm: "1000.000000" });
    const sale2 = await insertComparable(organizationId, { transactionType: "sale", pricePerSqm: "1000.000000" });
    const rent1 = await insertComparable(organizationId, { transactionType: "rent", pricePerSqm: "10.000000", currency: "USD" });
    const rent2 = await insertComparable(organizationId, { transactionType: "rent", pricePerSqm: "12.000000", currency: "USD" });

    const result = await estimateMarketValue(db, {
      organizationId,
      propertyId,
      estimateDate: "2026-08-01",
      comparables: [
        { comparableId: sale1, weight: "50" },
        { comparableId: sale2, weight: "50" },
        { comparableId: rent1, weight: "50" },
        { comparableId: rent2, weight: "50" },
      ],
      triggeredBy: userId,
    });

    expect(result.valueCentral).toBe("100000.000000");
    expect(result.rentCentral).toBe("1100.000000"); // (10*.5+12*.5)=11 × 100m²
  });

  it("rechaza si los pesos de un grupo no suman 100", async () => {
    const { organizationId, propertyId, userId } = await setupProperty();
    const c1 = await insertComparable(organizationId, { pricePerSqm: "1000.000000" });
    const c2 = await insertComparable(organizationId, { pricePerSqm: "1200.000000" });

    await expect(
      estimateMarketValue(db, {
        organizationId,
        propertyId,
        estimateDate: "2026-08-01",
        comparables: [
          { comparableId: c1, weight: "50" },
          { comparableId: c2, weight: "30" },
        ],
        triggeredBy: userId,
      }),
    ).rejects.toThrow(/deben sumar 100/);
  });

  it("rechaza mezclar monedas dentro del mismo grupo", async () => {
    const { organizationId, propertyId, userId } = await setupProperty();
    const c1 = await insertComparable(organizationId, { pricePerSqm: "1000.000000", currency: "USD" });
    const c2 = await insertComparable(organizationId, { pricePerSqm: "1200.000000", currency: "UYU" });

    await expect(
      estimateMarketValue(db, {
        organizationId,
        propertyId,
        estimateDate: "2026-08-01",
        comparables: [
          { comparableId: c1, weight: "50" },
          { comparableId: c2, weight: "50" },
        ],
        triggeredBy: userId,
      }),
    ).rejects.toThrow(/monedas distintas/);
  });

  it("rechaza una propiedad sin superficie cargada", async () => {
    const { organizationId, propertyId, userId } = await setupProperty({ builtAreaM2: null, landAreaM2: null });
    const c1 = await insertComparable(organizationId, { pricePerSqm: "1000.000000" });

    await expect(
      estimateMarketValue(db, {
        organizationId,
        propertyId,
        estimateDate: "2026-08-01",
        comparables: [{ comparableId: c1, weight: "100" }],
        triggeredBy: userId,
      }),
    ).rejects.toThrow(/no tiene superficie cargada/);
  });

  it("rechaza un comparable sin precio por m² (sin superficie propia cargada)", async () => {
    const { organizationId, propertyId, userId } = await setupProperty();
    const c1 = await insertComparable(organizationId, { pricePerSqm: null, areaM2: null });

    await expect(
      estimateMarketValue(db, {
        organizationId,
        propertyId,
        estimateDate: "2026-08-01",
        comparables: [{ comparableId: c1, weight: "100" }],
        triggeredBy: userId,
      }),
    ).rejects.toThrow(/no tiene precio por m²/);
  });

  it("rechaza repetir el mismo comparable dos veces", async () => {
    const { organizationId, propertyId, userId } = await setupProperty();
    const c1 = await insertComparable(organizationId, { pricePerSqm: "1000.000000" });

    await expect(
      estimateMarketValue(db, {
        organizationId,
        propertyId,
        estimateDate: "2026-08-01",
        comparables: [
          { comparableId: c1, weight: "50" },
          { comparableId: c1, weight: "50" },
        ],
        triggeredBy: userId,
      }),
    ).rejects.toThrow(/no se puede repetir/i);
  });
});
