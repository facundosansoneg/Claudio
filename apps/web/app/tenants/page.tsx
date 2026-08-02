import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { withOrganizationContext, tenants, parties } from "@farfalla/database";
import { getDb } from "@/lib/db";
import { getCurrentUserContext } from "@/lib/current-user";
import { hasPermission } from "@/lib/require-permission";
import { createTenantAction } from "./actions";

export default async function TenantsPage() {
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
    hasPermission(context, "tenant", "view"),
    hasPermission(context, "tenant", "create"),
    hasPermission(context, "tenant", "edit"),
  ]);

  if (!canView) {
    return (
      <main>
        <p>No tenés permiso para ver inquilinos.</p>
      </main>
    );
  }

  const tenantsList = await withOrganizationContext(getDb(), context.organizationId, (tx) =>
    tx
      .select({
        id: tenants.id,
        displayName: parties.displayName,
        documentNumber: parties.documentNumber,
        status: tenants.status,
      })
      .from(tenants)
      .innerJoin(parties, eq(parties.id, tenants.partyId))
      .orderBy(desc(tenants.createdAt)),
  );

  return (
    <main>
      <p>
        <Link href="/">← Dashboard</Link>
      </p>
      <h1>Inquilinos</h1>

      {tenantsList.length === 0 ? (
        <p>Todavía no hay inquilinos cargados.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Documento</th>
              <th>Estado</th>
              {canEdit && <th></th>}
            </tr>
          </thead>
          <tbody>
            {tenantsList.map((tenant) => (
              <tr key={tenant.id}>
                <td>{tenant.displayName}</td>
                <td>{tenant.documentNumber ?? "—"}</td>
                <td>{tenant.status}</td>
                {canEdit && (
                  <td>
                    <Link href={`/tenants/${tenant.id}/edit`}>Editar</Link>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {canCreate && (
        <>
          <h2>Nuevo inquilino</h2>
          <form action={createTenantAction}>
            <div>
              <label>
                Nombre <input name="displayName" required />
              </label>
            </div>
            <div>
              <label>
                Tipo de documento <input name="documentType" placeholder="CI, RUT..." />
              </label>
            </div>
            <div>
              <label>
                Número de documento <input name="documentNumber" />
              </label>
            </div>
            <div>
              <label>
                Referencia bancaria <input name="bankReference" />
              </label>
            </div>
            <button type="submit">Crear</button>
          </form>
        </>
      )}
    </main>
  );
}
