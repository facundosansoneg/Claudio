"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
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

export async function updatePropertyAction(formData: FormData) {
  const context = await getCurrentUserContext();
  if (!context) throw new Error("No autenticado");

  const allowed = await hasPermission(context, "property", "edit");
  if (!allowed) throw new Error("No autorizado");

  const propertyId = String(formData.get("propertyId") ?? "").trim();
  const internalCode = String(formData.get("internalCode") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const propertyType = String(formData.get("propertyType") ?? "").trim() || "apartamento";
  if (!propertyId || !internalCode || !name) throw new Error("Faltan campos obligatorios");

  const cadastralNumber = String(formData.get("cadastralNumber") ?? "").trim() || null;
  const street = String(formData.get("street") ?? "").trim() || null;
  const doorNumber = String(formData.get("doorNumber") ?? "").trim() || null;
  const neighborhood = String(formData.get("neighborhood") ?? "").trim() || null;
  const city = String(formData.get("city") ?? "").trim() || null;
  const department = String(formData.get("department") ?? "").trim() || null;
  const referenceCurrency = String(formData.get("referenceCurrency") ?? "UYU");

  await withOrganizationContext(getDb(), context.organizationId, async (tx) => {
    const [previous] = await tx.select().from(properties).where(eq(properties.id, propertyId));
    if (!previous) throw new Error("Propiedad no encontrada");

    await tx
      .update(properties)
      .set({
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
        updatedBy: context.userId,
      })
      .where(eq(properties.id, propertyId));

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      userId: context.userId,
      entityType: "properties",
      entityId: propertyId,
      action: "update",
      previousState: {
        internalCode: previous.internalCode,
        name: previous.name,
        propertyType: previous.propertyType,
        street: previous.street,
        city: previous.city,
      },
      newState: { internalCode, name, propertyType, street, city },
    });
  });

  revalidatePath("/properties");
  redirect("/properties");
}
