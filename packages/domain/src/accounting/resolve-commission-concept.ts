import { and, eq } from "drizzle-orm";
import {
  commissionConcepts,
  commissionConceptOverrides,
  withOrganizationContext,
  type Database,
} from "@farfalla/database";

export interface ResolvedCommissionConcept {
  commissionConceptId: string;
  code: string;
  name: string;
  paymentDestination: string;
  conceptType: string;
  description: string | null;
  percentage: string;
  minAmount: string | null;
  maxAmount: string | null;
  hasVat: boolean;
  hasCommissionTax: boolean;
  /** true si algún campo vino de un override vigente del propietario (COMM-002). */
  overridden: boolean;
}

export interface ResolveCommissionConceptInput {
  organizationId: string;
  code: string;
  ownerId: string;
  /** Fecha a la que debe estar vigente el concepto (y su override, si existe). */
  date: string;
}

function isActiveAt<T extends { validFrom: string; validTo: string | null }>(row: T, date: string): boolean {
  return row.validFrom <= date && (row.validTo === null || row.validTo >= date);
}

/**
 * Resuelve un concepto de comisión vigente para un propietario, aplicando
 * el override de COMM-002 si existe uno vigente. El override es parcial:
 * solo pisa los campos que trae distintos de null — porcentaje, mínimo,
 * máximo y descripción — nunca reemplaza el concepto entero (spec,
 * "permitir... diferentes", no "otro concepto").
 */
export async function resolveCommissionConcept(
  db: Database,
  input: ResolveCommissionConceptInput,
): Promise<ResolvedCommissionConcept | null> {
  return withOrganizationContext(db, input.organizationId, async (tx) => {
    const concepts = await tx
      .select()
      .from(commissionConcepts)
      .where(and(eq(commissionConcepts.organizationId, input.organizationId), eq(commissionConcepts.code, input.code)));
    const concept = concepts.find((c) => isActiveAt(c, input.date));
    if (!concept) return null;

    const overrides = await tx
      .select()
      .from(commissionConceptOverrides)
      .where(
        and(
          eq(commissionConceptOverrides.commissionConceptId, concept.id),
          eq(commissionConceptOverrides.ownerId, input.ownerId),
        ),
      );
    const override = overrides.find((o) => isActiveAt(o, input.date));

    return {
      commissionConceptId: concept.id,
      code: concept.code,
      name: concept.name,
      paymentDestination: concept.paymentDestination,
      conceptType: concept.conceptType,
      description: override?.description ?? concept.description,
      percentage: override?.percentage ?? concept.percentage,
      minAmount: override?.minAmount ?? concept.minAmount,
      maxAmount: override?.maxAmount ?? concept.maxAmount,
      hasVat: concept.hasVat,
      hasCommissionTax: concept.hasCommissionTax,
      overridden: Boolean(override),
    };
  });
}
