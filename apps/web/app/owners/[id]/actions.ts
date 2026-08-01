"use server";

import { revalidatePath } from "next/cache";
import { withOrganizationContext, recordAuditEvent, taxProfiles } from "@farfalla/database";
import { getDb } from "@/lib/db";
import { getCurrentUserContext } from "@/lib/current-user";
import { hasPermission } from "@/lib/require-permission";

export async function createTaxProfileAction(formData: FormData) {
  const context = await getCurrentUserContext();
  if (!context) throw new Error("No autenticado");

  const allowed = await hasPermission(context, "tax_profile", "create");
  if (!allowed) throw new Error("No autorizado");

  const ownerId = String(formData.get("ownerId") ?? "").trim();
  const taxType = String(formData.get("taxType") ?? "irpf");
  const percentage = String(formData.get("percentage") ?? "").trim();
  const validFrom = String(formData.get("validFrom") ?? "").trim();
  const taxResidency = String(formData.get("taxResidency") ?? "").trim() || null;
  const source = String(formData.get("source") ?? "").trim() || null;

  if (!ownerId || !percentage || !validFrom) throw new Error("Faltan campos obligatorios");

  await withOrganizationContext(getDb(), context.organizationId, async (tx) => {
    const [profile] = await tx
      .insert(taxProfiles)
      .values({
        organizationId: context.organizationId,
        ownerId,
        taxType,
        percentage,
        validFrom,
        taxResidency,
        source,
      })
      .returning({ id: taxProfiles.id });
    if (!profile) throw new Error("No se pudo crear el perfil fiscal");

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      userId: context.userId,
      entityType: "tax_profiles",
      entityId: profile.id,
      action: "create",
      newState: { ownerId, taxType, percentage, validFrom },
    });
  });

  revalidatePath(`/owners/${ownerId}`);
}
