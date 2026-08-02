import { describe, expect, it } from "vitest";
import { validateOwnerImportRow } from "../src/migration/validate-owner-import-row";

describe("validateOwnerImportRow", () => {
  it("acepta una fila válida y normaliza los campos", () => {
    const result = validateOwnerImportRow({
      display_name: "Juan Pérez",
      party_type: "person",
      document_number: "12345678",
      legacy_sga_code: "SGA-001",
    });

    expect(result.valid).toBe(true);
    expect(result.normalized).toEqual({
      displayName: "Juan Pérez",
      legalName: null,
      partyType: "person",
      documentType: null,
      documentNumber: "12345678",
      legacySgaCode: "SGA-001",
    });
  });

  it("usa 'person' como party_type por defecto si no se especifica", () => {
    const result = validateOwnerImportRow({ display_name: "Juan Pérez" });

    expect(result.valid).toBe(true);
    expect(result.normalized?.partyType).toBe("person");
  });

  it("rechaza una fila sin display_name", () => {
    const result = validateOwnerImportRow({ display_name: "  ", party_type: "person" });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("display_name es obligatorio");
    expect(result.normalized).toBeNull();
  });

  it("rechaza un party_type inválido", () => {
    const result = validateOwnerImportRow({ display_name: "Juan Pérez", party_type: "empresa" });

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/party_type/);
  });
});
