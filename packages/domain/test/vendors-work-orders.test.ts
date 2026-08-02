import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq, sql } from "drizzle-orm";
import {
  createDatabase,
  withOrganizationContext,
  organizations,
  users,
  properties,
  vendors,
  workOrders,
  expenses,
  type Database,
} from "@farfalla/database";
import { createVendor } from "../src/operations/create-vendor";
import { createWorkOrder } from "../src/operations/create-work-order";
import { updateWorkOrderStatus } from "../src/operations/update-work-order-status";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://farfalla:farfalla@localhost:5432/farfalla_test";
const MIGRATIONS_FOLDER = "../database/drizzle";

let db: Database;

async function setupOrgWithProperty() {
  const organizationId = randomUUID();
  return withOrganizationContext(db, organizationId, async (tx) => {
    await tx.insert(organizations).values({ id: organizationId, name: "Org de prueba" });
    const [user] = await tx
      .insert(users)
      .values({ organizationId, email: `${randomUUID()}@farfalla.uy`, displayName: "Operador" })
      .returning({ id: users.id });
    const [property] = await tx
      .insert(properties)
      .values({ organizationId, internalCode: "P-1", name: "Propiedad", propertyType: "apartamento" })
      .returning({ id: properties.id });
    return { organizationId, userId: user!.id, propertyId: property!.id };
  });
}

beforeAll(async () => {
  db = createDatabase(TEST_DATABASE_URL);
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
});

afterAll(async () => {
  await db.execute(
    sql`TRUNCATE TABLE expenses, work_orders, vendors, properties, users, organizations RESTART IDENTITY CASCADE`,
  );
});

describe("createVendor (spec 11.3)", () => {
  it("crea un proveedor", async () => {
    const { organizationId, userId } = await setupOrgWithProperty();

    const vendorId = await createVendor(db, { organizationId, legalName: "Plomero SA", rating: 4, createdBy: userId });

    const [vendor] = await withOrganizationContext(db, organizationId, (tx) => tx.select().from(vendors).where(eq(vendors.id, vendorId)));
    expect(vendor?.legalName).toBe("Plomero SA");
    expect(vendor?.rating).toBe(4);
  });

  it("rechaza una evaluación fuera de 1-5", async () => {
    const { organizationId, userId } = await setupOrgWithProperty();

    await expect(createVendor(db, { organizationId, legalName: "X", rating: 6, createdBy: userId })).rejects.toThrow(/entre 1 y 5/);
  });
});

describe("updateWorkOrderStatus — flujo completo hasta gasto (spec 11.2)", () => {
  it("recorre requested -> ... -> closed y genera el gasto real", async () => {
    const { organizationId, userId, propertyId } = await setupOrgWithProperty();
    const vendorId = await createVendor(db, { organizationId, legalName: "Electricista SA", createdBy: userId });
    const workOrderId = await createWorkOrder(db, {
      organizationId,
      title: "Reparar tablero eléctrico",
      propertyId,
      classification: "repair",
      currency: "USD",
      createdBy: userId,
    });

    await withOrganizationContext(db, organizationId, (tx) => tx.update(workOrders).set({ vendorId }).where(eq(workOrders.id, workOrderId)));

    await updateWorkOrderStatus(db, { organizationId, workOrderId, newStatus: "diagnosed", triggeredBy: userId });
    await updateWorkOrderStatus(db, {
      organizationId,
      workOrderId,
      newStatus: "budgeted",
      triggeredBy: userId,
      estimatedCost: "500.000000",
    });
    await updateWorkOrderStatus(db, { organizationId, workOrderId, newStatus: "approved", triggeredBy: userId });
    await updateWorkOrderStatus(db, { organizationId, workOrderId, newStatus: "in_execution", triggeredBy: userId });
    await updateWorkOrderStatus(db, { organizationId, workOrderId, newStatus: "controlled", triggeredBy: userId });
    await updateWorkOrderStatus(db, {
      organizationId,
      workOrderId,
      newStatus: "closed",
      triggeredBy: userId,
      actualCost: "550.000000",
      today: "2026-08-01",
    });

    const [workOrder] = await withOrganizationContext(db, organizationId, (tx) => tx.select().from(workOrders).where(eq(workOrders.id, workOrderId)));
    expect(workOrder?.status).toBe("closed");
    expect(workOrder?.expenseId).not.toBeNull();
    expect(workOrder?.ownerApproved).toBe("approved");

    const [expense] = await withOrganizationContext(db, organizationId, (tx) => tx.select().from(expenses).where(eq(expenses.id, workOrder!.expenseId!)));
    expect(expense?.amount).toBe("550.000000");
    expect(expense?.classification).toBe("repair");
    expect(expense?.vendorName).toBe("Electricista SA");
    expect(expense?.propertyId).toBe(propertyId);
  });

  it("rechaza pasar a presupuesto sin costo estimado", async () => {
    const { organizationId, userId, propertyId } = await setupOrgWithProperty();
    const workOrderId = await createWorkOrder(db, { organizationId, title: "Tarea", propertyId, createdBy: userId });
    await updateWorkOrderStatus(db, { organizationId, workOrderId, newStatus: "diagnosed", triggeredBy: userId });

    await expect(
      updateWorkOrderStatus(db, { organizationId, workOrderId, newStatus: "budgeted", triggeredBy: userId }),
    ).rejects.toThrow(/costo estimado/);
  });

  it("rechaza cerrar sin costo real", async () => {
    const { organizationId, userId, propertyId } = await setupOrgWithProperty();
    const workOrderId = await createWorkOrder(db, { organizationId, title: "Tarea", propertyId, createdBy: userId });
    await updateWorkOrderStatus(db, { organizationId, workOrderId, newStatus: "diagnosed", triggeredBy: userId });
    await updateWorkOrderStatus(db, { organizationId, workOrderId, newStatus: "budgeted", triggeredBy: userId, estimatedCost: "100.000000" });
    await updateWorkOrderStatus(db, { organizationId, workOrderId, newStatus: "approved", triggeredBy: userId });
    await updateWorkOrderStatus(db, { organizationId, workOrderId, newStatus: "in_execution", triggeredBy: userId });
    await updateWorkOrderStatus(db, { organizationId, workOrderId, newStatus: "controlled", triggeredBy: userId });

    await expect(
      updateWorkOrderStatus(db, { organizationId, workOrderId, newStatus: "closed", triggeredBy: userId }),
    ).rejects.toThrow(/costo real/);
  });

  it("permite rechazar un presupuesto y no permite avanzar después", async () => {
    const { organizationId, userId, propertyId } = await setupOrgWithProperty();
    const workOrderId = await createWorkOrder(db, { organizationId, title: "Tarea", propertyId, createdBy: userId });
    await updateWorkOrderStatus(db, { organizationId, workOrderId, newStatus: "diagnosed", triggeredBy: userId });
    await updateWorkOrderStatus(db, { organizationId, workOrderId, newStatus: "budgeted", triggeredBy: userId, estimatedCost: "100.000000" });
    await updateWorkOrderStatus(db, { organizationId, workOrderId, newStatus: "rejected", triggeredBy: userId });

    const [workOrder] = await withOrganizationContext(db, organizationId, (tx) => tx.select().from(workOrders).where(eq(workOrders.id, workOrderId)));
    expect(workOrder?.status).toBe("rejected");
    expect(workOrder?.ownerApproved).toBe("rejected");

    await expect(
      updateWorkOrderStatus(db, { organizationId, workOrderId, newStatus: "approved", triggeredBy: userId }),
    ).rejects.toThrow(/No se puede pasar/);
  });
});
