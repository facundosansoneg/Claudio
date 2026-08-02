import { and, eq } from "drizzle-orm";
import {
  charges,
  journalEntries,
  journalLines,
  ledgerAccounts,
  leaseParties,
  leases,
  units,
  recordAuditEvent,
  withOrganizationContext,
  type Database,
} from "@farfalla/database";
import { ACCOUNT_CODES } from "./chart-of-accounts";

export interface GenerateChargeInput {
  organizationId: string;
  leaseId: string;
  chargeType: string; // rent, consumption, late_fee, adjustment, deposit, other
  period: string; // "YYYY-MM"
  dueDate: string; // "YYYY-MM-DD"
  amount: string; // NUMERIC(20,6) como string
  triggeredBy: string | null; // userId; null = job/sistema (audit_log.user_id documenta esta convención)
}

export interface GenerateChargeResult {
  chargeId: string;
  created: boolean;
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
 * Devengamiento de un cargo (spec, RENT-002/GenerateRentCharges,
 * simplificado a generación manual por ahora). Idempotente por
 * (leaseId, period, chargeType): una segunda llamada con los mismos
 * parámetros no duplica el cargo ni el asiento.
 *
 * Genera el primer paso del ciclo de sección 3.4 (devengamiento):
 * débito Cuentas por cobrar a inquilinos / crédito Ingresos por
 * alquiler — ver docs/accounting-rules.md, sección 3.
 */
export async function generateCharge(
  db: Database,
  input: GenerateChargeInput,
): Promise<GenerateChargeResult> {
  return withOrganizationContext(db, input.organizationId, async (tx) => {
    const [existing] = await tx
      .select({ id: charges.id })
      .from(charges)
      .where(
        and(
          eq(charges.leaseId, input.leaseId),
          eq(charges.period, input.period),
          eq(charges.chargeType, input.chargeType),
        ),
      );
    if (existing) {
      return { chargeId: existing.id, created: false };
    }

    const [lease] = await tx.select().from(leases).where(eq(leases.id, input.leaseId));
    if (!lease) throw new Error("Contrato no encontrado");

    const [unit] = await tx.select().from(units).where(eq(units.id, lease.unitId));
    if (!unit) throw new Error("Unidad del contrato no encontrada");

    const [tenantLeaseParty] = await tx
      .select()
      .from(leaseParties)
      .where(and(eq(leaseParties.leaseId, lease.id), eq(leaseParties.role, "tenant")));

    const [charge] = await tx
      .insert(charges)
      .values({
        organizationId: input.organizationId,
        leaseId: input.leaseId,
        chargeType: input.chargeType,
        period: input.period,
        dueDate: input.dueDate,
        currency: lease.currency,
        originalAmount: input.amount,
        balance: input.amount,
      })
      .returning({ id: charges.id });
    if (!charge) throw new Error("No se pudo crear el cargo");

    const receivableAccountId = await getAccountId(
      tx,
      input.organizationId,
      ACCOUNT_CODES.TENANT_RECEIVABLE,
    );
    const incomeAccountId = await getAccountId(tx, input.organizationId, ACCOUNT_CODES.RENT_INCOME);

    const [journalEntry] = await tx
      .insert(journalEntries)
      .values({
        organizationId: input.organizationId,
        economicDate: input.dueDate,
        accountingDate: input.dueDate,
        period: input.period,
        source: "charge_generation",
        sourceDocumentType: "charges",
        sourceDocumentId: charge.id,
        description: `Devengamiento ${input.chargeType} ${input.period}`,
        createdBy: input.triggeredBy,
      })
      .returning({ id: journalEntries.id });
    if (!journalEntry) throw new Error("No se pudo crear el asiento de devengamiento");

    const dimensions = {
      propertyId: unit.propertyId,
      unitId: unit.id,
      leaseId: lease.id,
      tenantId: tenantLeaseParty?.tenantId ?? null,
    };

    await tx.insert(journalLines).values([
      {
        organizationId: input.organizationId,
        journalEntryId: journalEntry.id,
        accountId: receivableAccountId,
        debit: input.amount,
        credit: "0",
        originalCurrency: lease.currency,
        originalAmount: input.amount,
        ...dimensions,
      },
      {
        organizationId: input.organizationId,
        journalEntryId: journalEntry.id,
        accountId: incomeAccountId,
        debit: "0",
        credit: input.amount,
        originalCurrency: lease.currency,
        originalAmount: input.amount,
        ...dimensions,
      },
    ]);

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      userId: input.triggeredBy,
      entityType: "charges",
      entityId: charge.id,
      action: "create",
      newState: { leaseId: input.leaseId, period: input.period, amount: input.amount },
    });

    return { chargeId: charge.id, created: true };
  });
}
