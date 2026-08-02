import { and, eq } from "drizzle-orm";
import {
  journalEntries,
  journalLines,
  ledgerAccounts,
  withOrganizationContext,
  type Database,
} from "@farfalla/database";
import { addMoney, subtractMoney } from "../decimal";
import { ACCOUNT_CODES } from "./chart-of-accounts";

export interface OwnerStatementMovement {
  date: string;
  description: string | null;
  source: string;
  currency: string;
  debit: string;
  credit: string;
}

export interface OwnerStatementBalance {
  currency: string;
  balance: string;
}

export interface OwnerStatement {
  ownerId: string;
  movements: OwnerStatementMovement[];
  /**
   * Saldo disponible en "Fondos de propietarios por pagar" (crédito -
   * débito), un saldo por moneda — nunca se suman importes de monedas
   * distintas entre sí (CLAUDE.md regla 8, multimoneda desde el día
   * uno).
   */
  balances: OwnerStatementBalance[];
}

/**
 * Estado de cuenta del propietario (spec, OWN-005): movimientos de la
 * cuenta "Fondos de propietarios por pagar" y saldo disponible. Se
 * calcula siempre a partir del ledger — nunca se guarda un saldo
 * cacheado que pueda desincronizarse (CLAUDE.md regla 3, ledger como
 * fuente de verdad).
 */
export async function getOwnerStatement(
  db: Database,
  organizationId: string,
  ownerId: string,
): Promise<OwnerStatement> {
  return withOrganizationContext(db, organizationId, async (tx) => {
    const [account] = await tx
      .select({ id: ledgerAccounts.id })
      .from(ledgerAccounts)
      .where(
        and(
          eq(ledgerAccounts.organizationId, organizationId),
          eq(ledgerAccounts.code, ACCOUNT_CODES.OWNER_FUNDS_PAYABLE),
        ),
      );
    if (!account) return { ownerId, movements: [], balances: [] };

    const rows = await tx
      .select({
        date: journalEntries.economicDate,
        description: journalEntries.description,
        source: journalEntries.source,
        currency: journalLines.originalCurrency,
        debit: journalLines.debit,
        credit: journalLines.credit,
      })
      .from(journalLines)
      .innerJoin(journalEntries, eq(journalEntries.id, journalLines.journalEntryId))
      .where(and(eq(journalLines.accountId, account.id), eq(journalLines.ownerId, ownerId)))
      .orderBy(journalEntries.economicDate);

    const balancesByCurrency = new Map<string, string>();
    for (const row of rows) {
      const previous = balancesByCurrency.get(row.currency) ?? "0.000000";
      balancesByCurrency.set(row.currency, subtractMoney(addMoney(previous, row.credit), row.debit));
    }

    const balances = [...balancesByCurrency.entries()].map(([currency, balance]) => ({ currency, balance }));

    return { ownerId, movements: rows, balances };
  });
}
