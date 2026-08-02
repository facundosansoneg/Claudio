import { and, count, eq } from "drizzle-orm";
import {
  charges,
  journalEntries,
  journalLines,
  leaseParties,
  leases,
  ledgerAccounts,
  paymentAllocations,
  payments,
  receipts,
  units,
  recordAuditEvent,
  withOrganizationContext,
  type Database,
} from "@farfalla/database";
import { compareMoney, subtractMoney } from "../decimal";
import { ACCOUNT_CODES } from "./chart-of-accounts";

export interface RegisterPaymentInput {
  organizationId: string;
  chargeId: string;
  paymentDate: string; // "YYYY-MM-DD"
  amount: string; // NUMERIC(20,6) como string; debe ser <= saldo del cargo
  channel?: string;
  triggeredBy: string; // userId
}

export interface RegisterPaymentResult {
  paymentId: string;
  receiptId: string;
  receiptNumber: string;
}

async function getAccountId(tx: Database, organizationId: string, code: string): Promise<string> {
  const [account] = await tx
    .select({ id: ledgerAccounts.id })
    .from(ledgerAccounts)
    .where(and(eq(ledgerAccounts.organizationId, organizationId), eq(ledgerAccounts.code, code)));
  if (!account) {
    throw new Error(
      `No existe la cuenta contable ${code} para esta organización — correr seedChartOfAccounts primero`,
    );
  }
  return account.id;
}

/**
 * Cobro de un cargo y emisión de recibo (spec, PAY-001/RegisterPayment +
 * AllocatePayment + IssueReceipt). Segundo paso del ciclo de sección 3.4
 * (cobro): débito Caja y bancos / crédito Cuentas por cobrar a
 * inquilinos. Comisión, retención fiscal y liquidación al propietario
 * son pasos posteriores (Hito 4), no incluidos todavía.
 *
 * Soporta pago parcial (PAY-005): si `amount` < saldo, el cargo queda
 * `partially_paid`.
 */
export async function registerPaymentAndIssueReceipt(
  db: Database,
  input: RegisterPaymentInput,
): Promise<RegisterPaymentResult> {
  return withOrganizationContext(db, input.organizationId, async (tx) => {
    const [charge] = await tx.select().from(charges).where(eq(charges.id, input.chargeId));
    if (!charge) throw new Error("Cargo no encontrado");
    if (charge.status === "paid") throw new Error("El cargo ya está pagado");
    if (charge.status === "cancelled") throw new Error("El cargo está anulado");
    if (compareMoney(input.amount, charge.balance) > 0) {
      throw new Error("El importe del pago no puede superar el saldo del cargo");
    }

    const [lease] = await tx.select().from(leases).where(eq(leases.id, charge.leaseId));
    if (!lease) throw new Error("Contrato del cargo no encontrado");

    const [unit] = await tx.select().from(units).where(eq(units.id, lease.unitId));
    if (!unit) throw new Error("Unidad del contrato no encontrada");

    const [tenantLeaseParty] = await tx
      .select()
      .from(leaseParties)
      .where(and(eq(leaseParties.leaseId, lease.id), eq(leaseParties.role, "tenant")));
    if (!tenantLeaseParty) throw new Error("El contrato no tiene un inquilino asociado");

    const [payment] = await tx
      .insert(payments)
      .values({
        organizationId: input.organizationId,
        payerPartyId: tenantLeaseParty.partyId,
        paymentDate: input.paymentDate,
        currency: charge.currency,
        amount: input.amount,
        channel: input.channel ?? null,
        createdBy: input.triggeredBy,
      })
      .returning({ id: payments.id });
    if (!payment) throw new Error("No se pudo registrar el pago");

    await tx.insert(paymentAllocations).values({
      organizationId: input.organizationId,
      paymentId: payment.id,
      chargeId: charge.id,
      appliedAmount: input.amount,
    });

    const newBalance = subtractMoney(charge.balance, input.amount);
    const newStatus = compareMoney(newBalance, "0") <= 0 ? "paid" : "partially_paid";
    await tx
      .update(charges)
      .set({ balance: newBalance, status: newStatus, updatedBy: input.triggeredBy })
      .where(eq(charges.id, charge.id));

    const cashAccountId = await getAccountId(tx, input.organizationId, ACCOUNT_CODES.CASH_AND_BANKS);
    const receivableAccountId = await getAccountId(
      tx,
      input.organizationId,
      ACCOUNT_CODES.TENANT_RECEIVABLE,
    );

    const [journalEntry] = await tx
      .insert(journalEntries)
      .values({
        organizationId: input.organizationId,
        economicDate: input.paymentDate,
        accountingDate: input.paymentDate,
        period: charge.period,
        source: "payment",
        sourceDocumentType: "payments",
        sourceDocumentId: payment.id,
        description: `Cobro ${charge.chargeType} ${charge.period}`,
        createdBy: input.triggeredBy,
      })
      .returning({ id: journalEntries.id });
    if (!journalEntry) throw new Error("No se pudo crear el asiento de cobro");

    const dimensions = {
      propertyId: unit.propertyId,
      unitId: unit.id,
      leaseId: lease.id,
      tenantId: tenantLeaseParty.tenantId,
    };

    await tx.insert(journalLines).values([
      {
        organizationId: input.organizationId,
        journalEntryId: journalEntry.id,
        accountId: cashAccountId,
        debit: input.amount,
        credit: "0",
        originalCurrency: charge.currency,
        originalAmount: input.amount,
        ...dimensions,
      },
      {
        organizationId: input.organizationId,
        journalEntryId: journalEntry.id,
        accountId: receivableAccountId,
        debit: "0",
        credit: input.amount,
        originalCurrency: charge.currency,
        originalAmount: input.amount,
        ...dimensions,
      },
    ]);

    // Numeración simple, secuencial por organización (spec, sección 3.5:
    // la numeración por serie configurable queda para un hito posterior).
    const [receiptCountRow] = await tx
      .select({ value: count() })
      .from(receipts)
      .where(eq(receipts.organizationId, input.organizationId));
    const receiptNumber = `R-${String((receiptCountRow?.value ?? 0) + 1).padStart(6, "0")}`;

    const [receipt] = await tx
      .insert(receipts)
      .values({
        organizationId: input.organizationId,
        receiptNumber,
        paymentId: payment.id,
        createdBy: input.triggeredBy,
      })
      .returning({ id: receipts.id });
    if (!receipt) throw new Error("No se pudo emitir el recibo");

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      userId: input.triggeredBy,
      entityType: "receipts",
      entityId: receipt.id,
      action: "create",
      newState: { chargeId: charge.id, amount: input.amount, receiptNumber },
    });

    return { paymentId: payment.id, receiptId: receipt.id, receiptNumber };
  });
}
