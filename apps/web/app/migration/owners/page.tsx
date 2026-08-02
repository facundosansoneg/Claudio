import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { withOrganizationContext, importBatches, importRows, owners } from "@farfalla/database";
import { getDb } from "@/lib/db";
import { getCurrentUserContext } from "@/lib/current-user";
import { hasPermission } from "@/lib/require-permission";
import { uploadOwnerImportBatchAction, commitOwnerImportBatchAction } from "./actions";

function batchStatusBadgeClass(status: string): string {
  if (status === "committed") return "badge--success";
  if (status === "failed") return "badge--danger";
  return "badge--warning";
}

export default async function OwnerImportPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const context = await getCurrentUserContext();
  if (!context) {
    return (
      <main>
        <p>
          No hay sesión activa. <Link href="/">Volver</Link>
        </p>
      </main>
    );
  }

  const [canView, canCreate, canCommit] = await Promise.all([
    hasPermission(context, "import_batch", "view"),
    hasPermission(context, "import_batch", "create"),
    hasPermission(context, "import_batch", "commit"),
  ]);

  if (!canView) {
    return (
      <main>
        <p>No tenés permiso para ver lotes de importación.</p>
      </main>
    );
  }

  const { batchesList, rowsByBatch, totalOwners } = await withOrganizationContext(getDb(), context.organizationId, async (tx) => {
    const batches = await tx
      .select()
      .from(importBatches)
      .where(eq(importBatches.entityType, "owners"))
      .orderBy(desc(importBatches.createdAt));

    const rows = await tx.select().from(importRows).where(eq(importRows.status, "invalid"));
    const grouped = new Map<string, typeof rows>();
    for (const row of rows) {
      const list = grouped.get(row.batchId) ?? [];
      list.push(row);
      grouped.set(row.batchId, list);
    }

    const ownersCount = await tx.select().from(owners);

    return { batchesList: batches, rowsByBatch: grouped, totalOwners: ownersCount.length };
  });

  return (
    <main>
      <p>
        <Link href="/">← Dashboard</Link>
      </p>
      <h1>Migración — Propietarios</h1>
      <p>
        <small>
          Spec, sección 16 (Hito 7). Importador CSV genérico configurable — no hay layout oficial
          de SGA todavía (docs/open-decisions.md, ítem 8), así que las columnas esperadas son
          genéricas: <code>display_name</code>, <code>legal_name</code>, <code>party_type</code>,{" "}
          <code>document_type</code>, <code>document_number</code>, <code>legacy_sga_code</code>.
          Subir un CSV solo lo valida (sección 16.1: conciliar antes de confirmar) — nada se crea
          hasta confirmar el lote, y solo se importan las filas válidas.
        </small>
      </p>
      <div className="stat-grid">
        <div className="stat stat--accent">
          <div className="stat-label">Control de migración (16.3)</div>
          <div className="stat-value">{totalOwners}</div>
          <div className="stat-sub">propietario(s) en total en esta organización</div>
        </div>
      </div>

      {error && (
        <p>
          <strong>No se pudo procesar:</strong> {error}
        </p>
      )}

      {canCreate && (
        <>
          <h2>Subir CSV de propietarios</h2>
          <form action={uploadOwnerImportBatchAction} encType="multipart/form-data">
            <div>
              <label>
                Archivo CSV <input type="file" name="file" accept=".csv,text/csv" required />
              </label>
            </div>
            <button type="submit">Validar</button>
          </form>
        </>
      )}

      <h2>Lotes</h2>
      {batchesList.length === 0 ? (
        <p>Todavía no se cargó ningún lote.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Archivo</th>
              <th>Fecha</th>
              <th>Total</th>
              <th>Válidas</th>
              <th>Inválidas</th>
              <th>Importadas</th>
              <th>Estado</th>
              {canCommit && <th></th>}
            </tr>
          </thead>
          <tbody>
            {batchesList.map((batch) => (
              <tr key={batch.id}>
                <td>{batch.sourceFilename ?? "—"}</td>
                <td>{batch.createdAt.toISOString().slice(0, 16).replace("T", " ")}</td>
                <td>{batch.totalRows}</td>
                <td>{batch.validRowCount}</td>
                <td>{batch.invalidRowCount}</td>
                <td>{batch.importedRowCount}</td>
                <td>
                  <span className={`badge ${batchStatusBadgeClass(batch.status)}`}>{batch.status}</span>
                </td>
                {canCommit && (
                  <td>
                    {batch.status === "validated" && batch.validRowCount > 0 && (
                      <form action={commitOwnerImportBatchAction} style={{ display: "inline" }}>
                        <input type="hidden" name="batchId" value={batch.id} />
                        <button type="submit">Confirmar lote</button>
                      </form>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {batchesList.some((b) => (rowsByBatch.get(b.id)?.length ?? 0) > 0) && (
        <>
          <h2>Filas con errores</h2>
          {batchesList.map((batch) => {
            const invalidRows = rowsByBatch.get(batch.id) ?? [];
            if (invalidRows.length === 0) return null;
            return (
              <div key={batch.id}>
                <p>
                  <strong>{batch.sourceFilename ?? batch.id}</strong>
                </p>
                <table>
                  <thead>
                    <tr>
                      <th>Fila</th>
                      <th>Datos</th>
                      <th>Errores</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invalidRows.map((row) => (
                      <tr key={row.id}>
                        <td>{row.rowNumber}</td>
                        <td>{JSON.stringify(row.rawData)}</td>
                        <td>{(row.errors as string[] | null)?.join("; ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </>
      )}
    </main>
  );
}
