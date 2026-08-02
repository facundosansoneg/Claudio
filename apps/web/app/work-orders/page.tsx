import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { withOrganizationContext, workOrders, properties, vendors } from "@farfalla/database";
import { getDb } from "@/lib/db";
import { getCurrentUserContext } from "@/lib/current-user";
import { hasPermission } from "@/lib/require-permission";
import { createWorkOrderAction, updateWorkOrderStatusAction } from "./actions";

const STATUS_LABEL: Record<string, string> = {
  requested: "Solicitada",
  diagnosed: "Diagnosticada",
  budgeted: "Presupuestada",
  approved: "Aprobada",
  in_execution: "En ejecución",
  controlled: "Controlada",
  closed: "Cerrada",
  rejected: "Rechazada",
};

export default async function WorkOrdersPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
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

  const [canView, canCreate, canEdit] = await Promise.all([
    hasPermission(context, "work_order", "view"),
    hasPermission(context, "work_order", "create"),
    hasPermission(context, "work_order", "edit"),
  ]);

  if (!canView) {
    return (
      <main>
        <p>No tenés permiso para ver órdenes de trabajo.</p>
      </main>
    );
  }

  const { workOrdersList, propertiesList, vendorsList } = await withOrganizationContext(
    getDb(),
    context.organizationId,
    async (tx) => {
      const workOrdersRows = await tx
        .select({
          id: workOrders.id,
          title: workOrders.title,
          status: workOrders.status,
          classification: workOrders.classification,
          currency: workOrders.currency,
          estimatedCost: workOrders.estimatedCost,
          actualCost: workOrders.actualCost,
          propertyName: properties.name,
          vendorName: vendors.legalName,
        })
        .from(workOrders)
        .leftJoin(properties, eq(properties.id, workOrders.propertyId))
        .leftJoin(vendors, eq(vendors.id, workOrders.vendorId))
        .orderBy(desc(workOrders.createdAt));

      const propertiesRows = await tx.select({ id: properties.id, name: properties.name }).from(properties);
      const vendorsRows = await tx.select({ id: vendors.id, legalName: vendors.legalName }).from(vendors);

      return { workOrdersList: workOrdersRows, propertiesList: propertiesRows, vendorsList: vendorsRows };
    },
  );

  return (
    <main>
      <p>
        <Link href="/">← Dashboard</Link>
      </p>
      <h1>Órdenes de trabajo</h1>
      <p>
        <small>
          Spec, sección 11.2. Flujo: solicitud → diagnóstico → presupuesto → aprobación →
          ejecución → control → cierre → gasto. Al cerrar se genera el gasto real automáticamente.
          Varios presupuestos, fotos antes/después y SLA quedan para un tramo posterior.
        </small>
      </p>

      {error && (
        <p>
          <strong>No se pudo actualizar:</strong> {error}
        </p>
      )}

      {workOrdersList.length === 0 ? (
        <p>Todavía no hay órdenes de trabajo cargadas.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Título</th>
              <th>Propiedad</th>
              <th>Proveedor</th>
              <th>Clasificación</th>
              <th>Estimado</th>
              <th>Real</th>
              <th>Estado</th>
              {canEdit && <th>Avanzar</th>}
            </tr>
          </thead>
          <tbody>
            {workOrdersList.map((wo) => (
              <tr key={wo.id}>
                <td>{wo.title}</td>
                <td>{wo.propertyName ?? "—"}</td>
                <td>{wo.vendorName ?? "—"}</td>
                <td>{wo.classification}</td>
                <td>{wo.estimatedCost ? `${wo.estimatedCost} ${wo.currency}` : "—"}</td>
                <td>{wo.actualCost ? `${wo.actualCost} ${wo.currency}` : "—"}</td>
                <td>{STATUS_LABEL[wo.status] ?? wo.status}</td>
                {canEdit && (
                  <td>
                    {wo.status === "requested" && (
                      <form action={updateWorkOrderStatusAction} style={{ display: "inline" }}>
                        <input type="hidden" name="workOrderId" value={wo.id} />
                        <input type="hidden" name="newStatus" value="diagnosed" />
                        <button type="submit">Diagnosticar</button>
                      </form>
                    )}
                    {wo.status === "diagnosed" && (
                      <form action={updateWorkOrderStatusAction} style={{ display: "inline" }}>
                        <input type="hidden" name="workOrderId" value={wo.id} />
                        <input type="hidden" name="newStatus" value="budgeted" />
                        <input name="estimatedCost" type="number" step="0.000001" placeholder="Costo estimado" required />
                        <button type="submit">Presupuestar</button>
                      </form>
                    )}
                    {wo.status === "budgeted" && (
                      <>
                        <form action={updateWorkOrderStatusAction} style={{ display: "inline" }}>
                          <input type="hidden" name="workOrderId" value={wo.id} />
                          <input type="hidden" name="newStatus" value="approved" />
                          <button type="submit">Aprobar</button>
                        </form>{" "}
                        <form action={updateWorkOrderStatusAction} style={{ display: "inline" }}>
                          <input type="hidden" name="workOrderId" value={wo.id} />
                          <input type="hidden" name="newStatus" value="rejected" />
                          <button type="submit">Rechazar</button>
                        </form>
                      </>
                    )}
                    {wo.status === "approved" && (
                      <form action={updateWorkOrderStatusAction} style={{ display: "inline" }}>
                        <input type="hidden" name="workOrderId" value={wo.id} />
                        <input type="hidden" name="newStatus" value="in_execution" />
                        <button type="submit">Iniciar ejecución</button>
                      </form>
                    )}
                    {wo.status === "in_execution" && (
                      <form action={updateWorkOrderStatusAction} style={{ display: "inline" }}>
                        <input type="hidden" name="workOrderId" value={wo.id} />
                        <input type="hidden" name="newStatus" value="controlled" />
                        <button type="submit">Controlar</button>
                      </form>
                    )}
                    {wo.status === "controlled" && (
                      <form action={updateWorkOrderStatusAction} style={{ display: "inline" }}>
                        <input type="hidden" name="workOrderId" value={wo.id} />
                        <input type="hidden" name="newStatus" value="closed" />
                        <input name="actualCost" type="number" step="0.000001" placeholder="Costo real" required />
                        <button type="submit">Cerrar (genera gasto)</button>
                      </form>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {canCreate && (
        <>
          <h2>Nueva orden de trabajo</h2>
          <form action={createWorkOrderAction}>
            <div>
              <label>
                Título <input name="title" required />
              </label>
            </div>
            <div>
              <label>
                Descripción <input name="description" />
              </label>
            </div>
            <div>
              <label>
                Propiedad{" "}
                <select name="propertyId" defaultValue="">
                  <option value="">—</option>
                  {propertiesList.map((property) => (
                    <option key={property.id} value={property.id}>
                      {property.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div>
              <label>
                Proveedor{" "}
                <select name="vendorId" defaultValue="">
                  <option value="">—</option>
                  {vendorsList.map((vendor) => (
                    <option key={vendor.id} value={vendor.id}>
                      {vendor.legalName}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div>
              <label>
                Clasificación{" "}
                <select name="classification" defaultValue="opex">
                  <option value="opex">Opex</option>
                  <option value="capex">CapEx</option>
                </select>
              </label>
            </div>
            <div>
              <label>
                Recuperable al inquilino{" "}
                <select name="tenantRecoverable" defaultValue="none">
                  <option value="none">No</option>
                  <option value="full">Total</option>
                  <option value="partial">Parcial</option>
                </select>
              </label>
            </div>
            <div>
              <label>
                Moneda{" "}
                <select name="currency" defaultValue="UYU">
                  <option value="UYU">UYU</option>
                  <option value="USD">USD</option>
                </select>
              </label>
            </div>
            <button type="submit">Crear orden de trabajo</button>
          </form>
        </>
      )}
    </main>
  );
}
