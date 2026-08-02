import { and, eq, gte, isNull, lte, or } from "drizzle-orm";
import {
  properties,
  valuations,
  leases,
  units,
  ownershipInterests,
  owners,
  parties,
  families,
  withOrganizationContext,
  type Database,
} from "@farfalla/database";
import { addMoney, applyPercentage, computeRatioPercentage, MONEY_SCALE, formatFixedPoint, parseFixedPoint } from "../decimal";

export interface GetYieldByDimensionInput {
  organizationId: string;
  asOfDate: string;
}

export interface DimensionYield {
  key: string;
  label: string;
  currency: string;
  marketValue: string;
  annualizedRent: string;
  /** Yield bruto = alquiler anualizado / valor de mercado, agregado por grupo (spec, sección 9.1/9.3). */
  yieldPercentage: string;
}

export interface YieldByDimensionResult {
  byPropertyType: DimensionYield[];
  byNeighborhood: DimensionYield[];
  byOwner: DimensionYield[];
  byFamily: DimensionYield[];
}

function isActiveAt<T extends { validFrom: string; validTo: string | null }>(row: T, date: string): boolean {
  return row.validFrom <= date && (row.validTo === null || row.validTo >= date);
}

interface Groupable {
  currency: string;
  marketValue: string;
  annualizedRent: string;
}

function aggregateByGroup<T extends Groupable>(rows: T[], keyOf: (row: T) => { key: string; label: string }): DimensionYield[] {
  const groups = new Map<string, { key: string; label: string; currency: string; marketValue: string; annualizedRent: string }>();
  for (const row of rows) {
    const { key, label } = keyOf(row);
    const groupKey = `${key}::${row.currency}`;
    const existing = groups.get(groupKey);
    if (existing) {
      existing.marketValue = addMoney(existing.marketValue, row.marketValue);
      existing.annualizedRent = addMoney(existing.annualizedRent, row.annualizedRent);
    } else {
      groups.set(groupKey, { key, label, currency: row.currency, marketValue: row.marketValue, annualizedRent: row.annualizedRent });
    }
  }
  return [...groups.values()]
    .filter((g) => parseFixedPoint(g.marketValue, MONEY_SCALE) > 0n)
    .map((g) => ({
      key: g.key,
      label: g.label,
      currency: g.currency,
      marketValue: g.marketValue,
      annualizedRent: g.annualizedRent,
      yieldPercentage: computeRatioPercentage(g.annualizedRent, g.marketValue),
    }));
}

/**
 * Rentabilidad (yield bruto) por dimensión — tipo de inmueble, barrio,
 * propietario y familia (spec, secciones 9.1/9.3). Zona, entidad,
 * portafolio, departamento, garantía, administrador responsable, año de
 * adquisición y moneda como dimensión de reporte quedan para un tramo
 * posterior — no están modeladas todavía (zona) o requieren la capa de
 * reporting multimoneda de la sección 9.5, que todavía no existe.
 *
 * Solo entran las propiedades con valoración vigente Y renta activa en
 * la MISMA moneda que la valoración (igual regla que getPropertyYield):
 * nunca se mezclan monedas para poder mostrar un número.
 *
 * Propietario/familia prorratean valor de mercado y renta anualizada
 * por `ownership_interests.economic_percentage` vigente a la fecha —
 * la misma participación patrimonial que usa distributeChargeToOwners,
 * no la distribución de renta.
 */
