import { and, eq, inArray } from "drizzle-orm";
import {
  marketComparables,
  marketEstimateComparables,
  marketEstimates,
  properties,
  recordAuditEvent,
  withOrganizationContext,
  type Database,
} from "@farfalla/database";
import {
  applyPercentage,
  clampMoney,
  formatFixedPoint,
  MONEY_SCALE,
  multiplyMoney,
  parseFixedPoint,
  PERCENTAGE_SCALE,
  sumFixedPoint,
} from "../decimal";
import { computeComparableStats, type ComparableStats } from "./compute-comparable-stats";
import { haversineDistanceKm } from "./haversine-distance";

export interface EstimateMarketValueComparableInput {
  comparableId: string;
  /** 0-100. Relativo dentro de su grupo — venta y alquiler se ponderan por separado (son magnitudes distintas). */
  weight: string;
}

export interface EstimateMarketValueInput {
  organizationId: string;
  propertyId: string;
  estimateDate: string;
  comparables: EstimateMarketValueComparableInput[];
  adjustmentsNotes?: string | null;
  triggeredBy: string;
}

export interface MarketEstimateResult {
  marketEstimateId: string;
  currency: string | null;
  valueMin: string | null;
  valueCentral: string | null;
  valueMax: string | null;
  rentMin: string | null;
  rentCentral: string | null;
  rentMax: string | null;
  confidence: "low" | "medium" | "high";
}

interface RowWithWeight {
  row: typeof marketComparables.$inferSelect;
  weight: string;
}

/**
 * Confianza (spec 10.3): regla propia y transparente, no un estándar
 * externo — nunca se presenta como tasación oficial (sección 10.4).
 * "high" exige volumen (≥5 comparables) y baja dispersión (rango
 * intercuartílico ≤ 25% de la mediana); menos de 3 comparables siempre
 * es "low", sin excepción.
 */
function computeConfidence(count: number, stats: ComparableStats | null): "low" | "medium" | "high" {
  if (count < 3 || !stats) return "low";
  const median = parseFixedPoint(stats.medianPricePerSqm, MONEY_SCALE);
  if (median === 0n) return "low";
  const iqr = parseFixedPoint(stats.q3PricePerSqm, MONEY_SCALE) - parseFixedPoint(stats.q1PricePerSqm, MONEY_SCALE);
  const dispersionBp = (iqr * 10000n) / median; // 10000 = 100%
  if (count >= 5 && dispersionBp <= 2500n) return "high";
  return "medium";
}

function assertWeightsSum100(rowsGroup: RowWithWeight[], label: string) {
  if (rowsGroup.length === 0) return;
  const total = sumFixedPoint(rowsGroup.map((r) => parseFixedPoint(r.weight, PERCENTAGE_SCALE)));
  if (total !== parseFixedPoint("100", PERCENTAGE_SCALE)) {
    throw new Error(`Los pesos de los comparables de ${label} deben sumar 100`);
  }
}

function assertSameCurrency(rowsGroup: RowWithWeight[], label: string): string | null {
  if (rowsGroup.length === 0) return null;
  const currencies = new Set(rowsGroup.map((r) => r.row.currency));
  if (currencies.size > 1) {
    throw new Error(`Los comparables de ${label} seleccionados están en monedas distintas — no se pueden mezclar`);
  }
  return rowsGroup[0]!.row.currency;
}

interface RangeResult {
  min: string | null;
  central: string | null;
  max: string | null;
  stats: ComparableStats | null;
}

function estimateRange(rowsGroup: RowWithWeight[], propertyArea: string): RangeResult {
  if (rowsGroup.length === 0) return { min: null, central: null, max: null, stats: null };

  const weightedAvgPricePerSqm = formatFixedPoint(
    sumFixedPoint(rowsGroup.map((r) => parseFixedPoint(applyPercentage(r.row.pricePerSqm!, r.weight), MONEY_SCALE))),
    MONEY_SCALE,
  );
  const stats = computeComparableStats(rowsGroup.map((r) => r.row.pricePerSqm!))!;

  const centralRaw = multiplyMoney(weightedAvgPricePerSqm, propertyArea);
  const min = multiplyMoney(stats.q1PricePerSqm, propertyArea);
  const max = multiplyMoney(stats.q3PricePerSqm, propertyArea);
  // El promedio ponderado puede caer fuera de [Q1, Q3] si los pesos
  // favorecen mucho a un comparable atípico — se acota para que el
  // rango entregado sea siempre coherente (min ≤ central ≤ max).
  const central = clampMoney(centralRaw, min, max);

  return { min, central, max, stats };
}

/**
 * Estimación automática inicial (spec, sección 10.3): comparables
 * ponderados manualmente por quien estima (nunca una cifra única
 * opaca), entrega mínimo/central/máximo y confianza. Venta y alquiler
 * se calculan por separado dentro de la misma corrida porque son
 * magnitudes distintas (valor de venta vs. renta mensual). El mínimo y
 * máximo usan el rango intercuartílico de precio/m² del propio
 * conjunto seleccionado (sección 10.2) multiplicado por la superficie
 * de la propiedad.
 *
 * No hace ajustes automáticos por superficie/garaje/terraza/estado/
 * antigüedad/amenities — esos factores requieren una tabla de
 * coeficientes configurable que todavía no existe (CLAUDE.md regla 6 y
 * 7: no inventar un factor de ajuste sin base real). Quien estima
 * documenta esos ajustes a mano en `adjustmentsNotes` al elegir qué
 * comparables usar y con qué peso.
 */
