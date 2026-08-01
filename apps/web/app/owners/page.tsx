import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { withOrganizationContext, owners, parties } from "@farfalla/database";
import { getDb } from "@/lib/db";
import { getCurrentUserContext } from "@/lib/current-user";
import { hasPermission } from "@/lib/require-permission";
import { createOwnerAction } from "./actions";

export default async function OwnersPage() {
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
    hasPermission(context, "owner", "view"),
    hasPermission(context, "owner", "create"),
    hasPermission(context, "owner", "edit"),
  ]);

  if (!canView) {
    return (
      <main>
        <p>No tenés permiso para ver propietarios.</p>
      </main>
    );
  }

  const ownersList = await withOrganizationContext(getDb(), context.organizationId, (tx) =>
    tx
      .select({
        id: owners.id,
        displayName: parties.displayName,
        documentNumber: parties.documentNumber,
        settlementType: owners.settlementType,
        status: owners.status,
      })
      .from(owners)
      .innerJoin(parties, eq(parties.id, owners.partyId))
      .orderBy(desc(owners.createdAt)),
  );

  return (
    <main>
      <p>
        <Link href="/">← Dashboard</Link>
      </p>
      <h1>Propietarios</h1>

      {ownersList.length === 0 ? (
        <p>Todavía no hay propietarios cargados.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Documento</th>
              <th>Tipo de liquidación</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {ownersList.map((owner) => (
              <tr key={owner.id}>
                <td>{owner.displayName}</td>
                <td>{owner.documentNumber ?? "—"}</td>
                <td>{owner.settlementType}</td>
                <td>{owner.status}</td>
                <td>
                  <Link href={`/owners/${owner.id}`}>Estado de cuenta</Link>
                  {canEdit && (
                    <>
                      {" · "}
                      <Link href={`/owners/${owner.id}/edit`}>Editar</Link>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {canCreate && (
        <>
          <h2>Nuevo propietario</h2>
          <form action={createOwnerAction}>
            <div>
              <label>
                Nombre <input name="displayName" required />
              </label>
            </div>
            <div>
              <label>
                Tipo{" "}
                <select name="partyType" defaultValue="person">
                  <option value="person">Persona física</option>
                  <option value="company">Sociedad</option>
                </select>
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
                Tipo de liquidación{" "}
                <select name="settlementType" defaultValue="normal">
                  <option value="normal">Normal</option>
                  <option value="group">Grupo</option>
                </select>
              </label>
            </div>
            <button type="submit">Crear</button>
          </form>
        </>
      )}
    </main>
  );
}
