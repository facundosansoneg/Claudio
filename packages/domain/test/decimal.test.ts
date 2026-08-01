import { describe, expect, it } from "vitest";
import {
  applyPercentage,
  clampMoney,
  computeRatioPercentage,
  formatFixedPoint,
  parseFixedPoint,
  sumFixedPoint,
} from "../src/decimal";

describe("decimal (aritmética de punto fijo con BigInt)", () => {
  it("parsea y formatea sin perder precisión", () => {
    expect(parseFixedPoint("60", 8)).toBe(6000000000n);
    expect(parseFixedPoint("33.33333333", 8)).toBe(3333333333n);
    expect(parseFixedPoint("-12.5", 8)).toBe(-1250000000n);
    expect(formatFixedPoint(6000000000n, 8)).toBe("60.00000000");
    expect(formatFixedPoint(-1250000000n, 8)).toBe("-12.50000000");
  });

  it("rechaza más precisión que la escala permitida", () => {
    expect(() => parseFixedPoint("1.123456789", 8)).toThrow();
  });

  it("suma exacto sin errores de redondeo típicos de float", () => {
    // 0.1 + 0.2 en float da 0.30000000000000004; acá tiene que dar exacto.
    const total = sumFixedPoint([parseFixedPoint("0.1", 8), parseFixedPoint("0.2", 8)]);
    expect(formatFixedPoint(total, 8)).toBe("0.30000000");
  });

  it("applyPercentage calcula un porcentaje exacto de un monto", () => {
    expect(applyPercentage("30000.000000", "60")).toBe("18000.000000");
    expect(applyPercentage("30000.000000", "40")).toBe("12000.000000");
    expect(applyPercentage("30000.000000", "0")).toBe("0.000000");
    expect(applyPercentage("100.000000", "33.333333")).toBe("33.333333");
  });

  it("computeRatioPercentage calcula un yield exacto entre dos montos", () => {
    expect(computeRatioPercentage("30000.000000", "500000.000000")).toBe("6.00000000");
    expect(computeRatioPercentage("0.000000", "500000.000000")).toBe("0.00000000");
    expect(() => computeRatioPercentage("100.000000", "0.000000")).toThrow(/denominador cero/);
  });

  it("clampMoney respeta mínimo y máximo, ignorando límites en null", () => {
    expect(clampMoney("500.000000", "1000.000000", null)).toBe("1000.000000"); // sube al mínimo
    expect(clampMoney("5000.000000", null, "2000.000000")).toBe("2000.000000"); // baja al máximo
    expect(clampMoney("1500.000000", "1000.000000", "2000.000000")).toBe("1500.000000"); // dentro del rango
    expect(clampMoney("1500.000000", null, null)).toBe("1500.000000");
  });
});
