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

export function subtractMoney(a: string, b: string): string {
  const result = parseFixedPoint(a, MONEY_SCALE) - parseFixedPoint(b, MONEY_SCALE);
  return formatFixedPoint(result, MONEY_SCALE);
}

export function compareMoney(a: string, b: string): -1 | 0 | 1 {
  const diff = parseFixedPoint(a, MONEY_SCALE) - parseFixedPoint(b, MONEY_SCALE);
  if (diff < 0n) return -1;
  if (diff > 0n) return 1;
  return 0;
}
