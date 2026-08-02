import { eq } from "drizzle-orm";
import { workOrders, vendors, expenses, recordAuditEvent, withOrganizationContext, type Database } from "@farfalla/database";

export interface UpdateWorkOrderStatusInput {
  organizationId: string;
  workOrderId: string;
  newStatus: string;
  triggeredBy: string;
  /** Requerido (o ya cargado antes) para pasar a "closed" — spec: "costo... real". */
  actualCost?: string;
  /** Requerido para pasar a "budgeted" o después — spec: "costo estimado". */
  estimatedCost?: string;
  today?: string;
}

// Flujo de la orden de trabajo (spec, sección 11.2): solicitud ->
// diagnóstico -> presupuesto -> aprobación -> ejecución -> control ->
// cierre -> gasto. "rejected" solo se alcanza desde budgeted/approved
// (el propietario no aprueba el presupuesto) — closed y rejected son
// terminales.
const VALID_TRANSITIONS: Record<string, string[]> = {
  requested: ["diagnosed"],
  diagnosed: ["budgeted"],
  budgeted: ["approved", "rejected"],
  approved: ["in_execution", "rejected"],
  in_execution: ["controlled"],
  controlled: ["closed"],
  closed: [],
  rejected: [],
};

/**
 * Avanza el estado de una orden de trabajo. Al llegar a "closed" crea
 * el gasto real (spec: "...cierre -> gasto") en `expenses`, tomando
 * clasificación, recuperabilidad al inquilino y moneda de la propia
 * orden — nunca antes de ese paso, para no confundir un costo estimado
 * con un gasto contabilizable.
 */
export async function updateWorkOrderStatus(db: Database, input: UpdateWorkOrderStatusInput): Promise<void> {
  return withOrganizationContext(db, input.organizationId, async (tx) => {
    const [workOrder] = await tx.select().from(workOrders).where(eq(workOrders.id, input.workOrderId));
    if (!workOrder) throw new Error("Orden de trabajo no encontrada");

    const allowed = VALID_TRANSITIONS[workOrder.status] ?? [];
    if (!allowed.includes(input.newStatus)) {
      throw new Error(`No se puede pasar la orden de trabajo de "${workOrder.status}" a "${input.newStatus}"`);
    }

    if (input.newStatus === "budgeted" && !input.estimatedCost && !workOrder.estimatedCost) {
      throw new Error("Hace falta un costo estimado para pasar a presupuesto");
    }

    let expenseId: string | null = null;
    if (input.newStatus === "closed") {
      const actualCost = input.actualCost ?? workOrder.actualCost;
      if (!actualCost) throw new Error("Hace falta el costo real para cerrar la orden de trabajo");
      if (!workOrder.propertyId) throw new Error("La orden de trabajo no tiene propiedad asignada — no se puede generar el gasto");

      const vendorName = workOrder.vendorId
        ? (await tx.select({ legalName: vendors.legalName }).from(vendors).where(eq(vendors.id, workOrder.vendorId)))[0]?.legalName
        : null;

      const [expense] = await tx
        .insert(expenses)
        .values({
          organizationId: input.organizationId,
          propertyId: workOrder.propertyId,
          vendorName: vendorName ?? null,
          expenseDate: input.today ?? new Date().toISOString().slice(0, 10),
          category: workOrder.title,
          classification: workOrder.classification,
          tenantRecoverability: workOrder.tenantRecoverable,
          currency: workOrder.currency,
          amount: actualCost,
        })
        .returning({ id: expenses.id });
      if (!expense) throw new Error("No se pudo generar el gasto de la orden de trabajo");
      expenseId = expense.id;
    }

    await tx
      .update(workOrders)
      .set({
        status: input.newStatus,
        estimatedCost: input.estimatedCost ?? workOrder.estimatedCost,
        actualCost: input.actualCost ?? workOrder.actualCost,
        expenseId: expenseId ?? workOrder.expenseId,
        ownerApproved: input.newStatus === "approved" ? "approved" : input.newStatus === "rejected" ? "rejected" : workOrder.ownerApproved,
        updatedBy: input.triggeredBy,
        updatedAt: new Date(),
      })
      .where(eq(workOrders.id, input.workOrderId));

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      userId: input.triggeredBy,
      entityType: "work_orders",
      entityId: input.workOrderId,
      action: "status_change",
      previousState: { status: workOrder.status },
      newState: { status: input.newStatus, expenseId },
    });
  });
}
