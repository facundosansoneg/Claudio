const VALID_PARTY_TYPES = ["person", "company", "trust", "government_agency", "other"];

export interface OwnerImportRowValidation {
  valid: boolean;
  errors: string[];
  normalized: {
    displayName: string;
    legalName: string | null;
    partyType: string;
    documentType: string | null;
    documentNumber: string | null;
    legacySgaCode: string | null;
  } | null;
}

/**
 * Valida una fila cruda de CSV para importar un propietario (spec,
 * sección 16.2, primer paso del orden recomendado de migración).
 * Columnas esperadas: display_name (obligatoria), legal_name,
 * party_type, document_type, document_number, legacy_sga_code.
 * No asume nada sobre el layout real de SGA (todavía `[OPEN]`,
 * docs/open-decisions.md ítem 8) — son nombres de columna genéricos
 * que se pueden mapear al exportar el CSV real.
 */
export function validateOwnerImportRow(row: Record<string, string>): OwnerImportRowValidation {
  const errors: string[] = [];

  const displayName = (row.display_name ?? "").trim();
  if (!displayName) errors.push("display_name es obligatorio");

  const partyTypeRaw = (row.party_type ?? "").trim();
  const partyType = partyTypeRaw || "person";
  if (!VALID_PARTY_TYPES.includes(partyType)) {
    errors.push(`party_type "${partyTypeRaw}" no es válido (debe ser uno de: ${VALID_PARTY_TYPES.join(", ")})`);
  }

  if (errors.length > 0) {
    return { valid: false, errors, normalized: null };
  }

  return {
    valid: true,
    errors: [],
    normalized: {
      displayName,
      legalName: row.legal_name?.trim() || null,
      partyType,
      documentType: row.document_type?.trim() || null,
      documentNumber: row.document_number?.trim() || null,
      legacySgaCode: row.legacy_sga_code?.trim() || null,
    },
  };
}
