"use server";

import { revalidatePath } from "next/cache";
import {
  withOrganizationContext,
  recordAuditEvent,
  commissionConcepts,
  commissionConceptOverrides,
} from "@farfalla/database";
import { getDb } from "@/lib/db";
import { getCurrentUserContext } from "@/lib/current-user";
import { hasPermission } from "@/lib/require-permission";

export async function createCommissionConceptAction(formData: FormData) {
  const context = await getCurrentUserContext();
  if (!context) throw new Error("No autenticado");

  const allowed = await hasPermission(context, "commission_concept", "create");
  if (!allowed) throw new Error("No autorizado");

  const code = String(formData.get("code") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const paymentDestination = String(formData.get("paymentDestination") ?? "administration");
  const conceptType = String(formData.get("conceptType") ?? "owner");
  const description = String(formData.get("description") ?? "").trim() || null;
  const percentage = String(formData.get("percentage") ?? "").trim();
  const minAmountInput = String(formData.get("minAmount") ?? "").trim();
  const maxAmountInput = String(formData.get("maxAmount") ?? "").trim();
  const hasVat = formData.get("hasVat") === "on";
  const hasCommissionTax = formData.get("hasCommissionTax") === "on";
  const validFrom = String(formData.get("validFrom") ?? "").trim();

  if (!code || !name || !percentage || !validFrom) throw new Error("Faltan campos obligatorios");

  await withOrganizationContext(getDb(), context.organizationId, async (tx) => {
    const [concept] = await tx
      .insert(commissionConcepts)
      .values({
        organizationId: context.organizationId,
        code,
        name,
        paymentDestination,
        conceptType,
        description,
        percentage,
        minAmount: minAmountInput || null,
        maxAmount: maxAmountInput || null,
        hasVat,
        hasCommissionTax,
        validFrom,
        createdBy: context.userId,
      })
      .returning({ id: commissionConcepts.id });
    if (!concept) throw new Error("No se pudo crear el concepto de comisión");

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      userId: context.userId,
      entityType: "commission_concepts",
      entityId: concept.id,
      action: "create",
      newState: { code, name, paymentDestination, conceptType, percentage, hasVat, hasCommissionTax, validFrom },
    });
  });

  revalidatePath("/commission-concepts");
}

export async function createCommissionConceptOverrideAction(formData: FormData) {
  const context = await getCurrentUserContext();
  if (!context) throw new Error("No autenticado");

  const allowed = await hasPermission(context, "commission_concept", "override");
  if (!allowed) throw new Error("No autorizado");

  const commissionConceptId = String(formData.get("commissionConceptId") ?? "").trim();
  const ownerId = String(formData.get("ownerId") ?? "").trim();
  const percentageInput = String(formData.get("percentage") ?? "").trim();
  const minAmountInput = String(formData.get("minAmount") ?? "").trim();
  const maxAmountInput = String(formData.get("maxAmount") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const validFrom = String(formData.get("validFrom") ?? "").trim();

  if (!commissionConceptId || !ownerId || !validFrom) throw new Error("Faltan campos obligatorios");

  await withOrganizationContext(getDb(), context.organizationId, async (tx) => {
    const [override] = await tx
      .insert(commissionConceptOverrides)
      .values({
        organizationId: context.organizationId,
        commissionConceptId,
        ownerId,
        percentage: percentageInput || null,
        minAmount: minAmountInput || null,
        maxAmount: maxAmountInput || null,
        description,
        validFrom,
        createdBy: context.userId,
      })
      .returning({ id: commissionConceptOverrides.id });
    if (!override) throw new Error("No se pudo crear el override");

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      userId: context.userId,
      entityType: "commission_concept_overrides",
      entityId: override.id,
      action: "create",
      newState: { commissionConceptId, ownerId, percentageInput, minAmountInput, maxAmountInput, validFrom },
    });
  });

  revalidatePath("/commission-concepts");
}
