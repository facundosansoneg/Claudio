import { and, eq } from "drizzle-orm";
import {
  charges,
  journalEntries,
  journalLines,
  paymentAllocations,
  payments,
  receipts,
  recordAuditEvent,
  withOrganizationContext,
  type Database,
} from "@farfalla/database";
import { addMoney, compareMoney } from "../decimal";

export interface ReverseReceiptInput {
  organizationId: string;
  receiptId: string;
  reason: string;
  triggeredBy: string;
}

export interface ReverseReceiptResult {
  receiptId: string;
}

/**
 * Anulación de recibo (spec, PAY-004/ReverseReceipt). No borra ninguna
 * fila (CLAUDE.md regla 3): marca el recibo y el pago como "voided" con
 * motivo obligatorio, genera un asiento de reversión enlazado al
 * original (débito/crédito invertidos) y devuelve el saldo de los
 * cargos afectados a pendiente/parcial según corresponda.
 */
export async function reverseReceipt(
  db: Database,
  input: ReverseReceiptInput,
): Promise<ReverseReceiptResult> {
  if (!input.reason.trim()) throw new Error("El motivo de anulación es obligatorio");

  return withOrganizationContext(db, input.organizationId, async (tx) => {
    const [receipt] = await tx.select().from(receipts).where(eq(receipts.id, input.receiptId));
    if (!receipt) throw new Error("Recibo no encontrado");
    if (receipt.status === "voided") throw new Error("El recibo ya está anulado");

    const [payment] = await tx.select().from(payments).where(eq(payments.id, receipt.paymentId));
    if (!payment) throw new Error("Pago del recibo no encontrado");

    const allocations = await tx
      .select()
      .from(paymentAllocations)
      .where(eq(paymentAllocations.paymentId, payment.id));

    for (const allocation of allocations) {
      const [charge] = await tx.select().from(charges).where(eq(charges.id, allocation.chargeId));
      if (!charge) continue;

      let newBalance = addMoney(charge.balance, allocation.appliedAmount);
      if (compareMoney(newBalance, charge.originalAmount) > 0) newBalance = charge.originalAmount;
      const newStatus = compareMoney(newBalance, charge.originalAmount) >= 0 ? "pending" : "partially_paid";

      await tx
        .update(charges)
        .set({ balance: newBalance, status: newStatus, updatedBy: input.triggeredBy })
        .where(eq(charges.id, charge.id));
    }

    const [originalEntry] = await tx
      .select()
      .from(journalEntries)
      .where(and(eq(journalEntries.source, "payment"), eq(journalEntries.sourceDocumentId, payment.id)));

    if (originalEntry) {
      const originalLines = await tx
        .select()
        .from(journalLines)
        .where(eq(journalLines.journalEntryId, originalEntry.id));

      const today = new Date().toISOString().slice(0, 10);
      const [reversalEntry] = await tx
        .insert(journalEntries)
        .values({
          organizationId: input.organizationId,
          economicDate: today,
          accountingDate: today,
          period: originalEntry.period,
          source: "receipt_reversal",
          sourceDocumentType: "receipts",
          sourceDocumentId: receipt.id,
          reversedEntryId: originalEntry.id,
          description: `Reversión de recibo ${receipt.receiptNumber}: ${input.reason}`,
          createdBy: input.triggeredBy,
        })
        .returning({ id: journalEntries.id });
      if (!reversalEntry) throw new Error("No se pudo crear el asiento de reversión");

      if (originalLines.length > 0) {
        await tx.insert(journalLines).values(
          originalLines.map((line) => ({
            organizationId: input.organizationId,
            journalEntryId: reversalEntry.id,
            accountId: line.accountId,
            debit: line.credit,
            credit: line.debit,
            originalCurrency: line.originalCurrency,
            originalAmount: line.originalAmount,
            familyId: line.familyId,
            ownerId: line.ownerId,
            propertyId: line.propertyId,
            unitId: line.unitId,
            leaseId: line.leaseId,
            tenantId: line.tenantId,
          })),
        );
      }

      await tx.update(journalEntries).set({ status: "reversed" }).where(eq(journalEntries.id, originalEntry.id));
    }

    await tx
      .update(receipts)
      .set({ status: "voided", voidReason: input.reason })
      .where(eq(receipts.id, receipt.id));
    await tx.update(payments).set({ status: "voided" }).where(eq(payments.id, payment.id));

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      userId: input.triggeredBy,
      entityType: "receipts",
      entityId: receipt.id,
      action: "reverse",
      reason: input.reason,
      previousState: { status: receipt.status },
      newState: { status: "voided" },
    });

    return { receiptId: receipt.id };
  });
}
