import { and, eq, isNull, or } from "drizzle-orm";
import {
  expenses,
  allocationRules,
  allocationRuns,
  allocationLines,
  ownershipInterests,
  journalEntries,
  journalLines,
  ledgerAccounts,
  recordAuditEvent,
  withOrganizationContext,
  type Database,
} from "@farfalla/database";
import { applyPercentage, sumFixedPoint, parseFixedPoint, formatFixedPoint, MONEY_SCALE } from "../decimal";
import { ACCOUNT_CODES } from "../accounting/chart-of-accounts";

export interface RunExpenseAllocationInput {
  organizationId: string;
  expenseId: string;
  triggeredBy: string;
}

export interface ExpenseAllocationLine {
  ownerId: string;
  coefficient: string;
  amount: string;
}

export interface RunExpenseAllocationResult {
  allocationRunId: string;
  driverType: string;
  lines: ExpenseAllocationLine[];
}

function isActiveAt<T extends { validFrom: string; validTo: string | null }>(row: T, date: string): boolean {
  return row.validFrom <= date && (row.validTo === null || row.validTo >= date);
}

// spec, docs/accounting-rules.md sección 2: solo estas clasificaciones
// tienen cuenta contable definida hoy. seguro/financiero quedan sin
// mapear a propósito — no hay cuenta documentada para ellas todavía
// (CLAUDE.md regla 13: no inventar una cuenta contable sin dato real).
const EXPENSE_ACCOUNT_BY_CLASSIFICATION: Record<string, string> = {
  opex: ACCOUNT_CODES.PROPERTY_EXPENSES,
  maintenance: ACCOUNT_CODES.PROPERTY_EXPENSES,
  repair: ACCOUNT_CODES.PROPERTY_EXPENSES,
  capex: ACCOUNT_CODES.CAPEX,
  tax: ACCOUNT_CODES.PROPERTY_TAXES,
  fee: ACCOUNT_CODES.FEES_PAID,
};

async function getAccountId(tx: Database, organizationId: string, code: string): Promise<string> {
  const [account] = await tx
    .select({ id: ledgerAccounts.id })
    .from(ledgerAccounts)
    .where(and(eq(ledgerAccounts.organizationId, organizationId), eq(ledgerAccounts.code, code)));
  if (!account) {
    throw new Error(`No existe la cuenta contable ${code} para esta organización — correr seedChartOfAccounts primero`);
  }
  return account.id;
}

/**
 * Distribuye un gasto entre los propietarios de la propiedad según el
 * driver configurado (spec, sección 7.9, MOV-004). Este primer tramo
 * implementa dos drivers de los diez listados en el spec:
 *
 * - `direct`: 100% a un propietario específico (`driverConfig.ownerId`),
 *   sin prorratear — para gastos que la administración decide cargar
 *   íntegramente a un propietario puntual.
 * - `ownership_percentage`: prorrateado según `ownership_interests.economic_percentage`
 *   vigente a la fecha del gasto (la participación patrimonial, no la
 *   distribución de renta — un gasto de capital afecta el patrimonio,
 *   no el flujo de alquiler).
 *
 * Los demás drivers del catálogo (m², unidades, valor de mercado,
 * alquiler facturado/cobrado, días ocupados, contratos, fórmula
 * personalizada) todavía no están implementados y `runExpenseAllocation`
 * rechaza explícitamente cualquier regla que los use, en vez de
 * calcular algo incorrecto silenciosamente.
 *
 * Idempotente: un gasto ya distribuido no se puede volver a distribuir.
 */
