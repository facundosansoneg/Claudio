import { describe, expect, it } from "vitest";
import { validateOwnershipInterests, type OwnershipInterestRecord } from "../src/ownership/validate-ownership-interests";

function record(overrides: Partial<OwnershipInterestRecord>): OwnershipInterestRecord {
  return {
    ownerId: "owner-a",
    legalPercentage: "100.00000000",
    economicPercentage: "100.00000000",
    rentDistributionPercentage: "100.00000000",
    taxContributionPercentage: "100.00000000",
    validFrom: "2026-01-01",
    validTo: null,
    ...overrides,
  };
}

describe("validateOwnershipInterests", () => {
  it("acepta el escenario E2E-002 del spec: 60/40 legal/económico/renta, 100/0 fiscal", () => {
    const records: OwnershipInterestRecord[] = [
      record({
        ownerId: "owner-a",
        legalPercentage: "60",
        economicPercentage: "60",
        rentDistributionPercentage: "60",
        taxContributionPercentage: "100",
      }),
      record({
        ownerId: "owner-b",
        legalPercentage: "40",
        economicPercentage: "40",
        rentDistributionPercentage: "40",
        taxContributionPercentage: "0",
      }),
    ];

    const result = validateOwnershipInterests(records);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("un solo propietario al 100% en las 4 dimensiones es válido", () => {
    const result = validateOwnershipInterests([record({})]);
    expect(result.valid).toBe(true);
  });

  it("detecta cuando una dimensión no suma 100% (error de tipeo típico)", () => {
    const records: OwnershipInterestRecord[] = [
      record({ ownerId: "owner-a", legalPercentage: "60" }),
      record({ ownerId: "owner-b", legalPercentage: "39" }), // debería ser 40
    ];

    const result = validateOwnershipInterests(records);

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ type: "dimension_not_100", dimension: "legalPercentage" }),
    );
  });

  it("acepta un cambio histórico de titularidad sin huecos", () => {
    const records: OwnershipInterestRecord[] = [
      record({ ownerId: "owner-a", validFrom: "2020-01-01", validTo: "2023-12-31" }),
      record({
        ownerId: "owner-a",
        legalPercentage: "60",
        economicPercentage: "60",
        rentDistributionPercentage: "60",
        taxContributionPercentage: "60",
        validFrom: "2024-01-01",
        validTo: null,
      }),
      record({
        ownerId: "owner-b",
        legalPercentage: "40",
        economicPercentage: "40",
        rentDistributionPercentage: "40",
        taxContributionPercentage: "40",
        validFrom: "2024-01-01",
        validTo: null,
      }),
    ];

    const result = validateOwnershipInterests(records);
    expect(result.valid).toBe(true);
  });

  it("detecta un hueco entre dos períodos de titularidad", () => {
    const records: OwnershipInterestRecord[] = [
      record({ ownerId: "owner-a", validFrom: "2020-01-01", validTo: "2022-12-31" }),
      // hueco: todo el año 2023 sin ningún propietario
      record({ ownerId: "owner-b", validFrom: "2024-01-01", validTo: null }),
    ];

    const result = validateOwnershipInterests(records);

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ type: "no_coverage", date: "2023-01-01" }),
    );
  });

  it("una lista vacía es válida (nada que validar todavía)", () => {
    expect(validateOwnershipInterests([])).toEqual({ valid: true, errors: [] });
  });
});
