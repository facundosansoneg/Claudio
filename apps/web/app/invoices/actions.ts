"use server";

import { revalidatePath } from "next/cache";
import { withOrganizationContext, recordAuditEvent, invoiceSeries } from "@farfalla/database";
import { createManualInvoiceDraft, confirmManualInvoice } from "@farfalla/domain";
import { getDb } from "@/lib/db";
import { getCurrentUserContext } from "@/lib/current-user";
import { hasPermission } from "@/lib/require-permission";

export async function createInvoiceSeriesAction(formData: FormData) {
  const context = await getCurrentUserContext();
  if (!context) throw new Error("No autenticado");

  const allowed = await hasPermission(context, "invoice_series", "create");
  if (!allowed) throw new Error("No autorizado");

  const code = String(formData.get("code") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const prefix = String(formData.get("prefix") ?? "").trim();

  if (!code || !name || !prefix) throw new Error("Faltan campos obligatorios");

  await withOrganizationContext(getDb(), context.organizationId, async (tx) => {
    const [series] = await tx
      .insert(invoiceSeries)
      .values({ organizationId: context.organizationId, code, name, prefix, createdBy: context.userId })
      .returning({ id: invoiceSeries.id });
    if (!series) throw new Error("No se pudo crear la serie");

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      userId: context.userId,
      entityType: "invoice_series",
      entityId: series.id,
      action: "create",
      newState: { code, name, prefix },
    });
  });

  revalidatePath("/invoices");
}

export async function createManualInvoiceDraftAction(formData: FormData) {
  const context = await getCurrentUserContext();
  if (!context) throw new Error("No autenticado");

  const allowed = await hasPermission(context, "invoice", "create");
  if (!allowed) throw new Error("No autorizado");

  const seriesId = String(formData.get("seriesId") ?? "").trim();
  const documentType = String(formData.get("documentType") ?? "").trim();
  const ownerId = String(formData.get("ownerId") ?? "").trim() || null;
  const tenantId = String(formData.get("tenantId") ?? "").trim() || null;
  const description = String(formData.get("description") ?? "").trim();
  const currency = String(formData.get("currency") ?? "UYU");
  const amount = String(formData.get("amount") ?? "").trim();
  const discountPercentage = String(formData.get("discountPercentage") ?? "").trim() || null;
  const hasVat = formData.get("hasVat") === "on";

  if (!seriesId || !documentType || !description || !amount) throw new Error("Faltan campos obligatorios");

  await createManualInvoiceDraft(getDb(), {
    organizationId: context.organizationId,
    seriesId,
    documentType,
    ownerId,
    tenantId,
    description,
    currency,
    amount,
    discountPercentage,
    hasVat,
    triggeredBy: context.userId,
  });

  revalidatePath("/invoices");
}

export async function confirmManualInvoiceAction(formData: FormData) {
  const context = await getCurrentUserContext();
  if (!context) throw new Error("No autenticado");

  const allowed = await hasPermission(context, "invoice", "confirm");
  if (!allowed) throw new Error("No autorizado");

  const invoiceId = String(formData.get("invoiceId") ?? "").trim();
  const issueDate = String(formData.get("issueDate") ?? "").trim();
  if (!invoiceId || !issueDate) throw new Error("Faltan campos obligatorios");

  await confirmManualInvoice(getDb(), {
    organizationId: context.organizationId,
    invoiceId,
    issueDate,
    triggeredBy: context.userId,
  });

  revalidatePath("/invoices");
}
