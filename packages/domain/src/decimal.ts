/**
 * Aritmética decimal exacta de punto fijo, usando BigInt. CLAUDE.md
 * prohíbe `float` para dinero, porcentajes, unidades indexadas y tipos
 * de cambio en TODO el código, no solo en el almacenamiento — este
 * módulo es el único lugar donde se suman/comparan esos valores.
 */

/** Convierte un string decimal (ej. "60.12345678") a un entero escalado por 10^scale. */
export function parseFixedPoint(value: string, scale: number): bigint {
  const trimmed = value.trim();
  const negative = trimmed.startsWith("-");
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [intPartRaw, fracPartRaw = ""] = unsigned.split(".");
  if (fracPartRaw.length > scale) {
    throw new Error(
      `El valor "${value}" tiene más decimales que la precisión permitida (${scale})`,
    );
  }
  const intPart = intPartRaw === "" ? "0" : intPartRaw;
  const fracPart = fracPartRaw.padEnd(scale, "0");
  const magnitude = BigInt(`${intPart}${fracPart}`);
  return negative ? -magnitude : magnitude;
}

/** Convierte un entero escalado por 10^scale de vuelta a string decimal. */
export function formatFixedPoint(value: bigint, scale: number): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const digits = abs.toString().padStart(scale + 1, "0");
  const intPart = digits.slice(0, digits.length - scale);
  const fracPart = scale > 0 ? `.${digits.slice(digits.length - scale)}` : "";
  return `${negative ? "-" : ""}${intPart}${fracPart}`;
}

export function sumFixedPoint(values: bigint[]): bigint {
  return values.reduce((acc, v) => acc + v, 0n);
}

export const MONEY_SCALE = 6; // NUMERIC(20,6), CLAUDE.md regla 2
export const PERCENTAGE_SCALE = 8; // NUMERIC(12,8), CLAUDE.md regla 2

export function subtractMoney(a: string, b: string): string {
  const result = parseFixedPoint(a, MONEY_SCALE) - parseFixedPoint(b, MONEY_SCALE);
  return formatFixedPoint(result, MONEY_SCALE);
}

export function addMoney(a: string, b: string): string {
  const result = parseFixedPoint(a, MONEY_SCALE) + parseFixedPoint(b, MONEY_SCALE);
  return formatFixedPoint(result, MONEY_SCALE);
}

export function compareMoney(a: string, b: string): -1 | 0 | 1 {
  const diff = parseFixedPoint(a, MONEY_SCALE) - parseFixedPoint(b, MONEY_SCALE);
  if (diff < 0n) return -1;
  if (diff > 0n) return 1;
  return 0;
}

/**
 * amount * (percentage / 100), truncado hacia cero a NUMERIC(20,6). Ej.
 * applyPercentage("30000.000000", "60") === "18000.000000".
 */
export function applyPercentage(amount: string, percentage: string): string {
  const amountInt = parseFixedPoint(amount, MONEY_SCALE);
  const percentageInt = parseFixedPoint(percentage, PERCENTAGE_SCALE);
  const denominator = 10n ** BigInt(PERCENTAGE_SCALE + 2); // percentage ya escalado 10^8, más /100
  const result = (amountInt * percentageInt) / denominator;
  return formatFixedPoint(result, MONEY_SCALE);
}

/**
 * Ratio entre dos montos de la misma moneda, expresado como
 * porcentaje NUMERIC(12,8) — ej. computeRatioPercentage("30000",
 * "500000") === "6.00000000" (yield bruto 6%). Trunca hacia cero,
 * igual que applyPercentage. Nunca mezclar monedas distintas acá — la
 * conversión de moneda es un paso separado y explícito, no algo que
 * este helper haga por su cuenta.
 */
export function computeRatioPercentage(numerator: string, denominator: string): string {
  const num = parseFixedPoint(numerator, MONEY_SCALE);
  const den = parseFixedPoint(denominator, MONEY_SCALE);
  if (den === 0n) {
    throw new Error("No se puede calcular un ratio con denominador cero");
  }
  const scale = 10n ** BigInt(PERCENTAGE_SCALE);
  const result = (num * scale * 100n) / den;
  return formatFixedPoint(result, PERCENTAGE_SCALE);
}

/**
 * Ajusta `amount` a los límites [min, max] cuando corresponda (spec,
 * COMM-001: "importe mínimo"/"importe máximo" de un concepto de
 * comisión). Un límite en null se ignora.
 */
export function clampMoney(amount: string, min: string | null, max: string | null): string {
  let result = amount;
  if (min !== null && compareMoney(result, min) < 0) result = min;
  if (max !== null && compareMoney(result, max) > 0) result = max;
  return result;
}