export async function getYieldByDimension(db: Database, input: GetYieldByDimensionInput): Promise<YieldByDimensionResult> {
  return withOrganizationContext(db, input.organizationId, async (tx) => {
    const allProperties = await tx
      .select({ id: properties.id, propertyType: properties.propertyType, neighborhood: properties.neighborhood })
      .from(properties);

    const allValuations = await tx
      .select({ propertyId: valuations.propertyId, valuationDate: valuations.valuationDate, value: valuations.value, currency: valuations.currency })
      .from(valuations)
      .where(lte(valuations.valuationDate, input.asOfDate));

    const latestValuationByProperty = new Map<string, { value: string; currency: string; date: string }>();
    for (const v of allValuations) {
      const existing = latestValuationByProperty.get(v.propertyId);
      if (!existing || v.valuationDate > existing.date) {
        latestValuationByProperty.set(v.propertyId, { value: v.value, currency: v.currency, date: v.valuationDate });
      }
    }

    const activeLeaseRows = await tx
      .select({ propertyId: units.propertyId, currency: leases.currency, initialRent: leases.initialRent })
      .from(leases)
      .innerJoin(units, eq(units.id, leases.unitId))
      .where(
        and(
          eq(leases.status, "active"),
          lte(leases.startDate, input.asOfDate),
          or(isNull(leases.endDate), gte(leases.endDate, input.asOfDate)),
        ),
      );

    const rentByPropertyCurrency = new Map<string, Map<string, string>>();
    for (const row of activeLeaseRows) {
      const perProperty = rentByPropertyCurrency.get(row.propertyId) ?? new Map<string, string>();
      const annualRent = formatFixedPoint(parseFixedPoint(row.initialRent, MONEY_SCALE) * 12n, MONEY_SCALE);
      perProperty.set(row.currency, addMoney(perProperty.get(row.currency) ?? "0.000000", annualRent));
      rentByPropertyCurrency.set(row.propertyId, perProperty);
    }

    const propertyYieldInputs: {
      propertyId: string;
      propertyType: string;
      neighborhood: string | null;
      currency: string;
      marketValue: string;
      annualizedRent: string;
    }[] = [];
    for (const property of allProperties) {
      const valuation = latestValuationByProperty.get(property.id);
      if (!valuation) continue;
      const annualizedRent = rentByPropertyCurrency.get(property.id)?.get(valuation.currency);
      if (!annualizedRent) continue;
      propertyYieldInputs.push({
        propertyId: property.id,
        propertyType: property.propertyType,
        neighborhood: property.neighborhood,
        currency: valuation.currency,
        marketValue: valuation.value,
        annualizedRent,
      });
    }

    const byPropertyType = aggregateByGroup(propertyYieldInputs, (p) => ({ key: p.propertyType, label: p.propertyType }));
    const byNeighborhood = aggregateByGroup(propertyYieldInputs, (p) => ({
      key: p.neighborhood ?? "(sin barrio)",
      label: p.neighborhood ?? "(sin barrio)",
    }));

    const allInterests = await tx
      .select({
        propertyId: ownershipInterests.propertyId,
        ownerId: ownershipInterests.ownerId,
        economicPercentage: ownershipInterests.economicPercentage,
        validFrom: ownershipInterests.validFrom,
        validTo: ownershipInterests.validTo,
      })
      .from(ownershipInterests);
    const activeInterests = allInterests.filter((i) => isActiveAt(i, input.asOfDate));

    const ownerRows = await tx
      .select({ id: owners.id, familyId: owners.familyId, displayName: parties.displayName })
      .from(owners)
      .innerJoin(parties, eq(parties.id, owners.partyId));
    const ownerById = new Map(ownerRows.map((o) => [o.id, o]));

    const familyRows = await tx.select({ id: families.id, name: families.name }).from(families);
    const familyById = new Map(familyRows.map((f) => [f.id, f]));

    const ownerAmounts: (Groupable & { ownerId: string; ownerLabel: string; familyId: string | null })[] = [];
    for (const p of propertyYieldInputs) {
      const interests = activeInterests.filter((i) => i.propertyId === p.propertyId);
      for (const interest of interests) {
        const owner = ownerById.get(interest.ownerId);
        ownerAmounts.push({
          ownerId: interest.ownerId,
          ownerLabel: owner?.displayName ?? interest.ownerId,
          familyId: owner?.familyId ?? null,
          currency: p.currency,
          marketValue: applyPercentage(p.marketValue, interest.economicPercentage),
          annualizedRent: applyPercentage(p.annualizedRent, interest.economicPercentage),
        });
      }
    }

    const byOwner = aggregateByGroup(ownerAmounts, (o) => ({ key: o.ownerId, label: o.ownerLabel }));
    const byFamily = aggregateByGroup(
      ownerAmounts.filter((o) => o.familyId !== null),
      (o) => ({ key: o.familyId!, label: familyById.get(o.familyId!)?.name ?? o.familyId! }),
    );

    return { byPropertyType, byNeighborhood, byOwner, byFamily };
  });
}
