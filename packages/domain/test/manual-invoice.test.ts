import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq, sql } from "drizzle-orm";
import {
  createDatabase,
  withOrganizationContext,
  organizations,
  users,
  parameters,
  invoiceSeries,
  invoices,
  type Database,
} from "@farfalla/database";
import { createManualInvoiceDraft } from "../src/invoicing/create-manual-invoice-draft";
import { confirmManualInvoice } from "../src/invoicing/confirm-manual-invoice";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://farfalla:farfalla@localhost:5432/farfalla_test";
const MIGRATIONS_FOLDER = "../database/drizzle";

let db: Database;

async function setupOrgWithSeries(hasVat: boolean) {
  const organizationId = randomUUID();
  const { seriesId, userId } = await withOrganizationContext(db, organizationId, async (tx) => {
    await tx.insert(organizations).values({ id: organizationId, name: "Org de prueba" });
    const [user] = await tx
      .insert(users)
      .values({ organizationId, email: `${randomUUID()}@farfalla.uy`, displayName: "Operador" })
      .returning({ id: users.id });
    if (hasVat) {
      await tx.insert(parameters).values({
        organizationId,
        category: "vat_rate",
        code: "general",
        label: "IVA general",
        value: { percentage: "22" },
        validFrom: "2020-01-01",
      });
    }
    const [series] = await tx
      .insert(invoiceSeries)
      .values({ organizationId, code: "A", name: "Serie A", prefix: "A" })
      .returning({ id: invoiceSeries.id });
    return { seriesId: series!.id, userId: user!.id };
  });
  return { organizationId, seriesId, userId };
}

beforeAll(async () => {
  db = createDatabase(TEST_DATABASE_URL);
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
});

afterAll(async () => {
  await db.execute(
    sql`TRUNCATE TABLE invoices, invoice_series, parameters, users, organizations RESTART IDENTITY CASCADE`,
  );
});

describe("createManualInvoiceDraft + confirmManualInvoice (INV-001)", () => {
  it("crea un borrador sin número y lo confirma con número secuencial, descuento e IVA", async () => {
    const { organizationId, seriesId, userId } = await setupOrgWithSeries(true);

    const { invoiceId } = await createManualInvoiceDraft(db, {
      organizationId,
      seriesId,
      documentType: "honorarios",
      description: "Honorarios de administración agosto 2026",
      currency: "UYU",
      amount: "10000.000000",
      discountPercentage: "10",
      hasVat: true,
      triggeredBy: userId,
    });

    const [draft] = await withOrganizationContext(db, organizationId, (tx) =>
      tx.select().from(invoices).where(eq(invoices.id, invoiceId)),
    );
    expect(draft?.status).toBe("draft");
    expect(draft?.number).toBeNull();

    const result = await confirmManualInvoice(db, {
      organizationId,
      invoiceId,
      issueDate: "2026-08-01",
      triggeredBy: userId,
    });

    // 10000 - 10% descuento = 9000; IVA 22% de 9000 = 1980; total 10980.
    expect(result.number).toBe("A-000001");
    expect(result.vatAmount).toBe("1980.000000");
    expect(result.totalAmount).toBe("10980.000000");

    const [confirmed] = await withOrganizationContext(db, organizationId, (tx) =>
      tx.select().from(invoices).where(eq(invoices.id, invoiceId)),
    );
    expect(confirmed?.status).toBe("confirmed");
    expect(confirmed?.issueDate).toBe("2026-08-01");
  });

  it("numera secuencialmente dentro de la misma serie, sin huecos ni duplicados", async () => {
    const { organizationId, seriesId, userId } = await setupOrgWithSeries(false);

    const numbers: string[] = [];
    for (let i = 0; i < 3; i++) {
      const { invoiceId } = await createManualInvoiceDraft(db, {
        organizationId,
        seriesId,
        documentType: "honorarios",
        description: `Factura ${i}`,
        currency: "UYU",
        amount: "1000.000000",
        hasVat: false,
        triggeredBy: userId,
      });
      const { number } = await confirmManualInvoice(db, {
        organizationId,
        invoiceId,
        issueDate: "2026-08-01",
        triggeredBy: userId,
      });
      numbers.push(number);
    }

    expect(numbers).toEqual(["A-000001", "A-000002", "A-000003"]);
  });

  it("no permite confirmar la misma factura dos veces", async () => {
    const { organizationId, seriesId, userId } = await setupOrgWithSeries(false);
    const { invoiceId } = await createManualInvoiceDraft(db, {
      organizationId,
      seriesId,
      documentType: "honorarios",
      description: "Factura única",
      currency: "UYU",
      amount: "1000.000000",
      hasVat: false,
      triggeredBy: userId,
    });

    await confirmManualInvoice(db, { organizationId, invoiceId, issueDate: "2026-08-01", triggeredBy: userId });

    await expect(
      confirmManualInvoice(db, { organizationId, invoiceId, issueDate: "2026-08-01", triggeredBy: userId }),
    ).rejects.toThrow();
  });

  it("rechaza confirmar con IVA si no hay una tasa de IVA configurada", async () => {
    const { organizationId, seriesId, userId } = await setupOrgWithSeries(false); // sin vat_rate
    const { invoiceId } = await createManualInvoiceDraft(db, {
      organizationId,
      seriesId,
      documentType: "honorarios",
      description: "Factura con IVA sin tasa configurada",
      currency: "UYU",
      amount: "1000.000000",
      hasVat: true,
      triggeredBy: userId,
    });

    await expect(
      confirmManualInvoice(db, { organizationId, invoiceId, issueDate: "2026-08-01", triggeredBy: userId }),
    ).rejects.toThrow(/tasa de IVA vigente/);
  });
});
