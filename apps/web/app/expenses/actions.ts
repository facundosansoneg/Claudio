"use server";

import { revalidatePath } from "next/cache";
import { withOrganizationContext, recordAuditEvent, expenses, allocationRules } from "@farfalla/database";
import { runExpenseAllocation } from "@farfalla/domain";
import { getDb } from "@/lib/db";
import { getCurrentUserContext } from "@/lib/current-user";
import { hasPermission } from "@/lib/require-permission";

export async function createExpenseAction(formData: FormData) {
  const context = await getCurrentUserContext();
  if (!context) throw new Error("No autenticado");

  const allowed = await hasPermission(context, "expense", "create");
  if (!allowed) throw new Error("No autorizado");

  const propertyId = String(formData.get("propertyId") ?? "").trim();
  const vendorName = String(formData.get("vendorName") ?? "").trim() || null;
  const documentReference = String(formData.get("documentReference") ?? "").trim() || null;
  const expenseDate = String(formData.get("expenseDate") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const classification = String(formData.get("classification") ?? "opex");
  const tenantRecoverability = String(formData.get("tenantRecoverability") ?? "none");
  const currency = String(formData.get("currency") ?? "UYU");
  const amount = String(formData.get("amount") ?? "").trim();

  if (!propertyId || !expenseDate || !category || !amount) throw new Error("Faltan campos obligatorios");

  await withOrganizationContext(getDb(), context.organizationId, async (tx) => {
    const [expense] = await tx
      .insert(expenses)
      .values({
        organizationId: context.organizationId,
        propertyId,
        vendorName,
        documentReference,
        expenseDate,
        category,
        classification,
        tenantRecoverability,
        currency,
        amount,
        createdBy: context.userId,
      })
      .returning({ id: expenses.id });
    if (!expense) throw new Error("No se pudo crear el gasto");

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      userId: context.userId,
      entityType: "expenses",
      entityId: expense.id,
      action: "create",
      newState: { propertyId, category, classification, currency, amount },
    });
  });

  revalidatePath("/expenses");
}

export async function createAllocationRuleAction(formData: FormData) {
  const context = await getCurrentUserContext();
  if (!context) throw new Error("No autenticado");

  const allowed = await hasPermission(context, "allocation_rule", "create");
  if (!allowed) throw new Error("No autorizado");

  const propertyId = String(formData.get("propertyId") ?? "").trim() || null;
  const category = String(formData.get("category") ?? "").trim() || null;
  const driverType = String(formData.get("driverType") ?? "").trim();
  const ownerIdForDirect = String(formData.get("directOwnerId") ?? "").trim();
  const validFrom = String(formData.get("validFrom") ?? "").trim();

  if (!driverType || !validFrom) throw new Error("Faltan campos obligatorios");
  if (driverType === "direct" && !ownerIdForDirect) {
    throw new Error("El driver 'direct' requiere elegir un propietario");
  }

  await withOrganizationContext(getDb(), context.organizationId, async (tx) => {
    const [rule] = await tx
      .insert(allocationRules)
      .values({
        organizationId: context.organizationId,
        propertyId,
        category,
        driverType,
        driverConfig: driverType === "direct" ? { ownerId: ownerIdForDirect } : {},
        validFrom,
        createdBy: context.userId,
      })
      .returning({ id: allocationRules.id });
    if (!rule) throw new Error("No se pudo crear la regla de distribución");

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      userId: context.userId,
      entityType: "allocation_rules",
      entityId: rule.id,
      action: "create",
      newState: { propertyId, category, driverType, validFrom },
    });
  });

  revalidatePath("/expenses");
}

export async function allocateExpenseAction(formData: FormData) {
  const context = await getCurrentUserContext();
  if (!context) throw new Error("No autenticado");

  const allowed = await hasPermission(context, "expense", "allocate");
  if (!allowed) throw new Error("No autorizado");

  const expenseId = String(formData.get("expenseId") ?? "").trim();
  if (!expenseId) throw new Error("Falta el gasto a distribuir");

  await runExpenseAllocation(getDb(), {
    organizationId: context.organizationId,
    expenseId,
    triggeredBy: context.userId,
  });

  revalidatePath("/expenses");
}
