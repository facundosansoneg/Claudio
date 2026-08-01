import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import {
  withOrganizationContext,
  leases,
  units,
  properties,
  tenants,
  parties,
  leaseParties,
} from "@farfalla/database";
import { getDb } from "@/lib/db";
import { getCurrentUserContext } from "@/lib/current-user";
import { hasPermission } from "@/lib/require-permission";
import { createLeaseAction } from "./actions";

export default async function LeasesPage() {
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
    hasPermission(context, "lease", "view"),
    hasPermission(context, "lease", "create"),
    hasPermission(context, "lease", "edit"),
  ]);

  if (!canView) {
    return (
      <main>
        <p>No tenés permiso para ver contratos.</p>
      </main>
    );
  }

  const [leasesList, availableUnits, availableTenants] = await withOrganizationContext(
    getDb(),
    context.organizationId,
    async (tx) => {
      const list = await tx
        .select({
          id: leases.id,
          leaseNumber: leases.leaseNumber,
          currency: leases.currency,
          initialRent: leases.initialRent,
          status: leases.status,
          unitCode: units.unitCode,
          propertyName: properties.name,
          tenantName: parties.displayName,
        })
        .from(leases)
        .innerJoin(units, eq(units.id, leases.unitId))
        .innerJoin(properties, eq(properties.id, units.propertyId))
        .leftJoin(leaseParties, eq(leaseParties.leaseId, leases.id))
        .leftJoin(parties, eq(parties.id, leaseParties.partyId))
        .orderBy(desc(leases.createdAt));

      const unitsList = await tx
        .select({ id: units.id, unitCode: units.unitCode, propertyName: properties.name })
        .from(units)
        .innerJoin(properties, eq(properties.id, units.propertyId));

      const tenantsList = await tx
        .select({ id: tenants.id, displayName: parties.displayName })
        .from(tenants)
        .innerJoin(parties, eq(parties.id, tenants.partyId));

      return [list, unitsList, tenantsList] as const;
    },
  );

  return (
    <main>
      <p>
        <Link href="/">← Dashboard</Link>
      </p>
      <h1>Contratos</h1>

      {leasesList.length === 0 ? (
        <p>Todavía no hay contratos cargados.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Número</th>
              <th>Propiedad / Unidad</th>
              <th>Inquilino</th>
              <th>Alquiler</th>
              <th>Estado</th>
              {canEdit && <th></th>}
            </tr>
          </thead>
          <tbody>
            {leasesList.map((lease) => (
              <tr key={lease.id}>
                <td>{lease.leaseNumber}</td>
                <td>
                  {lease.propertyName} / {lease.unitCode}
                </td>
                <td>{lease.tenantName ?? "—"}</td>
                <td>
                  {lease.initialRent} {lease.currency}
                </td>
                <td>{lease.status}</td>
                {canEdit && (
                  <td>
                    <Link href={`/leases/${lease.id}/edit`}>Editar</Link>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {canCreate && (
        <>
          <h2>Nuevo contrato</h2>
          {availableUnits.length === 0 || availableTenants.length === 0 ? (
            <p>
              Hace falta al menos una <Link href="/properties">unidad</Link> y un{" "}
              <Link href="/tenants">inquilino</Link> cargados antes de crear un contrato.
            </p>
          ) : (
            <form action={createLeaseAction}>
              <div>
                <label>
                  Unidad{" "}
                  <select name="unitId" required>
                    {availableUnits.map((unit) => (
                      <option key={unit.id} value={unit.id}>
                        {unit.propertyName} / {unit.unitCode}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div>
                <label>
                  Inquilino{" "}
                  <select name="tenantId" required>
                    {availableTenants.map((tenant) => (
                      <option key={tenant.id} value={tenant.id}>
                        {tenant.displayName}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div>
                <label>
                  Número de contrato <input name="leaseNumber" required />
                </label>
              </div>
              <div>
                <label>
                  Inicio <input type="date" name="startDate" required />
                </label>
              </div>
              <div>
                <label>
                  Fin <input type="date" name="endDate" required />
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
                  Alquiler inicial <input name="initialRent" type="number" step="0.000001" required />
                </label>
              </div>
              <button type="submit">Crear</button>
            </form>
          )}
        </>
      )}
    </main>
  );
}
