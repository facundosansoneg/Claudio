import { describe, expect, it } from "vitest";
import { computeComparableStats } from "../src/patrimonial/compute-comparable-stats";

describe("computeComparableStats", () => {
  it("devuelve null para una lista vacía", () => {
    expect(computeComparableStats([])).toBeNull();
  });

  it("calcula mediana simple con un solo valor", () => {
    const stats = computeComparableStats(["1000.000000"]);
    expect(stats?.medianPricePerSqm).toBe("1000.000000");
    expect(stats?.q1PricePerSqm).toBe("1000.000000");
    expect(stats?.q3PricePerSqm).toBe("1000.000000");
    expect(stats?.count).toBe(1);
  });

  it("promedia los dos valores centrales para mediana con cantidad par", () => {
    const stats = computeComparableStats(["1000.000000", "2000.000000"]);
    expect(stats?.medianPricePerSqm).toBe("1500.000000");
  });

  it("calcula mediana y cuartiles sobre un conjunto de 5 valores", () => {
    const stats = computeComparableStats([
      "1000.000000",
      "1200.000000",
      "1500.000000",
      "1800.000000",
      "2000.000000",
    ]);
    expect(stats?.count).toBe(5);
    expect(stats?.medianPricePerSqm).toBe("1500.000000");
    expect(stats?.q1PricePerSqm).toBe("1200.000000");
    expect(stats?.q3PricePerSqm).toBe("1800.000000");
  });

  it("no depende del orden de entrada", () => {
    const sorted = computeComparableStats(["1000.000000", "1500.000000", "2000.000000"]);
    const shuffled = computeComparableStats(["2000.000000", "1000.000000", "1500.000000"]);
    expect(shuffled).toEqual(sorted);
  });
});
