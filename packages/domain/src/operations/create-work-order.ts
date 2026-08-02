import { workOrders, recordAuditEvent, withOrganizationContext, type Database } from "@farfalla/database";

export interface CreateWorkOrderInput {
  organizationId: string;
  title: string;
  description?: string | null;
  propertyId?: string | null;
  unitId?: string | null;
  vendorId?: string | null;
  classification?: string;
  tenantRecoverable?: string;
  currency?: string;
  createdBy: string;
}

/**
 * Alta de orden de trabajo (spec, sección 11.2), arranca en "requested"
 * — la máquina de estados del flujo solicitud→...→gasto vive en
 * updateWorkOrderStatus.
 */
export async function createWorkOrder(db: Database, input: CreateWorkOrderInput): Promise<string> {
  if (!input.title.trim()) {
    throw new Error("El título es obligatorio");
  }

  return withOrganizationContext(db, input.organizationId, async (tx) => {
    const [workOrder] = await tx
      .insert(workOrders)
      .values({
        organizationId: input.organizationId,
        title: input.title,
        description: input.description ?? null,
        propertyId: input.propertyId ?? null,
        unitId: input.unitId ?? null,
        vendorId: input.vendorId ?? null,
        classification: input.classification ?? "opex",
        tenantRecoverable: input.tenantRecoverable ?? "none",
        currency: input.currency ?? "UYU",
        createdBy: input.createdBy,
        updatedBy: input.createdBy,
      })
      .returning({ id: workOrders.id });
    if (!workOrder) throw new Error("No se pudo crear la orden de trabajo");

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      userId: input.createdBy,
      entityType: "work_orders",
      entityId: workOrder.id,
      action: "create",
      newState: { title: input.title, propertyId: input.propertyId ?? null },
    });

    return workOrder.id;
  });
}
