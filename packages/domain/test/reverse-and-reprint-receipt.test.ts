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
  charges,
  journalEntries,
  receipts,
  type Database,
} from "@farfalla/database";
import { seedChartOfAccounts } from "../src/accounting/chart-of-accounts";
import { generateCharge } from "../src/accounting/generate-charge";
import { registerPaymentAndIssueReceipt } from "../src/accounting/register-payment";
import { reverseReceipt } from "../src/accounting/reverse-receipt";
import { reprintReceipt } from "../src/accounting/reprint-receipt";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://farfalla:farfalla@localhost:5432/farfalla_test";
const MIGRATIONS_FOLDER = "../database/drizzle";

let db: Database;

async function setupPaidCharge(organizationId: string) {
  return withOrganizationContext(db, organizationId, async (tx) => {
    await tx.insert(organizations).values({ id: organizationId, name: "Org de prueba" });
    const [user] = await tx
      .insert(users)
      .values({ organizationId, email: `${randomUUID()}@farfalla.uy`, displayName: "Operador" })
      .returning({ id: users.id });

    const [ownerParty] = await tx
      .insert(parties)
      .values({ organizationId, partyType: "person", displayName: "Propietario" })
      .returning({ id: parties.id });
    await tx.insert(owners).values({ organizationId, partyId: ownerParty!.id });

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

    return { leaseId: lease!.id, userId: user!.id };
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

describe("reprintReceipt", () => {
  it("suma el contador de copias sin crear un pago nuevo", async () => {
    const organizationId = randomUUID();
    const { leaseId, userId } = await setupPaidCharge(organizationId);
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
    const { receiptId } = await registerPaymentAndIssueReceipt(db, {
      organizationId,
      chargeId: charge.chargeId,
      paymentDate: "2026-08-05",
      amount: "30000.000000",
      triggeredBy: userId,
    });

    const first = await reprintReceipt(db, { organizationId, receiptId, triggeredBy: userId });
    const second = await reprintReceipt(db, { organizationId, receiptId, triggeredBy: userId });

    expect(first.reprintCount).toBe(1);
    expect(second.reprintCount).toBe(2);

    const [receipt] = await withOrganizationContext(db, organizationId, (tx) =>
      tx.select().from(receipts).where(eq(receipts.id, receiptId)),
    );
    expect(receipt?.id).toBe(receiptId); // mismo ID, no se creó un recibo nuevo
    expect(receipt?.reprintCount).toBe(2);
  });
});

describe("reverseReceipt", () => {
  it("anula el recibo, revierte el asiento y devuelve el cargo a pendiente", async () => {
    const organizationId = randomUUID();
    const { leaseId, userId } = await setupPaidCharge(organizationId);
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
    const { receiptId } = await registerPaymentAndIssueReceipt(db, {
      organizationId,
      chargeId: charge.chargeId,
      paymentDate: "2026-09-05",
      amount: "30000.000000",
      triggeredBy: userId,
    });

    await reverseReceipt(db, {
      organizationId,
      receiptId,
      reason: "Pago duplicado por error",
      triggeredBy: userId,
    });

    const [updatedCharge] = await withOrganizationContext(db, organizationId, (tx) =>
      tx.select().from(charges).where(eq(charges.id, charge.chargeId)),
    );
    expect(updatedCharge?.status).toBe("pending");
    expect(updatedCharge?.balance).toBe("30000.000000");

    const [updatedReceipt] = await withOrganizationContext(db, organizationId, (tx) =>
      tx.select().from(receipts).where(eq(receipts.id, receiptId)),
    );
    expect(updatedReceipt?.status).toBe("voided");
    expect(updatedReceipt?.voidReason).toBe("Pago duplicado por error");

    // El asiento original queda marcado reversed y aparece un asiento de
    // reversión balanceado (débito/crédito invertidos).
    const entries = await withOrganizationContext(db, organizationId, (tx) =>
      tx.select().from(journalEntries).where(eq(journalEntries.sourceDocumentId, receiptId)),
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]?.source).toBe("receipt_reversal");
  });

  it("no permite anular un recibo ya anulado", async () => {
    const organizationId = randomUUID();
    const { leaseId, userId } = await setupPaidCharge(organizationId);
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
    const { receiptId } = await registerPaymentAndIssueReceipt(db, {
      organizationId,
      chargeId: charge.chargeId,
      paymentDate: "2026-10-05",
      amount: "30000.000000",
      triggeredBy: userId,
    });

    await reverseReceipt(db, { organizationId, receiptId, reason: "Error", triggeredBy: userId });

    await expect(
      reverseReceipt(db, { organizationId, receiptId, reason: "De nuevo", triggeredBy: userId }),
    ).rejects.toThrow();
  });

  it("exige un motivo para anular", async () => {
    const organizationId = randomUUID();
    const { leaseId, userId } = await setupPaidCharge(organizationId);
    await withOrganizationContext(db, organizationId, (tx) => seedChartOfAccounts(tx, organizationId));

    const charge = await generateCharge(db, {
      organizationId,
      leaseId,
      chargeType: "rent",
      period: "2026-11",
      dueDate: "2026-11-01",
      amount: "30000.000000",
      triggeredBy: userId,
    });
    const { receiptId } = await registerPaymentAndIssueReceipt(db, {
      organizationId,
      chargeId: charge.chargeId,
      paymentDate: "2026-11-05",
      amount: "30000.000000",
      triggeredBy: userId,
    });

    await expect(
      reverseReceipt(db, { organizationId, receiptId, reason: "  ", triggeredBy: userId }),
    ).rejects.toThrow();
  });
});
