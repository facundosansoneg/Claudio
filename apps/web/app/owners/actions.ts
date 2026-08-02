"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { withOrganizationContext, recordAuditEvent, parties, owners } from "@farfalla/database";
import { getDb } from "@/lib/db";
import { getCurrentUserContext } from "@/lib/current-user";
import { hasPermission } from "@/lib/require-permission";

const PARTY_TYPES = ["person", "company", "trust", "government_agency", "other"] as const;

export async function createOwnerAction(formData: FormData) {
  const context = await getCurrentUserContext();
  if (!context) throw new Error("No autenticado");

  const allowed = await hasPermission(context, "owner", "create");
  if (!allowed) throw new Error("No autorizado");

  const displayName = String(formData.get("displayName") ?? "").trim();
  if (!displayName) throw new Error("El nombre es obligatorio");

  const documentType = String(formData.get("documentType") ?? "").trim() || null;
  const documentNumber = String(formData.get("documentNumber") ?? "").trim() || null;
  const partyTypeInput = String(formData.get("partyType") ?? "person");
  const partyType = PARTY_TYPES.includes(partyTypeInput as (typeof PARTY_TYPES)[number])
    ? (partyTypeInput as (typeof PARTY_TYPES)[number])
    : "person";
  const settlementType = String(formData.get("settlementType") ?? "normal") === "group"
    ? "group"
    : "normal";

  await withOrganizationContext(getDb(), context.organizationId, async (tx) => {
    const [party] = await tx
      .insert(parties)
      .values({
        organizationId: context.organizationId,
        partyType,
        displayName,
        documentType,
        documentNumber,
        isLegalPerson: partyType !== "person",
      })
      .returning({ id: parties.id });
    if (!party) throw new Error("No se pudo crear la persona/entidad");

    const [owner] = await tx
      .insert(owners)
      .values({
        organizationId: context.organizationId,
        partyId: party.id,
        settlementType,
      })
      .returning({ id: owners.id });
    if (!owner) throw new Error("No se pudo crear el propietario");

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      userId: context.userId,
      entityType: "owners",
      entityId: owner.id,
      action: "create",
      newState: { displayName, documentType, documentNumber, partyType, settlementType },
    });
  });

  revalidatePath("/owners");
}

export async function updateOwnerAction(formData: FormData) {
  const context = await getCurrentUserContext();
  if (!context) throw new Error("No autenticado");

  const allowed = await hasPermission(context, "owner", "edit");
  if (!allowed) throw new Error("No autorizado");

  const ownerId = String(formData.get("ownerId") ?? "").trim();
  const displayName = String(formData.get("displayName") ?? "").trim();
  if (!ownerId || !displayName) throw new Error("Faltan campos obligatorios");

  const documentType = String(formData.get("documentType") ?? "").trim() || null;
  const documentNumber = String(formData.get("documentNumber") ?? "").trim() || null;
  const partyTypeInput = String(formData.get("partyType") ?? "person");
  const partyType = PARTY_TYPES.includes(partyTypeInput as (typeof PARTY_TYPES)[number])
    ? (partyTypeInput as (typeof PARTY_TYPES)[number])
    : "person";
  const settlementType = String(formData.get("settlementType") ?? "normal") === "group"
    ? "group"
    : "normal";

  await withOrganizationContext(getDb(), context.organizationId, async (tx) => {
    const [owner] = await tx.select().from(owners).where(eq(owners.id, ownerId));
    if (!owner) throw new Error("Propietario no encontrado");
    const [previousParty] = await tx.select().from(parties).where(eq(parties.id, owner.partyId));

    await tx
      .update(parties)
      .set({ displayName, documentType, documentNumber, partyType, isLegalPerson: partyType !== "person", updatedBy: context.userId })
      .where(eq(parties.id, owner.partyId));

    await tx
      .update(owners)
      .set({ settlementType, updatedBy: context.userId })
      .where(eq(owners.id, ownerId));

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      userId: context.userId,
      entityType: "owners",
      entityId: ownerId,
      action: "update",
      previousState: {
        displayName: previousParty?.displayName,
        documentType: previousParty?.documentType,
        documentNumber: previousParty?.documentNumber,
        partyType: previousParty?.partyType,
        settlementType: owner.settlementType,
      },
      newState: { displayName, documentType, documentNumber, partyType, settlementType },
    });
  });

  revalidatePath("/owners");
  redirect("/owners");
}
