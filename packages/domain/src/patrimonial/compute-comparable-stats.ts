import { MONEY_SCALE, formatFixedPoint, parseFixedPoint } from "../decimal";

export interface ComparableStats {
  count: number;
  medianPricePerSqm: string;
  q1PricePerSqm: string;
  q3PricePerSqm: string;
}

/**
 * Mediana y rango intercuartílico de precio por m² de un conjunto de
 * comparables (spec, sección 10.2). Método propio, documentado, no un
 * estándar estadístico externo: percentil por "nearest-rank"
 * (index = ceil(p/100 × n) − 1) para evitar interpolar entre dos
 * valores de punto fijo — con pocos comparables (caso típico acá) la
 * diferencia contra interpolación lineal es marginal.
 */
export function computeComparableStats(pricesPerSqm: string[]): ComparableStats | null {
  if (pricesPerSqm.length === 0) return null;

  const sorted = pricesPerSqm.map((p) => parseFixedPoint(p, MONEY_SCALE)).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const n = sorted.length;

  const percentile = (p: number): bigint => {
    const index = Math.min(n - 1, Math.max(0, Math.ceil((p / 100) * n) - 1));
    return sorted[index]!;
  };

  const median =
    n % 2 === 1 ? sorted[(n - 1) / 2]! : (sorted[n / 2 - 1]! + sorted[n / 2]!) / 2n;

  return {
    count: n,
    medianPricePerSqm: formatFixedPoint(median, MONEY_SCALE),
    q1PricePerSqm: formatFixedPoint(percentile(25), MONEY_SCALE),
    q3PricePerSqm: formatFixedPoint(percentile(75), MONEY_SCALE),
  };
}
