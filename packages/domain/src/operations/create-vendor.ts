import { vendors, recordAuditEvent, withOrganizationContext, type Database } from "@farfalla/database";

export interface CreateVendorInput {
  organizationId: string;
  legalName: string;
  taxId?: string | null;
  category?: string | null;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  bankAccountInfo?: string | null;
  rating?: number | null;
  insuranceReference?: string | null;
  insuranceExpiryDate?: string | null;
  createdBy: string;
}

export async function createVendor(db: Database, input: CreateVendorInput): Promise<string> {
  if (!input.legalName.trim()) {
    throw new Error("La razón social es obligatoria");
  }
  if (input.rating !== null && input.rating !== undefined && (input.rating < 1 || input.rating > 5)) {
    throw new Error("La evaluación debe estar entre 1 y 5");
  }

  return withOrganizationContext(db, input.organizationId, async (tx) => {
    const [vendor] = await tx
      .insert(vendors)
      .values({
        organizationId: input.organizationId,
        legalName: input.legalName,
        taxId: input.taxId ?? null,
        category: input.category ?? null,
        contactName: input.contactName ?? null,
        email: input.email ?? null,
        phone: input.phone ?? null,
        bankAccountInfo: input.bankAccountInfo ?? null,
        rating: input.rating ?? null,
        insuranceReference: input.insuranceReference ?? null,
        insuranceExpiryDate: input.insuranceExpiryDate ?? null,
        createdBy: input.createdBy,
        updatedBy: input.createdBy,
      })
      .returning({ id: vendors.id });
    if (!vendor) throw new Error("No se pudo crear el proveedor");

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      userId: input.createdBy,
      entityType: "vendors",
      entityId: vendor.id,
      action: "create",
      newState: { legalName: input.legalName, category: input.category ?? null },
    });

    return vendor.id;
  });
}
