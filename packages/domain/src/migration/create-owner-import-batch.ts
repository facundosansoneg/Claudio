import { importBatches, importRows, recordAuditEvent, withOrganizationContext, type Database } from "@farfalla/database";
import { parseCsv } from "./parse-csv";
import { validateOwnerImportRow } from "./validate-owner-import-row";

export interface CreateOwnerImportBatchInput {
  organizationId: string;
  csvText: string;
  sourceFilename?: string | null;
  createdBy: string;
}

export interface CreateOwnerImportBatchResult {
  batchId: string;
  totalRows: number;
  validRowCount: number;
  invalidRowCount: number;
}

/**
 * Sube y valida un CSV de propietarios (spec, sección 16.2, paso 1;
 * 16.1 "mantener evidencia de cada lote importado"). Solo valida y
 * deja las filas en staging (`import_rows`) — no crea ningún owner
 * todavía. commitOwnerImportBatch es el paso separado que sí escribe,
 * y solo sobre las filas que pasaron validación (spec 16.1: "ejecutar
 * conciliación" antes de dar por buena una migración).
 */
export async function createOwnerImportBatch(
  db: Database,
  input: CreateOwnerImportBatchInput,
): Promise<CreateOwnerImportBatchResult> {
  const { rows } = parseCsv(input.csvText);
  if (rows.length === 0) {
    throw new Error("El CSV no tiene filas de datos");
  }

  return withOrganizationContext(db, input.organizationId, async (tx) => {
    const validations = rows.map((row) => validateOwnerImportRow(row));
    const validRowCount = validations.filter((v) => v.valid).length;
    const invalidRowCount = validations.length - validRowCount;

    const [batch] = await tx
      .insert(importBatches)
      .values({
        organizationId: input.organizationId,
        entityType: "owners",
        sourceFilename: input.sourceFilename ?? null,
        status: "validated",
        totalRows: rows.length,
        validRowCount,
        invalidRowCount,
        createdBy: input.createdBy,
      })
      .returning({ id: importBatches.id });
    if (!batch) throw new Error("No se pudo crear el lote de importación");

    await tx.insert(importRows).values(
      rows.map((row, index) => ({
        organizationId: input.organizationId,
        batchId: batch.id,
        rowNumber: index + 1,
        rawData: row,
        status: validations[index]!.valid ? "valid" : "invalid",
        errors: validations[index]!.valid ? null : validations[index]!.errors,
      })),
    );

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      userId: input.createdBy,
      entityType: "import_batches",
      entityId: batch.id,
      action: "create",
      newState: { entityType: "owners", totalRows: rows.length, validRowCount, invalidRowCount },
    });

    return { batchId: batch.id, totalRows: rows.length, validRowCount, invalidRowCount };
  });
}
