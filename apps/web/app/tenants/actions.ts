"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { withOrganizationContext, recordAuditEvent, parties, tenants } from "@farfalla/database";
import { getDb } from "@/lib/db";
import { getCurrentUserContext } from "@/lib/current-user";
import { hasPermission } from "@/lib/require-permission";

export async function createTenantAction(formData: FormData) {
  const context = await getCurrentUserContext();
  if (!context) throw new Error("No autenticado");

  const allowed = await hasPermission(context, "tenant", "create");
  if (!allowed) throw new Error("No autorizado");

  const displayName = String(formData.get("displayName") ?? "").trim();
  if (!displayName) throw new Error("El nombre es obligatorio");

  const documentType = String(formData.get("documentType") ?? "").trim() || null;
  const documentNumber = String(formData.get("documentNumber") ?? "").trim() || null;
  const bankReference = String(formData.get("bankReference") ?? "").trim() || null;

  await withOrganizationContext(getDb(), context.organizationId, async (tx) => {
    const [party] = await tx
      .insert(parties)
      .values({
        organizationId: context.organizationId,
        partyType: "person",
        displayName,
        documentType,
        documentNumber,
      })
      .returning({ id: parties.id });
    if (!party) throw new Error("No se pudo crear la persona");

    const [tenant] = await tx
      .insert(tenants)
      .values({ organizationId: context.organizationId, partyId: party.id, bankReference })
      .returning({ id: tenants.id });
    if (!tenant) throw new Error("No se pudo crear el inquilino");

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      userId: context.userId,
      entityType: "tenants",
      entityId: tenant.id,
      action: "create",
      newState: { displayName, documentType, documentNumber },
    });
  });

  revalidatePath("/tenants");
}

export async function updateTenantAction(formData: FormData) {
  const context = await getCurrentUserContext();
  if (!context) throw new Error("No autenticado");

  const allowed = await hasPermission(context, "tenant", "edit");
  if (!allowed) throw new Error("No autorizado");

  const tenantId = String(formData.get("tenantId") ?? "").trim();
  const displayName = String(formData.get("displayName") ?? "").trim();
  if (!tenantId || !displayName) throw new Error("Faltan campos obligatorios");

  const documentType = String(formData.get("documentType") ?? "").trim() || null;
  const documentNumber = String(formData.get("documentNumber") ?? "").trim() || null;
  const bankReference = String(formData.get("bankReference") ?? "").trim() || null;

  await withOrganizationContext(getDb(), context.organizationId, async (tx) => {
    const [tenant] = await tx.select().from(tenants).where(eq(tenants.id, tenantId));
    if (!tenant) throw new Error("Inquilino no encontrado");
    const [previousParty] = await tx.select().from(parties).where(eq(parties.id, tenant.partyId));

    await tx
      .update(parties)
      .set({ displayName, documentType, documentNumber, updatedBy: context.userId })
      .where(eq(parties.id, tenant.partyId));

    await tx
      .update(tenants)
      .set({ bankReference, updatedBy: context.userId })
      .where(eq(tenants.id, tenantId));

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      userId: context.userId,
      entityType: "tenants",
      entityId: tenantId,
      action: "update",
      previousState: {
        displayName: previousParty?.displayName,
        documentType: previousParty?.documentType,
        documentNumber: previousParty?.documentNumber,
        bankReference: tenant.bankReference,
      },
      newState: { displayName, documentType, documentNumber, bankReference },
    });
  });

  revalidatePath("/tenants");
  redirect("/tenants");
}
