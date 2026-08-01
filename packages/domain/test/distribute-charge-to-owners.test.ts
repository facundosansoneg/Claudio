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
  tenants,
  leases,
  leaseParties,
  taxProfiles,
  type Database,
} from "@farfalla/database";
import { seedChartOfAccounts } from "../src/accounting/chart-of-accounts";
import { generateCharge } from "../src/accounting/generate-charge";
import { registerPaymentAndIssueReceipt } from "../src/accounting/register-payment";
import { distributeChargeToOwners } from "../src/accounting/distribute-charge-to-owners";
import { getOwnerStatement } from "../src/accounting/owner-statement";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://farfalla:farfalla@localhost:5432/farfalla_test";
const MIGRATIONS_FOLDER = "../database/drizzle";

let db: Database;

/** Escenario E2E-002 del spec: 60/40 legal/económico/renta, 100/0 fiscal. */
async function setupSharedPropertyWithPaidCharge() {
  const organizationId = randomUUID();
  return withOrganizationContext(db, organizationId, async (tx) => {
    await tx.insert(organizations).values({ id: organizationId, name: "Org de prueba" });
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
    const [unit] = await tx
      .insert(units)
      .values({ organizationId, propertyId: property!.id, unitCode: "101", unitType: "apartamento" })
      .returning({ id: units.id });

    await tx.insert(ownershipInterests).values([
      {
        organizationId,
        propertyId: property!.id,
        ownerId: ownerA!.id,
        legalPercentage: "60",
        economicPercentage: "60",
        rentDistributionPercentage: "60",
        taxContributionPercentage: "100", // TAX-003: aporte fiscal distinto del económico
      },
      {
        organizationId,
        propertyId: property!.id,
        ownerId: ownerB!.id,
        legalPercentage: "40",
        economicPercentage: "40",
        rentDistributionPercentage: "40",
        taxContributionPercentage: "0",
      },
    ]);

    // Solo el propietario A tiene perfil fiscal (10% IRPF).
    await tx.insert(taxProfiles).values({
      organizationId,
      ownerId: ownerA!.id,
      taxType: "irpf",
      percentage: "10.5",
      validFrom: "2020-01-01",
    });

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
        currency: "UYU",
        initialRent: "30000.000000",
        commissionOnRentPercentage: "10", // 10% de comisión de administración
      })
      .returning({ id: leases.id });

    await tx.insert(leaseParties).values({
      organizationId,
      leaseId: lease!.id,
      partyId: tenantParty!.id,
      tenantId: tenant!.id,
      role: "tenant",
    });

    return { organizationId, ownerAId: ownerA!.id, ownerBId: ownerB!.id, leaseId: lease!.id, userId: user!.id };
  });
}

beforeAll(async () => {
  db = createDatabase(TEST_DATABASE_URL);
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
});

afterAll(async () => {
  await db.execute(
    sql`TRUNCATE TABLE receipts, payment_allocations, payments, journal_lines, journal_entries, charges, lease_parties, leases, tenants, tax_profiles, ownership_interests, units, properties, owners, parties, ledger_accounts, users, organizations RESTART IDENTITY CASCADE`,
  );
});

describe("distributeChargeToOwners — TAX-003 (aporte fiscal distinto del económico)", () => {
  it("reparte comisión y retención según corresponda a cada propietario", async () => {
    const { organizationId, ownerAId, ownerBId, leaseId, userId } = await setupSharedPropertyWithPaidCharge();
    await withOrganizationContext(db, organizationId, (tx) => seedChartOfAccounts(tx, organizationId));

    const charge = await generateCharge(db, {
      organizationId,
      leaseId,
      chargeType: "rent",
      period: "2026-08",
      dueDate: "2026-08-01",
      amount: "30000.000000",
      triggeredBy: userId,
    });
    await registerPaymentAndIssueReceipt(db, {
      organizationId,
      chargeId: charge.chargeId,
      paymentDate: "2026-08-05",
      amount: "30000.000000",
      triggeredBy: userId,
    });

    const { distributions } = await distributeChargeToOwners(db, {
      organizationId,
      chargeId: charge.chargeId,
      triggeredBy: userId,
    });

    const ownerA = distributions.find((d) => d.ownerId === ownerAId);
    const ownerB = distributions.find((d) => d.ownerId === ownerBId);

    // Propietario A: 60% de 30000 = 18000 bruto; comisión 10% de 18000 = 1800;
    // base fiscal 100% de 30000 = 30000, retención 10.5% de 30000 = 3150.
    expect(ownerA?.grossShare).toBe("18000.000000");
    expect(ownerA?.commission).toBe("1800.000000");
    expect(ownerA?.taxWithholding).toBe("3150.000000");
    expect(ownerA?.netToOwner).toBe("13050.000000"); // 18000 - 1800 - 3150

    // Propietario B: 40% de 30000 = 12000 bruto; comisión 10% = 1200;
    // base fiscal 0% => sin retención (sin tax_profile además).
    expect(ownerB?.grossShare).toBe("12000.000000");
    expect(ownerB?.commission).toBe("1200.000000");
    expect(ownerB?.taxWithholding).toBe("0.000000");
    expect(ownerB?.netToOwner).toBe("10800.000000");

    const statementA = await getOwnerStatement(db, organizationId, ownerAId);
    expect(statementA.balances).toEqual([{ currency: "UYU", balance: ownerA?.netToOwner }]);

    const statementB = await getOwnerStatement(db, organizationId, ownerBId);
    expect(statementB.balances).toEqual([{ currency: "UYU", balance: ownerB?.netToOwner }]);
  });

  it("es idempotente: no permite liquidar el mismo cargo dos veces", async () => {
    const { organizationId, leaseId, userId } = await setupSharedPropertyWithPaidCharge();
    await withOrganizationContext(db, organizationId, (tx) => seedChartOfAccounts(tx, organizationId));

    const charge = await generateCharge(db, {
      organizationId,
      leaseId,
      chargeType: "rent",
      period: "2026-09",
      dueDate: "2026-09-01",
      amount: "30000.000000",
      triggeredBy: userId,
    });
    await registerPaymentAndIssueReceipt(db, {
      organizationId,
      chargeId: charge.chargeId,
      paymentDate: "2026-09-05",
      amount: "30000.000000",
      triggeredBy: userId,
    });

    await distributeChargeToOwners(db, { organizationId, chargeId: charge.chargeId, triggeredBy: userId });

    await expect(
      distributeChargeToOwners(db, { organizationId, chargeId: charge.chargeId, triggeredBy: userId }),
    ).rejects.toThrow();
  });

  it("no permite liquidar un cargo que no está completamente pagado", async () => {
    const { organizationId, leaseId, userId } = await setupSharedPropertyWithPaidCharge();
    await withOrganizationContext(db, organizationId, (tx) => seedChartOfAccounts(tx, organizationId));

    const charge = await generateCharge(db, {
      organizationId,
      leaseId,
      chargeType: "rent",
      period: "2026-10",
      dueDate: "2026-10-01",
      amount: "30000.000000",
      triggeredBy: userId,
    });

    await expect(
      distributeChargeToOwners(db, { organizationId, chargeId: charge.chargeId, triggeredBy: userId }),
    ).rejects.toThrow();
  });
});
