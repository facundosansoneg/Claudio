"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  withOrganizationContext,
  recordAuditEvent,
  ownershipInterests,
  type Database,
} from "@farfalla/database";
import { validateOwnershipInterests, type OwnershipInterestRecord } from "@farfalla/domain";
import { getDb } from "@/lib/db";
import { getCurrentUserContext } from "@/lib/current-user";
import { hasPermission } from "@/lib/require-permission";

export async function createOwnershipInterestAction(formData: FormData) {
  const context = await getCurrentUserContext();
  if (!context) throw new Error("No autenticado");

  const propertyId = String(formData.get("propertyId") ?? "").trim();
  const allowed = await hasPermission(context, "ownership_interest", "create");
  if (!allowed) throw new Error("No autorizado");

  const ownerId = String(formData.get("ownerId") ?? "").trim();
  const legalPercentage = String(formData.get("legalPercentage") ?? "").trim();
  const economicPercentage = String(formData.get("economicPercentage") ?? "").trim();
  const rentDistributionPercentage = String(formData.get("rentDistributionPercentage") ?? "").trim();
  const taxContributionPercentage = String(formData.get("taxContributionPercentage") ?? "").trim();
  const validFrom = String(formData.get("validFrom") ?? "").trim();
  const validToInput = String(formData.get("validTo") ?? "").trim();
  const validTo = validToInput || null;

  if (
    !propertyId ||
    !ownerId ||
    !legalPercentage ||
    !economicPercentage ||
    !rentDistributionPercentage ||
    !taxContributionPercentage ||
    !validFrom
  ) {
    redirect(`/properties/${propertyId}?error=${encodeURIComponent("Faltan campos obligatorios")}`);
  }

  const candidate: OwnershipInterestRecord = {
    ownerId,
    legalPercentage,
    economicPercentage,
    rentDistributionPercentage,
    taxContributionPercentage,
    validFrom,
    validTo,
  };

  await withOrganizationContext(getDb(), context.organizationId, async (tx: Database) => {
    const existing = await tx
      .select()
      .from(ownershipInterests)
      .where(eq(ownershipInterests.propertyId, propertyId));

    const existingRecords: OwnershipInterestRecord[] = existing.map((row) => ({
      ownerId: row.ownerId,
      legalPercentage: row.legalPercentage,
      economicPercentage: row.economicPercentage,
      rentDistributionPercentage: row.rentDistributionPercentage,
      taxContributionPercentage: row.taxContributionPercentage,
      validFrom: row.validFrom,
      validTo: row.validTo,
    }));

    const result = validateOwnershipInterests([...existingRecords, candidate]);
    if (!result.valid) {
      const messages = result.errors.map((error) =>
        error.type === "dimension_not_100"
          ? `${error.dimension} suma ${error.total}% (debe ser 100%) el ${error.date}`
          : `Sin cobertura de propietarios el ${error.date}`,
      );
      redirect(`/properties/${propertyId}?error=${encodeURIComponent(messages.join("; "))}`);
    }

    const [inserted] = await tx
      .insert(ownershipInterests)
      .values({ organizationId: context.organizationId, propertyId, ...candidate })
      .returning({ id: ownershipInterests.id });
    if (!inserted) throw new Error("No se pudo crear la participación");

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      userId: context.userId,
      entityType: "ownership_interests",
      entityId: inserted.id,
      action: "create",
      newState: candidate,
    });
  });

  revalidatePath(`/properties/${propertyId}`);
  redirect(`/properties/${propertyId}`);
}
