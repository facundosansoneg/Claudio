import { eq, sql } from "drizzle-orm";
import {
  invoices,
  invoiceSeries,
  recordAuditEvent,
  withOrganizationContext,
  type Database,
} from "@farfalla/database";
import { addMoney, applyPercentage, subtractMoney } from "../decimal";
import { resolveVatRate } from "../accounting/resolve-vat-rate";

export interface ConfirmManualInvoiceInput {
  organizationId: string;
  invoiceId: string;
  issueDate: string;
  triggeredBy: string;
}

export interface ConfirmManualInvoiceResult {
  invoiceId: string;
  number: string;
  vatAmount: string;
  totalAmount: string;
}

/**
 * Confirma una factura manual en borrador (spec, INV-001, paso
 * "Confirmación"): le asigna el número secuencial de su serie
 * (incremento atómico, nunca dos facturas comparten número — CLAUDE.md
 * regla 6) y calcula descuento/IVA/total. Una vez confirmada queda
 * inmutable (CLAUDE.md regla 3) — no hay UpdateInvoice, solo
 * anulación/nota de crédito en un tramo posterior (INV-003).
 */
export async function confirmManualInvoice(
  db: Database,
  input: ConfirmManualInvoiceInput,
): Promise<ConfirmManualInvoiceResult> {
  return withOrganizationContext(db, input.organizationId, async (tx) => {
    const [invoice] = await tx.select().from(invoices).where(eq(invoices.id, input.invoiceId));
    if (!invoice) throw new Error("Factura no encontrada");
    if (invoice.status !== "draft") throw new Error("Solo se pueden confirmar facturas en borrador");

    const [series] = await tx
      .update(invoiceSeries)
      .set({ nextNumber: sql`${invoiceSeries.nextNumber} + 1` })
      .where(eq(invoiceSeries.id, invoice.seriesId))
      .returning({ prefix: invoiceSeries.prefix, nextNumber: invoiceSeries.nextNumber, status: invoiceSeries.status });
    if (!series) throw new Error("Serie de numeración no encontrada");
    if (series.status !== "active") throw new Error("La serie de numeración no está activa");

    const assignedNumber = series.nextNumber - 1;
    const number = `${series.prefix}-${String(assignedNumber).padStart(6, "0")}`;

    const discountAmount = invoice.discountPercentage
      ? applyPercentage(invoice.amount, invoice.discountPercentage)
      : "0.000000";
    const netAfterDiscount = subtractMoney(invoice.amount, discountAmount);

    let vatPercentage: string | null = null;
    let vatAmount = "0.000000";
    if (invoice.hasVat) {
      vatPercentage = await resolveVatRate(tx, input.organizationId, input.issueDate);
      vatAmount = applyPercentage(netAfterDiscount, vatPercentage);
    }
    const totalAmount = addMoney(netAfterDiscount, vatAmount);

    await tx
      .update(invoices)
      .set({
        number,
        status: "confirmed",
        issueDate: input.issueDate,
        vatPercentage,
        vatAmount,
        totalAmount,
        confirmedAt: new Date(),
        confirmedBy: input.triggeredBy,
      })
      .where(eq(invoices.id, invoice.id));

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      userId: input.triggeredBy,
      entityType: "invoices",
      entityId: invoice.id,
      action: "confirm",
      newState: { number, issueDate: input.issueDate, vatAmount, totalAmount },
    });

    return { invoiceId: invoice.id, number, vatAmount, totalAmount };
  });
}
