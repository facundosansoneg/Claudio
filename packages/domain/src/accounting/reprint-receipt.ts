import { eq } from "drizzle-orm";
import { receipts, recordAuditEvent, withOrganizationContext, type Database } from "@farfalla/database";

export interface ReprintReceiptInput {
  organizationId: string;
  receiptId: string;
  triggeredBy: string;
}

export interface ReprintReceiptResult {
  reprintCount: number;
}

/**
 * Reimpresión de recibo (spec, PAY-003): no crea un pago nuevo, conserva
 * el mismo ID y suma un contador de copias (CLAUDE.md regla 3).
 */
export async function reprintReceipt(
  db: Database,
  input: ReprintReceiptInput,
): Promise<ReprintReceiptResult> {
  return withOrganizationContext(db, input.organizationId, async (tx) => {
    const [receipt] = await tx.select().from(receipts).where(eq(receipts.id, input.receiptId));
    if (!receipt) throw new Error("Recibo no encontrado");
    if (receipt.status === "voided") throw new Error("No se puede reimprimir un recibo anulado");

    const nextCount = receipt.reprintCount + 1;
    await tx.update(receipts).set({ reprintCount: nextCount }).where(eq(receipts.id, receipt.id));

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      userId: input.triggeredBy,
      entityType: "receipts",
      entityId: receipt.id,
      action: "reprint",
      newState: { reprintCount: nextCount },
    });

    return { reprintCount: nextCount };
  });
}
