import Link from "next/link";
import { desc } from "drizzle-orm";
import { withOrganizationContext, properties } from "@farfalla/database";
import { getDb } from "@/lib/db";
import { getCurrentUserContext } from "@/lib/current-user";
import { hasPermission } from "@/lib/require-permission";
import { createPropertyAction } from "./actions";

export default async function PropertiesPage() {
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
    hasPermission(context, "property", "view"),
    hasPermission(context, "property", "create"),
    hasPermission(context, "property", "edit"),
  ]);

  if (!canView) {
    return (
      <main>
        <p>No tenés permiso para ver propiedades.</p>
      </main>
    );
  }

  const propertiesList = await withOrganizationContext(getDb(), context.organizationId, (tx) =>
    tx
      .select({
        id: properties.id,
        internalCode: properties.internalCode,
        name: properties.name,
        propertyType: properties.propertyType,
        city: properties.city,
        occupancyStatus: properties.occupancyStatus,
      })
      .from(properties)
      .orderBy(desc(properties.createdAt)),
  );

  return (
    <main>
      <p>
        <Link href="/">← Dashboard</Link>
      </p>
      <h1>Propiedades</h1>

      {propertiesList.length === 0 ? (
        <p>Todavía no hay propiedades cargadas.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Código</th>
              <th>Nombre</th>
              <th>Tipo</th>
              <th>Ciudad</th>
              <th>Ocupación</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {propertiesList.map((property) => (
              <tr key={property.id}>
                <td>{property.internalCode}</td>
                <td>{property.name}</td>
                <td>{property.propertyType}</td>
                <td>{property.city ?? "—"}</td>
                <td>{property.occupancyStatus}</td>
                <td>
                  <Link href={`/properties/${property.id}`}>Participaciones</Link>
                  {canEdit && (
                    <>
                      {" · "}
                      <Link href={`/properties/${property.id}/edit`}>Editar</Link>
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
          <h2>Nueva propiedad</h2>
          <form action={createPropertyAction}>
            <div>
              <label>
                Código interno <input name="internalCode" required />
              </label>
            </div>
            <div>
              <label>
                Nombre <input name="name" required />
              </label>
            </div>
            <div>
              <label>
                Tipo{" "}
                <select name="propertyType" defaultValue="apartamento">
                  <option value="apartamento">Apartamento</option>
                  <option value="casa">Casa</option>
                  <option value="local">Local</option>
                  <option value="terreno">Terreno</option>
                  <option value="otro">Otro</option>
                </select>
              </label>
            </div>
            <div>
              <label>
                Padrón <input name="cadastralNumber" />
              </label>
            </div>
            <div>
              <label>
                Calle <input name="street" />
              </label>
            </div>
            <div>
              <label>
                Puerta <input name="doorNumber" />
              </label>
            </div>
            <div>
              <label>
                Barrio <input name="neighborhood" />
              </label>
            </div>
            <div>
              <label>
                Ciudad <input name="city" />
              </label>
            </div>
            <div>
              <label>
                Departamento <input name="department" />
              </label>
            </div>
            <div>
              <label>
                Moneda de referencia{" "}
                <select name="referenceCurrency" defaultValue="UYU">
                  <option value="UYU">UYU</option>
                  <option value="USD">USD</option>
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
