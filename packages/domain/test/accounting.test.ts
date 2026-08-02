import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq, sql } from "drizzle-orm";
import {
  createDatabase,
  withOrganizationContext,
  organizations,
  users,
  parties,
  owners,
  properties,
  units,
  tenants,
  leases,
  leaseParties,
  journalLines,
  charges,
  type Database,
} from "@farfalla/database";
import { seedChartOfAccounts } from "../src/accounting/chart-of-accounts";
import { generateCharge } from "../src/accounting/generate-charge";
import { registerPaymentAndIssueReceipt } from "../src/accounting/register-payment";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://farfalla:farfalla@localhost:5432/farfalla_test";
const MIGRATIONS_FOLDER = "../database/drizzle";

let db: Database;

async function setupLease(organizationId: string) {
  return withOrganizationContext(db, organizationId, async (tx) => {
    await tx.insert(organizations).values({ id: organizationId, name: "Org de prueba" });

    const [user] = await tx
      .insert(users)
      .values({ organizationId, email: `${randomUUID()}@farfalla.uy`, displayName: "Operador de prueba" })
      .returning({ id: users.id });

    const [ownerParty] = await tx
      .insert(parties)
      .values({ organizationId, partyType: "person", displayName: "Propietario" })
      .returning({ id: parties.id });
    const [owner] = await tx
      .insert(owners)
      .values({ organizationId, partyId: ownerParty!.id })
      .returning({ id: owners.id });

    const [property] = await tx
      .insert(properties)
      .values({ organizationId, internalCode: "P-1", name: "Edificio de prueba", propertyType: "apartamento" })
      .returning({ id: properties.id });
    const [unit] = await tx
      .insert(units)
      .values({ organizationId, propertyId: property!.id, unitCode: "101", unitType: "apartamento" })
      .returning({ id: units.id });

    const [tenantParty] = await tx
      .insert(parties)
      .values({ organizationId, partyType: "person", displayName: "Inquilino" })
      .returning({ id: parties.id });
    const [tenant] = await tx
      .insert(tenants)
      .values({ organizationId, partyId: tenantParty!.id })
      .returning({ id: tenants.id });

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
      })
      .returning({ id: leases.id });

    await tx.insert(leaseParties).values({
      organizationId,
      leaseId: lease!.id,
      partyId: tenantParty!.id,
      tenantId: tenant!.id,
      role: "tenant",
    });

    return { ownerId: owner!.id, leaseId: lease!.id, tenantId: tenant!.id, userId: user!.id };
  });
}

beforeAll(async () => {
  db = createDatabase(TEST_DATABASE_URL);
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
});

afterAll(async () => {
  await db.execute(
    sql`TRUNCATE TABLE receipts, payment_allocations, payments, journal_lines, journal_entries, charges, lease_parties, leases, tenants, units, properties, owners, parties, ledger_accounts, users, organizations RESTART IDENTITY CASCADE`,
  );
});

describe("generateCharge + registerPaymentAndIssueReceipt (ciclo del alquiler, sección 3.4)", () => {
  it("devenga, cobra y emite recibo con asientos balanceados", async () => {
    const organizationId = randomUUID();
    const { leaseId, userId } = await setupLease(organizationId);
    await withOrganizationContext(db, organizationId, (tx) => seedChartOfAccounts(tx, organizationId));

    const first = await generateCharge(db, {
      organizationId,
      leaseId,
      chargeType: "rent",
      period: "2026-08",
      dueDate: "2026-08-01",
      amount: "30000.000000",
      triggeredBy: userId,
    });
    expect(first.created).toBe(true);

    // idempotencia: la misma generación no duplica el cargo
    const second = await generateCharge(db, {
      organizationId,
      leaseId,
      chargeType: "rent",
      period: "2026-08",
      dueDate: "2026-08-01",
      amount: "30000.000000",
      triggeredBy: userId,
    });
    expect(second.created).toBe(false);
    expect(second.chargeId).toBe(first.chargeId);

    const payment = await registerPaymentAndIssueReceipt(db, {
      organizationId,
      chargeId: first.chargeId,
      paymentDate: "2026-08-05",
      amount: "30000.000000",
      triggeredBy: userId,
    });
    expect(payment.receiptNumber).toBe("R-000001");

    // Los dos asientos (devengamiento + cobro) balancean débito = crédito.
    const lines = await withOrganizationContext(db, organizationId, (tx) =>
      tx
        .select({ debit: journalLines.debit, credit: journalLines.credit, accountId: journalLines.accountId })
        .from(journalLines),
    );
    expect(lines).toHaveLength(4);
    const totalDebit = lines.reduce((sum, l) => sum + Number(l.debit), 0);
    const totalCredit = lines.reduce((sum, l) => sum + Number(l.credit), 0);
    expect(totalDebit).toBe(totalCredit);
    expect(totalDebit).toBe(60000);
  });

  it("rechaza un pago mayor al saldo del cargo", async () => {
    const organizationId = randomUUID();
    const { leaseId, userId } = await setupLease(organizationId);
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

    await expect(
      registerPaymentAndIssueReceipt(db, {
        organizationId,
        chargeId: charge.chargeId,
        paymentDate: "2026-09-05",
        amount: "30000.000001",
        triggeredBy: userId,
      }),
    ).rejects.toThrow();
  });

  it("soporta pago parcial: el cargo queda partially_paid con el saldo correcto", async () => {
    const organizationId = randomUUID();
    const { leaseId, userId } = await setupLease(organizationId);
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

    await registerPaymentAndIssueReceipt(db, {
      organizationId,
      chargeId: charge.chargeId,
      paymentDate: "2026-10-05",
      amount: "10000.000000",
      triggeredBy: userId,
    });

    const [updatedCharge] = await withOrganizationContext(db, organizationId, (tx) =>
      tx.select().from(charges).where(eq(charges.id, charge.chargeId)),
    );
    expect(updatedCharge?.status).toBe("partially_paid");
    expect(updatedCharge?.balance).toBe("20000.000000");
  });
});
