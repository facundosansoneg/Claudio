import { and, eq } from "drizzle-orm";
import {
  charges,
  leases,
  units,
  ownershipInterests,
  taxProfiles,
  journalEntries,
  journalLines,
  ledgerAccounts,
  recordAuditEvent,
  withOrganizationContext,
  type Database,
} from "@farfalla/database";
import { applyPercentage, compareMoney, subtractMoney } from "../decimal";
import { ACCOUNT_CODES } from "./chart-of-accounts";

export interface DistributeChargeToOwnersInput {
  organizationId: string;
  chargeId: string;
  triggeredBy: string;
}

export interface OwnerDistribution {
  ownerId: string;
  grossShare: string;
  commission: string;
  taxWithholding: string;
  netToOwner: string;
}

export interface DistributeChargeToOwnersResult {
  chargeId: string;
  distributions: OwnerDistribution[];
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

function isActiveAt<T extends { validFrom: string; validTo: string | null }>(
  row: T,
  date: string,
): boolean {
  return row.validFrom <= date && (row.validTo === null || row.validTo >= date);
}

/**
 * Acreditación al propietario, comisión de administración y retención
 * fiscal (spec, sección 3.4, pasos 3-4; docs/accounting-rules.md,
 * sección 3). Solo distribuye cargos ya cobrados por completo
 * (idempotente: una segunda llamada no duplica los asientos).
 *
 * La comisión se calcula sobre `leases.commission_on_rent_percentage`
 * (LEASE-004); la retención fiscal usa `ownership_interests.tax_contribution_percentage`
 * como base (TAX-003: el aporte fiscal puede ser distinto de la
 * participación económica) multiplicado por la tasa vigente del
 * propietario en `tax_profiles`. Si un propietario no tiene tax_profile
 * vigente, no se retiene nada — nunca se asume una tasa (CLAUDE.md
 * regla 6/13).
 */
export async function distributeChargeToOwners(
  db: Database,
  input: DistributeChargeToOwnersInput,
): Promise<DistributeChargeToOwnersResult> {
  return withOrganizationContext(db, input.organizationId, async (tx) => {
    const [charge] = await tx.select().from(charges).where(eq(charges.id, input.chargeId));
    if (!charge) throw new Error("Cargo no encontrado");
    if (charge.status !== "paid") throw new Error("Solo se pueden liquidar cargos completamente cobrados");

    const [existing] = await tx
      .select({ id: journalEntries.id })
      .from(journalEntries)
      .where(and(eq(journalEntries.source, "owner_accrual"), eq(journalEntries.sourceDocumentId, charge.id)));
    if (existing) throw new Error("Este cargo ya fue liquidado a los propietarios");

    const [lease] = await tx.select().from(leases).where(eq(leases.id, charge.leaseId));
    if (!lease) throw new Error("Contrato del cargo no encontrado");
    const [unit] = await tx.select().from(units).where(eq(units.id, lease.unitId));
    if (!unit) throw new Error("Unidad del contrato no encontrada");

    const allInterests = await tx
      .select()
      .from(ownershipInterests)
      .where(eq(ownershipInterests.propertyId, unit.propertyId));
    const activeInterests = allInterests.filter((interest) => isActiveAt(interest, charge.dueDate));
    if (activeInterests.length === 0) {
      throw new Error("La propiedad no tiene propietarios asignados en la fecha del cargo");
    }

    const allTaxProfiles = await tx.select().from(taxProfiles);

    const distributions: OwnerDistribution[] = activeInterests.map((interest) => {
      const grossShare = applyPercentage(charge.originalAmount, interest.rentDistributionPercentage);
      const commission = lease.commissionOnRentPercentage
        ? applyPercentage(grossShare, lease.commissionOnRentPercentage)
        : "0.000000";
      const taxBase = applyPercentage(charge.originalAmount, interest.taxContributionPercentage);
      const activeTaxProfile = allTaxProfiles.find(
        (profile) => profile.ownerId === interest.ownerId && isActiveAt(profile, charge.dueDate),
      );
      const taxWithholding = activeTaxProfile
        ? applyPercentage(taxBase, activeTaxProfile.percentage)
        : "0.000000";
      const netToOwner = subtractMoney(subtractMoney(grossShare, commission), taxWithholding);

      return { ownerId: interest.ownerId, grossShare, commission, taxWithholding, netToOwner };
    });

    const receivableFundsAccountId = await getAccountId(tx, input.organizationId, ACCOUNT_CODES.OWNER_FUNDS_PAYABLE);
    const rentIncomeAccountId = await getAccountId(tx, input.organizationId, ACCOUNT_CODES.RENT_INCOME);
    const commissionIncomeAccountId = await getAccountId(tx, input.organizationId, ACCOUNT_CODES.COMMISSION_INCOME);
    const taxWithholdingAccountId = await getAccountId(tx, input.organizationId, ACCOUNT_CODES.TAX_WITHHOLDING_PAYABLE);

    const baseDimensions = {
      propertyId: unit.propertyId,
      unitId: unit.id,
      leaseId: lease.id,
    };

    // Paso 3: acreditación al propietario — débito Ingresos / crédito Fondos de propietarios.
    const [accrualEntry] = await tx
      .insert(journalEntries)
      .values({
        organizationId: input.organizationId,
        economicDate: charge.dueDate,
        accountingDate: charge.dueDate,
        period: charge.period,
        source: "owner_accrual",
        sourceDocumentType: "charges",
        sourceDocumentId: charge.id,
        description: `Acreditación a propietarios ${charge.chargeType} ${charge.period}`,
        createdBy: input.triggeredBy,
      })
      .returning({ id: journalEntries.id });
    if (!accrualEntry) throw new Error("No se pudo crear el asiento de acreditación");

    await tx.insert(journalLines).values(
      distributions.flatMap((d) => [
        {
          organizationId: input.organizationId,
          journalEntryId: accrualEntry.id,
          accountId: rentIncomeAccountId,
          debit: d.grossShare,
          credit: "0",
          originalCurrency: charge.currency,
          originalAmount: d.grossShare,
          ownerId: d.ownerId,
          ...baseDimensions,
        },
        {
          organizationId: input.organizationId,
          journalEntryId: accrualEntry.id,
          accountId: receivableFundsAccountId,
          debit: "0",
          credit: d.grossShare,
          originalCurrency: charge.currency,
          originalAmount: d.grossShare,
          ownerId: d.ownerId,
          ...baseDimensions,
        },
      ]),
    );

    // Paso 4a: comisión de administración — débito Fondos de propietarios / crédito Ingresos por comisión.
    const commissionLines = distributions.filter((d) => compareMoney(d.commission, "0") > 0);
    if (commissionLines.length > 0) {
      const [commissionEntry] = await tx
        .insert(journalEntries)
        .values({
          organizationId: input.organizationId,
          economicDate: charge.dueDate,
          accountingDate: charge.dueDate,
          period: charge.period,
          source: "commission",
          sourceDocumentType: "charges",
          sourceDocumentId: charge.id,
          description: `Comisión de administración ${charge.period}`,
          createdBy: input.triggeredBy,
        })
        .returning({ id: journalEntries.id });
      if (!commissionEntry) throw new Error("No se pudo crear el asiento de comisión");

      await tx.insert(journalLines).values(
        commissionLines.flatMap((d) => [
          {
            organizationId: input.organizationId,
            journalEntryId: commissionEntry.id,
            accountId: receivableFundsAccountId,
            debit: d.commission,
            credit: "0",
            originalCurrency: charge.currency,
            originalAmount: d.commission,
            ownerId: d.ownerId,
            ...baseDimensions,
          },
          {
            organizationId: input.organizationId,
            journalEntryId: commissionEntry.id,
            accountId: commissionIncomeAccountId,
            debit: "0",
            credit: d.commission,
            originalCurrency: charge.currency,
            originalAmount: d.commission,
            ownerId: d.ownerId,
            ...baseDimensions,
          },
        ]),
      );
    }

    // Paso 4b: retención fiscal — débito Fondos de propietarios / crédito Retenciones a depositar.
    const taxLines = distributions.filter((d) => compareMoney(d.taxWithholding, "0") > 0);
    if (taxLines.length > 0) {
      const [taxEntry] = await tx
        .insert(journalEntries)
        .values({
          organizationId: input.organizationId,
          economicDate: charge.dueDate,
          accountingDate: charge.dueDate,
          period: charge.period,
          source: "tax_withholding",
          sourceDocumentType: "charges",
          sourceDocumentId: charge.id,
          description: `Retención fiscal ${charge.period}`,
          createdBy: input.triggeredBy,
        })
        .returning({ id: journalEntries.id });
      if (!taxEntry) throw new Error("No se pudo crear el asiento de retención fiscal");

      await tx.insert(journalLines).values(
        taxLines.flatMap((d) => [
          {
            organizationId: input.organizationId,
            journalEntryId: taxEntry.id,
            accountId: receivableFundsAccountId,
            debit: d.taxWithholding,
            credit: "0",
            originalCurrency: charge.currency,
            originalAmount: d.taxWithholding,
            ownerId: d.ownerId,
            ...baseDimensions,
          },
          {
            organizationId: input.organizationId,
            journalEntryId: taxEntry.id,
            accountId: taxWithholdingAccountId,
            debit: "0",
            credit: d.taxWithholding,
            originalCurrency: charge.currency,
            originalAmount: d.taxWithholding,
            ownerId: d.ownerId,
            ...baseDimensions,
          },
        ]),
      );
    }

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      userId: input.triggeredBy,
      entityType: "charges",
      entityId: charge.id,
      action: "distribute",
      newState: { distributions },
    });

    return { chargeId: charge.id, distributions };
  });
}
