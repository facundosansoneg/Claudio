import { formatFixedPoint, parseFixedPoint } from "../decimal";

const PERCENTAGE_SCALE = 8; // NUMERIC(12,8), CLAUDE.md regla 2
const HUNDRED_PERCENT = parseFixedPoint("100", PERCENTAGE_SCALE);

export const OWNERSHIP_DIMENSIONS = [
  "legalPercentage",
  "economicPercentage",
  "rentDistributionPercentage",
  "taxContributionPercentage",
] as const;

export type OwnershipDimension = (typeof OWNERSHIP_DIMENSIONS)[number];

export interface OwnershipInterestRecord {
  ownerId: string;
  legalPercentage: string;
  economicPercentage: string;
  rentDistributionPercentage: string;
  taxContributionPercentage: string;
  /** Fecha ISO `YYYY-MM-DD`. */
  validFrom: string;
  /** Fecha ISO `YYYY-MM-DD`, o null si sigue vigente. */
  validTo: string | null;
}

export type OwnershipValidationError =
  | {
      type: "dimension_not_100";
      date: string;
      dimension: OwnershipDimension;
      total: string;
    }
  | {
      type: "no_coverage";
      date: string;
    };

export interface OwnershipValidationResult {
  valid: boolean;
  errors: OwnershipValidationError[];
}

function addDaysIso(dateIso: string, days: number): string {
  const [year, month, day] = dateIso.split("-").map(Number);
  const date = new Date(Date.UTC(year as number, (month as number) - 1, day as number));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function isActiveAt(record: OwnershipInterestRecord, date: string): boolean {
  return record.validFrom <= date && (record.validTo === null || record.validTo >= date);
}

/**
 * Valida que cada dimensión (legal, económica, distribución de renta,
 * aporte fiscal) sume exactamente 100% entre los propietarios activos,
 * en cada fecha en que la composición puede cambiar (spec, sección 7.2:
 * "El sistema debe validar que cada dimensión aplicable totalice 100% en
 * la fecha correspondiente").
 *
 * Simplificación deliberada: solo se verifican los "breakpoints"
 * derivados de las fechas de inicio de los registros dados, más el día
 * siguiente a cada `validTo` que caiga antes o en la última fecha de
 * inicio conocida — así se detectan huecos intermedios sin exigir
 * cobertura infinita hacia el futuro más allá del último cambio
 * registrado.
 */
export function validateOwnershipInterests(
  records: OwnershipInterestRecord[],
): OwnershipValidationResult {
  if (records.length === 0) {
    return { valid: true, errors: [] };
  }

  const maxValidFrom = records.reduce(
    (max, r) => (r.validFrom > max ? r.validFrom : max),
    records[0]!.validFrom,
  );

  const breakpoints = new Set<string>();
  for (const record of records) {
    breakpoints.add(record.validFrom);
    if (record.validTo !== null) {
      const dayAfter = addDaysIso(record.validTo, 1);
      if (dayAfter <= maxValidFrom) breakpoints.add(dayAfter);
    }
  }

  const errors: OwnershipValidationError[] = [];

  for (const date of Array.from(breakpoints).sort()) {
    const active = records.filter((r) => isActiveAt(r, date));

    if (active.length === 0) {
      errors.push({ type: "no_coverage", date });
      continue;
    }

    for (const dimension of OWNERSHIP_DIMENSIONS) {
      const total = active.reduce(
        (sum, r) => sum + parseFixedPoint(r[dimension], PERCENTAGE_SCALE),
        0n,
      );
      if (total !== HUNDRED_PERCENT) {
        errors.push({
          type: "dimension_not_100",
          date,
          dimension,
          total: formatFixedPoint(total, PERCENTAGE_SCALE),
        });
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
