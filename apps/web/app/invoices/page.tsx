import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import {
  withOrganizationContext,
  invoices,
  invoiceSeries,
  owners,
  tenants,
  parties,
} from "@farfalla/database";
import { getDb } from "@/lib/db";
import { getCurrentUserContext } from "@/lib/current-user";
import { hasPermission } from "@/lib/require-permission";
import {
  createInvoiceSeriesAction,
  createManualInvoiceDraftAction,
  confirmManualInvoiceAction,
} from "./actions";

export default async function InvoicesPage() {
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

  const [canView, canCreateSeries, canCreate, canConfirm] = await Promise.all([
    hasPermission(context, "invoice", "view"),
    hasPermission(context, "invoice_series", "create"),
    hasPermission(context, "invoice", "create"),
    hasPermission(context, "invoice", "confirm"),
  ]);

  if (!canView) {
    return (
      <main>
        <p>No tenés permiso para ver facturas.</p>
      </main>
    );
  }

  const { invoicesList, seriesList, ownersList, tenantsList } = await withOrganizationContext(
    getDb(),
    context.organizationId,
    async (tx) => {
      const invoicesRows = await tx
        .select({
          id: invoices.id,
          number: invoices.number,
          documentType: invoices.documentType,
          description: invoices.description,
          currency: invoices.currency,
          amount: invoices.amount,
          discountPercentage: invoices.discountPercentage,
          hasVat: invoices.hasVat,
          vatAmount: invoices.vatAmount,
          totalAmount: invoices.totalAmount,
          status: invoices.status,
          issueDate: invoices.issueDate,
          ownerName: parties.displayName,
        })
        .from(invoices)
        .leftJoin(owners, eq(owners.id, invoices.ownerId))
        .leftJoin(parties, eq(parties.id, owners.partyId))
        .orderBy(desc(invoices.createdAt));

      const seriesRows = await tx.select().from(invoiceSeries).orderBy(desc(invoiceSeries.createdAt));

      const ownersRows = await tx
        .select({ id: owners.id, displayName: parties.displayName })
        .from(owners)
        .innerJoin(parties, eq(parties.id, owners.partyId));

      const tenantsRows = await tx
        .select({ id: tenants.id, displayName: parties.displayName })
        .from(tenants)
        .innerJoin(parties, eq(parties.id, tenants.partyId));

      return { invoicesList: invoicesRows, seriesList: seriesRows, ownersList: ownersRows, tenantsList: tenantsRows };
    },
  );

  const today = new Date().toISOString().slice(0, 10);

  return (
    <main>
      <p>
        <Link href="/">← Dashboard</Link>
      </p>
      <h1>Facturación manual</h1>
      <p>
        <small>
          Alta en borrador y confirmación con numeración secuencial por serie (spec, INV-001).
          Una factura confirmada no se edita — corregirla es un tramo posterior (notas de crédito
          y débito, INV-003).
        </small>
      </p>

      {invoicesList.length === 0 ? (
        <p>Todavía no hay facturas cargadas.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Número</th>
              <th>Tipo</th>
              <th>Descripción</th>
              <th>Propietario</th>
              <th>Importe</th>
              <th>Descuento</th>
              <th>IVA</th>
              <th>Total</th>
              <th>Estado</th>
              {canConfirm && <th></th>}
            </tr>
          </thead>
          <tbody>
            {invoicesList.map((invoice) => (
              <tr key={invoice.id}>
                <td>{invoice.number ?? "(sin confirmar)"}</td>
                <td>{invoice.documentType}</td>
                <td>{invoice.description}</td>
                <td>{invoice.ownerName ?? "—"}</td>
                <td>
                  {invoice.amount} {invoice.currency}
                </td>
                <td>{invoice.discountPercentage ? `${invoice.discountPercentage}%` : "—"}</td>
                <td>{invoice.vatAmount ?? (invoice.hasVat ? "(al confirmar)" : "—")}</td>
                <td>{invoice.totalAmount ?? "—"}</td>
                <td>{invoice.status}</td>
                {canConfirm && (
                  <td>
                    {invoice.status === "draft" && (
                      <form action={confirmManualInvoiceAction} style={{ display: "inline" }}>
                        <input type="hidden" name="invoiceId" value={invoice.id} />
                        <input type="hidden" name="issueDate" value={today} />
                        <button type="submit">Confirmar ({today})</button>
                      </form>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>Series de numeración</h2>
      {seriesList.length === 0 ? (
        <p>Todavía no hay series cargadas — hace falta al menos una para poder confirmar facturas.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Código</th>
              <th>Nombre</th>
              <th>Prefijo</th>
              <th>Próximo número</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {seriesList.map((series) => (
              <tr key={series.id}>
                <td>{series.code}</td>
                <td>{series.name}</td>
                <td>{series.prefix}</td>
                <td>{series.nextNumber}</td>
                <td>{series.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {canCreateSeries && (
        <form action={createInvoiceSeriesAction}>
          <div>
            <label>
              Código <input name="code" required />
            </label>
          </div>
          <div>
            <label>
              Nombre <input name="name" required />
            </label>
          </div>
          <div>
            <label>
              Prefijo <input name="prefix" required />
            </label>
          </div>
          <button type="submit">Crear serie</button>
        </form>
      )}

      {canCreate && (
        <>
          <h2>Nueva factura (borrador)</h2>
          {seriesList.length === 0 ? (
            <p>Hace falta al menos una serie de numeración antes de cargar una factura.</p>
          ) : (
            <form action={createManualInvoiceDraftAction}>
              <div>
                <label>
                  Serie{" "}
                  <select name="seriesId" required>
                    {seriesList.map((series) => (
                      <option key={series.id} value={series.id}>
                        {series.code} — {series.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div>
                <label>
                  Tipo de documento <input name="documentType" placeholder="honorarios, resguardo..." required />
                </label>
              </div>
              <div>
                <label>
                  Propietario (opcional){" "}
                  <select name="ownerId" defaultValue="">
                    <option value="">—</option>
                    {ownersList.map((owner) => (
                      <option key={owner.id} value={owner.id}>
                        {owner.displayName}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div>
                <label>
                  Inquilino (opcional){" "}
                  <select name="tenantId" defaultValue="">
                    <option value="">—</option>
                    {tenantsList.map((tenant) => (
                      <option key={tenant.id} value={tenant.id}>
                        {tenant.displayName}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div>
                <label>
                  Descripción <input name="description" required />
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
              <div>
                <label>
                  Importe <input name="amount" type="number" step="0.000001" required />
                </label>
              </div>
              <div>
                <label>
                  % Descuento (opcional) <input name="discountPercentage" type="number" step="0.00000001" />
                </label>
              </div>
              <div>
                <label>
                  <input name="hasVat" type="checkbox" /> Con IVA
                </label>
              </div>
              <button type="submit">Crear borrador</button>
            </form>
          )}
        </>
      )}
    </main>
  );
}
