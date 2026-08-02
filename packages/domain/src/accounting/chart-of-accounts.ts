import { ledgerAccounts, type Database } from "@farfalla/database";

/** Plan de cuentas mínimo (docs/accounting-rules.md, sección 2). */
export const ACCOUNT_CODES = {
  TENANT_RECEIVABLE: "1100",
  CASH_AND_BANKS: "1200",
  GUARANTEE_AGENT_BALANCE: "1300",
  OWNER_FUNDS_PAYABLE: "2100",
  VAT_PAYABLE: "2200",
  TAX_WITHHOLDING_PAYABLE: "2300",
  ADMIN_LATE_FEE: "2400",
  RENT_INCOME: "4100",
  COMMISSION_INCOME: "4200",
  OWNER_LATE_FEE: "4300",
  PROPERTY_EXPENSES: "5100",
  CAPEX: "5200",
  PROPERTY_TAXES: "5300",
  FEES_PAID: "5400",
  VAT_RECEIVABLE: "6200",
} as const;

const CHART_OF_ACCOUNTS: ReadonlyArray<{
  code: string;
  name: string;
  accountType: "asset" | "liability" | "income" | "expense";
}> = [
  { code: ACCOUNT_CODES.TENANT_RECEIVABLE, name: "Cuentas por cobrar a inquilinos", accountType: "asset" },
  { code: ACCOUNT_CODES.CASH_AND_BANKS, name: "Caja y bancos", accountType: "asset" },
  { code: ACCOUNT_CODES.GUARANTEE_AGENT_BALANCE, name: "Saldos con agentes de garantía", accountType: "asset" },
  { code: ACCOUNT_CODES.OWNER_FUNDS_PAYABLE, name: "Fondos de propietarios por pagar", accountType: "liability" },
  { code: ACCOUNT_CODES.VAT_PAYABLE, name: "IVA débito", accountType: "liability" },
  { code: ACCOUNT_CODES.TAX_WITHHOLDING_PAYABLE, name: "Retenciones IRPF/IRNR a depositar", accountType: "liability" },
  { code: ACCOUNT_CODES.ADMIN_LATE_FEE, name: "Mora de la administración", accountType: "liability" },
  { code: ACCOUNT_CODES.RENT_INCOME, name: "Ingresos por alquiler", accountType: "income" },
  { code: ACCOUNT_CODES.COMMISSION_INCOME, name: "Ingresos por comisión de administración", accountType: "income" },
  { code: ACCOUNT_CODES.OWNER_LATE_FEE, name: "Mora del propietario", accountType: "income" },
  { code: ACCOUNT_CODES.PROPERTY_EXPENSES, name: "Gastos por propiedad (Opex)", accountType: "expense" },
  { code: ACCOUNT_CODES.CAPEX, name: "CapEx", accountType: "asset" },
  { code: ACCOUNT_CODES.PROPERTY_TAXES, name: "Impuestos y tasas sobre inmuebles", accountType: "expense" },
  { code: ACCOUNT_CODES.FEES_PAID, name: "Honorarios y comisiones pagadas", accountType: "expense" },
  { code: ACCOUNT_CODES.VAT_RECEIVABLE, name: "IVA crédito", accountType: "asset" },
];

export async function seedChartOfAccounts(db: Database, organizationId: string) {
  await db
    .insert(ledgerAccounts)
    .values(CHART_OF_ACCOUNTS.map((account) => ({ organizationId, ...account })))
    .onConflictDoNothing();
}
