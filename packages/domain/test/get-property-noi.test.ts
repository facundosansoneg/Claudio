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
  charges,
  payments,
  paymentAllocations,
  expenses,
  valuations,
  type Database,
} from "@farfalla/database";
import { getPropertyNOI } from "../src/patrimonial/get-property-noi";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://farfalla:farfalla@localhost:5432/farfalla_test";
const MIGRATIONS_FOLDER = "../database/drizzle";

let db: Database;

async function setupPropertyWithIncomeAndExpenses() {
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
        currency: "USD",
        initialRent: "1000.000000",
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

    const [charge] = await tx
      .insert(charges)
      .values({
        organizationId,
        leaseId: lease!.id,
        chargeType: "rent",
        period: "2026-08",
        dueDate: "2026-08-01",
        currency: "USD",
        originalAmount: "1000.000000",
        balance: "0.000000",
        status: "paid",
      })
      .returning({ id: charges.id });

    const [payment] = await tx
      .insert(payments)
      .values({ organizationId, payerPartyId: tenantParty!.id, paymentDate: "2026-08-05", currency: "USD", amount: "1000.000000" })
      .returning({ id: payments.id });
    await tx.insert(paymentAllocations).values({
      organizationId,
      paymentId: payment!.id,
      chargeId: charge!.id,
      appliedAmount: "1000.000000",
    });

    await tx.insert(expenses).values([
      {
        organizationId,
        propertyId: property!.id,
        expenseDate: "2026-08-10",
        category: "plomeria",
        classification: "repair",
        currency: "USD",
        amount: "200.000000",
      },
      {
        organizationId,
        propertyId: property!.id,
        expenseDate: "2026-08-15",
        category: "reforma",
        classification: "capex", // no debe contar como operativo
        currency: "USD",
        amount: "5000.000000",
      },
    ]);

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
    sql`TRUNCATE TABLE valuations, expenses, payment_allocations, payments, charges, lease_parties, leases, tenants, units, properties, parties, organizations RESTART IDENTITY CASCADE`,
  );
});

describe("getPropertyNOI", () => {
  it("calcula NOI excluyendo capex y yield neto anualizado", async () => {
    const { organizationId, propertyId } = await setupPropertyWithIncomeAndExpenses();
    await withOrganizationContext(db, organizationId, (tx) =>
      tx.insert(valuations).values({
        organizationId,
        propertyId,
        valuationDate: "2026-06-01",
        value: "146000.000000",
        currency: "USD",
      }),
    );

    const result = await getPropertyNOI(db, {
      organizationId,
      propertyId,
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
    });

    const usd = result.byCurrency.find((c) => c.currency === "USD");
    expect(usd?.collectedIncome).toBe("1000.000000");
    expect(usd?.operatingExpenses).toBe("200.000000"); // capex excluido
    expect(usd?.noi).toBe("800.000000");

    // NOI anualizado: 800 * 365/31 días ≈ 9419.354838; yield = 9419.354838/146000 ≈ 6.45%
    expect(result.netYieldCurrency).toBe("USD");
    expect(result.netYieldPercentage).not.toBeNull();
    expect(parseFloat(result.netYieldPercentage!)).toBeCloseTo(6.45, 1);
  });

  it("devuelve NOI cero para monedas sin movimientos y yield neto null sin valoración", async () => {
    const { organizationId, propertyId } = await setupPropertyWithIncomeAndExpenses();

    const result = await getPropertyNOI(db, {
      organizationId,
      propertyId,
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
    });

    expect(result.netYieldPercentage).toBeNull();
    const usd = result.byCurrency.find((c) => c.currency === "USD");
    expect(usd?.noi).toBe("800.000000");
  });

  it("no incluye ingresos ni gastos fuera del período pedido", async () => {
    const { organizationId, propertyId } = await setupPropertyWithIncomeAndExpenses();

    const result = await getPropertyNOI(db, {
      organizationId,
      propertyId,
      periodStart: "2026-01-01",
      periodEnd: "2026-01-31",
    });

    expect(result.byCurrency).toHaveLength(0);
  });
});