export async function runExpenseAllocation(
  db: Database,
  input: RunExpenseAllocationInput,
): Promise<RunExpenseAllocationResult> {
  return withOrganizationContext(db, input.organizationId, async (tx) => {
    const [expense] = await tx.select().from(expenses).where(eq(expenses.id, input.expenseId));
    if (!expense) throw new Error("Gasto no encontrado");
    if (expense.allocationStatus === "allocated") throw new Error("Este gasto ya fue distribuido");

    const accountCode = EXPENSE_ACCOUNT_BY_CLASSIFICATION[expense.classification];
    if (!accountCode) {
      throw new Error(
        `La clasificación "${expense.classification}" todavía no tiene cuenta contable asignada — no se puede distribuir`,
      );
    }

    const candidateRules = await tx
      .select()
      .from(allocationRules)
      .where(
        and(
          eq(allocationRules.organizationId, input.organizationId),
          or(eq(allocationRules.propertyId, expense.propertyId), isNull(allocationRules.propertyId)),
          or(eq(allocationRules.category, expense.category), isNull(allocationRules.category)),
        ),
      );
    const activeRules = candidateRules.filter((rule) => isActiveAt(rule, expense.expenseDate));
    // Prioriza la regla más específica: propiedad+categoría > propiedad > categoría > default de la organización.
    const rule =
      activeRules.find((r) => r.propertyId === expense.propertyId && r.category === expense.category) ??
      activeRules.find((r) => r.propertyId === expense.propertyId && r.category === null) ??
      activeRules.find((r) => r.propertyId === null && r.category === expense.category) ??
      activeRules.find((r) => r.propertyId === null && r.category === null);
    if (!rule) {
      throw new Error("No hay una regla de distribución vigente para este gasto — configurar una en allocation_rules");
    }

    let lines: ExpenseAllocationLine[];
    if (rule.driverType === "direct") {
      const config = rule.driverConfig as { ownerId?: string };
      if (!config.ownerId) throw new Error("La regla 'direct' requiere driverConfig.ownerId");
      lines = [{ ownerId: config.ownerId, coefficient: "100.00000000", amount: expense.amount }];
    } else if (rule.driverType === "ownership_percentage") {
      const interests = await tx
        .select()
        .from(ownershipInterests)
        .where(eq(ownershipInterests.propertyId, expense.propertyId));
      const activeInterests = interests.filter((i) => isActiveAt(i, expense.expenseDate));
      if (activeInterests.length === 0) {
        throw new Error("La propiedad no tiene propietarios asignados en la fecha del gasto");
      }
      lines = activeInterests.map((interest) => ({
        ownerId: interest.ownerId,
        coefficient: interest.economicPercentage,
        amount: applyPercentage(expense.amount, interest.economicPercentage),
      }));
    } else {
      throw new Error(
        `El driver "${rule.driverType}" todavía no está implementado — solo 'direct' y 'ownership_percentage' en este tramo`,
      );
    }

    // Ajuste de redondeo: si las líneas no suman exactamente el
    // importe original (posible con porcentajes que no cierran 100%
    // exacto tras el truncamiento), el resto se ajusta en la última
    // línea para que la distribución nunca pierda ni gane dinero.
    const linesTotal = sumFixedPoint(lines.map((l) => parseFixedPoint(l.amount, MONEY_SCALE)));
    const expenseTotal = parseFixedPoint(expense.amount, MONEY_SCALE);
    const roundingDiff = expenseTotal - linesTotal;
    if (roundingDiff !== 0n && lines.length > 0) {
      const lastLine = lines[lines.length - 1]!;
      const adjusted = parseFixedPoint(lastLine.amount, MONEY_SCALE) + roundingDiff;
      lastLine.amount = formatFixedPoint(adjusted, MONEY_SCALE);
    }

    const [run] = await tx
      .insert(allocationRuns)
      .values({
        organizationId: input.organizationId,
        expenseId: expense.id,
        allocationRuleId: rule.id,
        driverType: rule.driverType,
        runBy: input.triggeredBy,
      })
      .returning({ id: allocationRuns.id });
    if (!run) throw new Error("No se pudo crear la ejecución de distribución");

    await tx.insert(allocationLines).values(
      lines.map((line) => ({
        organizationId: input.organizationId,
        allocationRunId: run.id,
        ownerId: line.ownerId,
        coefficient: line.coefficient,
        amount: line.amount,
      })),
    );

    const ownerFundsAccountId = await getAccountId(tx, input.organizationId, ACCOUNT_CODES.OWNER_FUNDS_PAYABLE);
    const expenseAccountId = await getAccountId(tx, input.organizationId, accountCode);

    const [entry] = await tx
      .insert(journalEntries)
      .values({
        organizationId: input.organizationId,
        economicDate: expense.expenseDate,
        accountingDate: expense.expenseDate,
        period: expense.expenseDate.slice(0, 7),
        source: "expense_allocation",
        sourceDocumentType: "expenses",
        sourceDocumentId: expense.id,
        description: `Distribución de gasto (${expense.classification}) — ${expense.category}`,
        createdBy: input.triggeredBy,
      })
      .returning({ id: journalEntries.id });
    if (!entry) throw new Error("No se pudo crear el asiento de distribución");

    await tx.insert(journalLines).values(
      lines.flatMap((line) => [
        {
          organizationId: input.organizationId,
          journalEntryId: entry.id,
          accountId: ownerFundsAccountId,
          debit: line.amount,
          credit: "0",
          originalCurrency: expense.currency,
          originalAmount: line.amount,
          ownerId: line.ownerId,
          propertyId: expense.propertyId,
        },
        {
          organizationId: input.organizationId,
          journalEntryId: entry.id,
          accountId: expenseAccountId,
          debit: "0",
          credit: line.amount,
          originalCurrency: expense.currency,
          originalAmount: line.amount,
          ownerId: line.ownerId,
          propertyId: expense.propertyId,
        },
      ]),
    );

    await tx.update(expenses).set({ allocationStatus: "allocated" }).where(eq(expenses.id, expense.id));

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      userId: input.triggeredBy,
      entityType: "expenses",
      entityId: expense.id,
      action: "allocate",
      newState: { allocationRunId: run.id, driverType: rule.driverType, lines },
    });

    return { allocationRunId: run.id, driverType: rule.driverType, lines };
  });
}
