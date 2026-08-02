import { and, eq } from "drizzle-orm";
import {
  importBatches,
  importRows,
  parties,
  owners,
  recordAuditEvent,
  withOrganizationContext,
  type Database,
} from "@farfalla/database";

export interface CommitOwnerImportBatchInput {
  organizationId: string;
  batchId: string;
  triggeredBy: string;
}

export interface CommitOwnerImportBatchResult {
  importedRowCount: number;
  skippedInvalidRowCount: number;
}

/**
 * Confirma un lote de propietarios ya validado: crea party+owner para
 * cada fila "valid" (spec, sección 16.2 paso 1) y las marca
 * "imported". Las filas "invalid" se saltan — nunca se importa una
 * fila que no pasó validación. Idempotente por lote: un lote ya
 * "committed" no se puede volver a confirmar (spec 16.1, "mantener
 * evidencia de cada lote importado" — un lote committed es historia,
 * no se reprocesa).
 */
export async function commitOwnerImportBatch(
  db: Database,
  input: CommitOwnerImportBatchInput,
): Promise<CommitOwnerImportBatchResult> {
  return withOrganizationContext(db, input.organizationId, async (tx) => {
    const [batch] = await tx.select().from(importBatches).where(eq(importBatches.id, input.batchId));
    if (!batch) throw new Error("Lote de importación no encontrado");
    if (batch.entityType !== "owners") throw new Error(`Este lote es de tipo "${batch.entityType}", no "owners"`);
    if (batch.status === "committed") throw new Error("Este lote ya fue confirmado — no se puede confirmar dos veces");

    const rows = await tx
      .select()
      .from(importRows)
      .where(and(eq(importRows.batchId, input.batchId), eq(importRows.status, "valid")));

    let importedRowCount = 0;
    for (const row of rows) {
      const data = row.rawData as Record<string, string>;
      const [party] = await tx
        .insert(parties)
        .values({
          organizationId: input.organizationId,
          partyType: (data.party_type?.trim() || "person") as "person" | "company" | "trust" | "government_agency" | "other",
          displayName: data.display_name!.trim(),
          legalName: data.legal_name?.trim() || null,
          documentType: data.document_type?.trim() || null,
          documentNumber: data.document_number?.trim() || null,
          createdBy: input.triggeredBy,
        })
        .returning({ id: parties.id });
      if (!party) throw new Error(`No se pudo crear la party de la fila ${row.rowNumber}`);

      const [owner] = await tx
        .insert(owners)
        .values({
          organizationId: input.organizationId,
          partyId: party.id,
          legacySgaCode: data.legacy_sga_code?.trim() || null,
          createdBy: input.triggeredBy,
        })
        .returning({ id: owners.id });
      if (!owner) throw new Error(`No se pudo crear el owner de la fila ${row.rowNumber}`);

      await tx.update(importRows).set({ status: "imported", importedEntityId: owner.id }).where(eq(importRows.id, row.id));
      importedRowCount += 1;
    }

    await tx
      .update(importBatches)
      .set({ status: "committed", importedRowCount, committedAt: new Date(), committedBy: input.triggeredBy })
      .where(eq(importBatches.id, input.batchId));

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      userId: input.triggeredBy,
      entityType: "import_batches",
      entityId: input.batchId,
      action: "commit",
      newState: { importedRowCount },
    });

    return { importedRowCount, skippedInvalidRowCount: batch.invalidRowCount };
  });
}
