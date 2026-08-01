import { recordAuditEvent, invoices, withOrganizationContext, type Database } from "@farfalla/database";

export interface CreateManualInvoiceDraftInput {
  organizationId: string;
  seriesId: string;
  documentType: string;
  ownerId?: string | null;
  tenantId?: string | null;
  description: string;
  currency: string;
  amount: string;
  discountPercentage?: string | null;
  hasVat: boolean;
  triggeredBy: string;
}

export interface CreateManualInvoiceDraftResult {
  invoiceId: string;
}

/**
 * Alta de una factura manual en borrador (spec, INV-001). Sin número
 * todavía — el número sale de la serie recién al confirmar
 * (`confirmManualInvoice`), para no dejar huecos ni duplicados en la
 * numeración si un borrador se abandona sin confirmar.
 */
export async function createManualInvoiceDraft(
  db: Database,
  input: CreateManualInvoiceDraftInput,
): Promise<CreateManualInvoiceDraftResult> {
  return withOrganizationContext(db, input.organizationId, async (tx) => {
    const [invoice] = await tx
      .insert(invoices)
      .values({
        organizationId: input.organizationId,
        seriesId: input.seriesId,
        documentType: input.documentType,
        ownerId: input.ownerId ?? null,
        tenantId: input.tenantId ?? null,
        description: input.description,
        currency: input.currency,
        amount: input.amount,
        discountPercentage: input.discountPercentage ?? null,
        hasVat: input.hasVat,
        status: "draft",
        createdBy: input.triggeredBy,
      })
      .returning({ id: invoices.id });
    if (!invoice) throw new Error("No se pudo crear la factura");

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      userId: input.triggeredBy,
      entityType: "invoices",
      entityId: invoice.id,
      action: "create",
      newState: { ...input, organizationId: undefined, triggeredBy: undefined },
    });

    return { invoiceId: invoice.id };
  });
}
