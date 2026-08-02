"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createWorkOrder, updateWorkOrderStatus } from "@farfalla/domain";
import { getDb } from "@/lib/db";
import { getCurrentUserContext } from "@/lib/current-user";
import { hasPermission } from "@/lib/require-permission";

export async function createWorkOrderAction(formData: FormData) {
  const context = await getCurrentUserContext();
  if (!context) throw new Error("No autenticado");

  const allowed = await hasPermission(context, "work_order", "create");
  if (!allowed) throw new Error("No autorizado");

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const propertyId = String(formData.get("propertyId") ?? "").trim() || null;
  const vendorId = String(formData.get("vendorId") ?? "").trim() || null;
  const classification = String(formData.get("classification") ?? "opex");
  const tenantRecoverable = String(formData.get("tenantRecoverable") ?? "none");
  const currency = String(formData.get("currency") ?? "UYU");

  await createWorkOrder(getDb(), {
    organizationId: context.organizationId,
    title,
    description,
    propertyId,
    vendorId,
    classification,
    tenantRecoverable,
    currency,
    createdBy: context.userId,
  });

  revalidatePath("/work-orders");
}

export async function updateWorkOrderStatusAction(formData: FormData) {
  const context = await getCurrentUserContext();
  if (!context) throw new Error("No autenticado");

  const allowed = await hasPermission(context, "work_order", "edit");
  if (!allowed) throw new Error("No autorizado");

  const workOrderId = String(formData.get("workOrderId") ?? "").trim();
  const newStatus = String(formData.get("newStatus") ?? "").trim();
  const estimatedCost = String(formData.get("estimatedCost") ?? "").trim() || undefined;
  const actualCost = String(formData.get("actualCost") ?? "").trim() || undefined;
  if (!workOrderId || !newStatus) throw new Error("Faltan campos obligatorios");

  try {
    await updateWorkOrderStatus(getDb(), {
      organizationId: context.organizationId,
      workOrderId,
      newStatus,
      estimatedCost,
      actualCost,
      triggeredBy: context.userId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo actualizar la orden de trabajo";
    redirect(`/work-orders?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/work-orders");
}