export async function estimateMarketValue(
  db: Database,
  input: EstimateMarketValueInput,
): Promise<MarketEstimateResult> {
  return withOrganizationContext(db, input.organizationId, async (tx) => {
    if (input.comparables.length === 0) {
      throw new Error("Hay que seleccionar al menos un comparable para estimar");
    }
    const comparableIds = input.comparables.map((c) => c.comparableId);
    if (new Set(comparableIds).size !== comparableIds.length) {
      throw new Error("No se puede repetir el mismo comparable en una estimación");
    }

    const [property] = await tx.select().from(properties).where(eq(properties.id, input.propertyId));
    if (!property) throw new Error("Propiedad no encontrada");

    const propertyArea = property.builtAreaM2 ?? property.landAreaM2;
    if (!propertyArea) {
      throw new Error(
        "La propiedad no tiene superficie cargada (construida o de terreno) — no se puede estimar por m²",
      );
    }

    const rows = await tx
      .select()
      .from(marketComparables)
      .where(
        and(eq(marketComparables.organizationId, input.organizationId), inArray(marketComparables.id, comparableIds)),
      );
    if (rows.length !== comparableIds.length) {
      throw new Error("Alguno de los comparables seleccionados no existe");
    }

    const weightById = new Map(input.comparables.map((c) => [c.comparableId, c.weight]));
    const rowsWithWeight: RowWithWeight[] = rows.map((row) => ({ row, weight: weightById.get(row.id)! }));

    for (const { row } of rowsWithWeight) {
      if (!row.pricePerSqm) {
        throw new Error(
          `El comparable "${row.address ?? row.id}" no tiene precio por m² (falta superficie cargada) — no se puede usar en la estimación`,
        );
      }
    }

    const saleRows = rowsWithWeight.filter((r) => r.row.transactionType === "sale");
    const rentRows = rowsWithWeight.filter((r) => r.row.transactionType === "rent");
    if (saleRows.length === 0 && rentRows.length === 0) {
      throw new Error("Los comparables deben ser de venta o de alquiler");
    }

    assertWeightsSum100(saleRows, "venta");
    assertWeightsSum100(rentRows, "alquiler");
    const saleCurrency = assertSameCurrency(saleRows, "venta");
    const rentCurrency = assertSameCurrency(rentRows, "alquiler");

    const saleEstimate = estimateRange(saleRows, propertyArea);
    const rentEstimate = estimateRange(rentRows, propertyArea);

    const primaryCount = saleRows.length > 0 ? saleRows.length : rentRows.length;
    const primaryStats = saleRows.length > 0 ? saleEstimate.stats : rentEstimate.stats;
    const confidence = computeConfidence(primaryCount, primaryStats);
    const currency = saleCurrency ?? rentCurrency;

    const [estimate] = await tx
      .insert(marketEstimates)
      .values({
        organizationId: input.organizationId,
        propertyId: input.propertyId,
        estimateDate: input.estimateDate,
        currency: currency!,
        valueMin: saleEstimate.min,
        valueCentral: saleEstimate.central,
        valueMax: saleEstimate.max,
        rentMin: rentEstimate.min,
        rentCentral: rentEstimate.central,
        rentMax: rentEstimate.max,
        confidence,
        adjustmentsNotes: input.adjustmentsNotes ?? null,
        createdBy: input.triggeredBy,
      })
      .returning({ id: marketEstimates.id });
    if (!estimate) throw new Error("No se pudo crear la estimación");

    const propertyLat = property.latitude ? Number(property.latitude) : null;
    const propertyLon = property.longitude ? Number(property.longitude) : null;

    await tx.insert(marketEstimateComparables).values(
      rowsWithWeight.map(({ row, weight }) => {
        const comparableLat = row.latitude ? Number(row.latitude) : null;
        const comparableLon = row.longitude ? Number(row.longitude) : null;
        const distanceKm =
          propertyLat !== null && propertyLon !== null && comparableLat !== null && comparableLon !== null
            ? haversineDistanceKm(propertyLat, propertyLon, comparableLat, comparableLon).toFixed(6)
            : null;
        return {
          organizationId: input.organizationId,
          marketEstimateId: estimate.id,
          marketComparableId: row.id,
          weight,
          pricePerSqmAtSelection: row.pricePerSqm!,
          distanceKm,
        };
      }),
    );

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      userId: input.triggeredBy,
      entityType: "market_estimates",
      entityId: estimate.id,
      action: "create",
      newState: {
        valueCentral: saleEstimate.central,
        rentCentral: rentEstimate.central,
        confidence,
        comparableCount: rowsWithWeight.length,
      },
    });

    return {
      marketEstimateId: estimate.id,
      currency,
      valueMin: saleEstimate.min,
      valueCentral: saleEstimate.central,
      valueMax: saleEstimate.max,
      rentMin: rentEstimate.min,
      rentCentral: rentEstimate.central,
      rentMax: rentEstimate.max,
      confidence,
    };
  });
}
