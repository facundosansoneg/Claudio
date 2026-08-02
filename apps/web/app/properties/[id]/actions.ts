"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  withOrganizationContext,
  recordAuditEvent,
  ownershipInterests,
  taxExemptions,
  valuations,
  type Database,
} from "@farfalla/database";
import { validateOwnershipInterests, estimateMarketValue, type OwnershipInterestRecord } from "@farfalla/domain";
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

export async function createTaxExemptionAction(formData: FormData) {
  const context = await getCurrentUserContext();
  if (!context) throw new Error("No autenticado");

  const allowed = await hasPermission(context, "tax_exemption", "create");
  if (!allowed) throw new Error("No autorizado");

  const propertyId = String(formData.get("propertyId") ?? "").trim();
  const taxType = String(formData.get("taxType") ?? "irpf");
  const reason = String(formData.get("reason") ?? "").trim();
  const documentReference = String(formData.get("documentReference") ?? "").trim() || null;
  const validFrom = String(formData.get("validFrom") ?? "").trim();
  const validToInput = String(formData.get("validTo") ?? "").trim();
  const validTo = validToInput || null;

  if (!propertyId || !reason || !validFrom) throw new Error("Faltan campos obligatorios");

  await withOrganizationContext(getDb(), context.organizationId, async (tx) => {
    const [exemption] = await tx
      .insert(taxExemptions)
      .values({
        organizationId: context.organizationId,
        propertyId,
        taxType,
        reason,
        documentReference,
        validFrom,
        validTo,
        createdBy: context.userId,
      })
      .returning({ id: taxExemptions.id });
    if (!exemption) throw new Error("No se pudo crear la exoneración");

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      userId: context.userId,
      entityType: "tax_exemptions",
      entityId: exemption.id,
      action: "create",
      newState: { propertyId, taxType, reason, documentReference, validFrom, validTo },
    });
  });

  revalidatePath(`/properties/${propertyId}`);
  redirect(`/properties/${propertyId}`);
}

export async function createValuationAction(formData: FormData) {
  const context = await getCurrentUserContext();
  if (!context) throw new Error("No autenticado");

  const allowed = await hasPermission(context, "valuation", "create");
  if (!allowed) throw new Error("No autorizado");

  const propertyId = String(formData.get("propertyId") ?? "").trim();
  const valuationDate = String(formData.get("valuationDate") ?? "").trim();
  const value = String(formData.get("value") ?? "").trim();
  const currency = String(formData.get("currency") ?? "USD");
  const source = String(formData.get("source") ?? "").trim() || null;
  const method = String(formData.get("method") ?? "").trim() || null;
  const appraiser = String(formData.get("appraiser") ?? "").trim() || null;
  const confidence = String(formData.get("confidence") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!propertyId || !valuationDate || !value) throw new Error("Faltan campos obligatorios");

  await withOrganizationContext(getDb(), context.organizationId, async (tx) => {
    const [valuation] = await tx
      .insert(valuations)
      .values({
        organizationId: context.organizationId,
        propertyId,
        valuationDate,
        value,
        currency,
        source,
        method,
        appraiser,
        confidence,
        notes,
        createdBy: context.userId,
      })
      .returning({ id: valuations.id });
    if (!valuation) throw new Error("No se pudo registrar la valoración");

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      userId: context.userId,
      entityType: "valuations",
      entityId: valuation.id,
      action: "create",
      newState: { propertyId, valuationDate, value, currency, source, method },
    });
  });

  revalidatePath(`/properties/${propertyId}`);
  redirect(`/properties/${propertyId}`);
}

export async function createMarketEstimateAction(formData: FormData) {
  const context = await getCurrentUserContext();
  if (!context) throw new Error("No autenticado");

  const allowed = await hasPermission(context, "market_estimate", "create");
  if (!allowed) throw new Error("No autorizado");

  const propertyId = String(formData.get("propertyId") ?? "").trim();
  const estimateDate = String(formData.get("estimateDate") ?? "").trim();
  const adjustmentsNotes = String(formData.get("adjustmentsNotes") ?? "").trim() || null;

  // Comparables seleccionados: cada fila del listado manda use_<id>
  // (checkbox) y weight_<id> (peso 0-100 dentro de su grupo venta/alquiler).
  const comparables: { comparableId: string; weight: string }[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("use_")) continue;
    const comparableId = key.slice("use_".length);
    const weight = String(formData.get(`weight_${comparableId}`) ?? "").trim();
    if (value === "on" && weight) comparables.push({ comparableId, weight });
  }

  if (!propertyId || !estimateDate) {
    redirect(`/properties/${propertyId}?error=${encodeURIComponent("Faltan campos obligatorios")}`);
  }
  if (comparables.length === 0) {
    redirect(`/properties/${propertyId}?error=${encodeURIComponent("Elegí al menos un comparable con su peso")}`);
  }

  try {
    await estimateMarketValue(getDb(), {
      organizationId: context.organizationId,
      propertyId,
      estimateDate,
      comparables,
      adjustmentsNotes,
      triggeredBy: context.userId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo generar la estimación";
    redirect(`/properties/${propertyId}?error=${encodeURIComponent(message)}`);
  }

  revalidatePath(`/properties/${propertyId}`);
  redirect(`/properties/${propertyId}`);
}
