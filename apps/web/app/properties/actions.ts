"use server";

import { revalidatePath } from "next/cache";
import { withOrganizationContext, recordAuditEvent, properties } from "@farfalla/database";
import { getDb } from "@/lib/db";
import { getCurrentUserContext } from "@/lib/current-user";
import { hasPermission } from "@/lib/require-permission";

export async function createPropertyAction(formData: FormData) {
  const context = await getCurrentUserContext();
  if (!context) throw new Error("No autenticado");

  const allowed = await hasPermission(context, "property", "create");
  if (!allowed) throw new Error("No autorizado");

  const internalCode = String(formData.get("internalCode") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const propertyType = String(formData.get("propertyType") ?? "").trim() || "apartamento";
  if (!internalCode || !name) throw new Error("Código y nombre son obligatorios");

  const cadastralNumber = String(formData.get("cadastralNumber") ?? "").trim() || null;
  const street = String(formData.get("street") ?? "").trim() || null;
  const doorNumber = String(formData.get("doorNumber") ?? "").trim() || null;
  const neighborhood = String(formData.get("neighborhood") ?? "").trim() || null;
  const city = String(formData.get("city") ?? "").trim() || null;
  const department = String(formData.get("department") ?? "").trim() || null;
  const referenceCurrency = String(formData.get("referenceCurrency") ?? "UYU");

  await withOrganizationContext(getDb(), context.organizationId, async (tx) => {
    const [property] = await tx
      .insert(properties)
      .values({
        organizationId: context.organizationId,
        internalCode,
        name,
        propertyType,
        cadastralNumber,
        street,
        doorNumber,
        neighborhood,
        city,
        department,
        referenceCurrency,
      })
      .returning({ id: properties.id });
    if (!property) throw new Error("No se pudo crear la propiedad");

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      userId: context.userId,
      entityType: "properties",
      entityId: property.id,
      action: "create",
      newState: { internalCode, name, propertyType, street, city },
    });
  });

  revalidatePath("/properties");
}
