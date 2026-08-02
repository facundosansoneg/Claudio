import Link from "next/link";
import { desc } from "drizzle-orm";
import { withOrganizationContext, vendors } from "@farfalla/database";
import { getDb } from "@/lib/db";
import { getCurrentUserContext } from "@/lib/current-user";
import { hasPermission } from "@/lib/require-permission";
import { createVendorAction } from "./actions";

export default async function VendorsPage() {
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

  const [canView, canCreate] = await Promise.all([
    hasPermission(context, "vendor", "view"),
    hasPermission(context, "vendor", "create"),
  ]);

  if (!canView) {
    return (
      <main>
        <p>No tenés permiso para ver proveedores.</p>
      </main>
    );
  }

  const vendorsList = await withOrganizationContext(getDb(), context.organizationId, (tx) =>
    tx.select().from(vendors).orderBy(desc(vendors.createdAt)),
  );

  return (
    <main>
      <p>
        <Link href="/">← Dashboard</Link>
      </p>
      <h1>Proveedores</h1>
      <p>
        <small>Spec, sección 11.3. El historial de trabajos se ve desde las órdenes de trabajo de cada proveedor.</small>
      </p>

      {vendorsList.length === 0 ? (
        <p>Todavía no hay proveedores cargados.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Razón social</th>
              <th>Rubro</th>
              <th>Contacto</th>
              <th>Evaluación</th>
              <th>Seguro vence</th>
            </tr>
          </thead>
          <tbody>
            {vendorsList.map((vendor) => (
              <tr key={vendor.id}>
                <td>{vendor.legalName}</td>
                <td>{vendor.category ?? "—"}</td>
                <td>
                  {vendor.contactName ?? "—"} {vendor.email ? `(${vendor.email})` : ""}
                </td>
                <td>{vendor.rating ? `${vendor.rating}/5` : "—"}</td>
                <td>{vendor.insuranceExpiryDate ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {canCreate && (
        <>
          <h2>Nuevo proveedor</h2>
          <form action={createVendorAction}>
            <div>
              <label>
                Razón social <input name="legalName" required />
              </label>
            </div>
            <div>
              <label>
                Documento (RUT) <input name="taxId" />
              </label>
            </div>
            <div>
              <label>
                Rubro <input name="category" placeholder="Plomería, electricidad, jardinería..." />
              </label>
            </div>
            <div>
              <label>
                Contacto <input name="contactName" />
              </label>
            </div>
            <div>
              <label>
                Email <input name="email" type="email" />
              </label>
            </div>
            <div>
              <label>
                Teléfono <input name="phone" />
              </label>
            </div>
            <div>
              <label>
                Cuenta bancaria <input name="bankAccountInfo" />
              </label>
            </div>
            <div>
              <label>
                Evaluación (1-5) <input name="rating" type="number" min="1" max="5" />
              </label>
            </div>
            <div>
              <label>
                Referencia de seguro <input name="insuranceReference" />
              </label>
            </div>
            <div>
              <label>
                Vencimiento del seguro <input type="date" name="insuranceExpiryDate" />
              </label>
            </div>
            <button type="submit">Crear proveedor</button>
          </form>
        </>
      )}
    </main>
  );
}
