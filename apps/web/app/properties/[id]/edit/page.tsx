import Link from "next/link";
import { eq } from "drizzle-orm";
import { withOrganizationContext, properties } from "@farfalla/database";
import { getDb } from "@/lib/db";
import { getCurrentUserContext } from "@/lib/current-user";
import { hasPermission } from "@/lib/require-permission";
import { updatePropertyAction } from "../../actions";

export default async function EditPropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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

  const allowed = await hasPermission(context, "property", "edit");
  if (!allowed) {
    return (
      <main>
        <p>No tenés permiso para editar propiedades.</p>
      </main>
    );
  }

  const [property] = await withOrganizationContext(getDb(), context.organizationId, (tx) =>
    tx.select().from(properties).where(eq(properties.id, id)),
  );

  if (!property) {
    return (
      <main>
        <p>
          Propiedad no encontrada. <Link href="/properties">Volver</Link>
        </p>
      </main>
    );
  }

  return (
    <main>
      <p>
        <Link href="/properties">← Propiedades</Link>
      </p>
      <h1>Editar propiedad</h1>
      <form action={updatePropertyAction}>
        <input type="hidden" name="propertyId" value={property.id} />
        <div>
          <label>
            Código interno <input name="internalCode" defaultValue={property.internalCode} required />
          </label>
        </div>
        <div>
          <label>
            Nombre <input name="name" defaultValue={property.name} required />
          </label>
        </div>
        <div>
          <label>
            Tipo{" "}
            <select name="propertyType" defaultValue={property.propertyType}>
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
            Padrón <input name="cadastralNumber" defaultValue={property.cadastralNumber ?? ""} />
          </label>
        </div>
        <div>
          <label>
            Calle <input name="street" defaultValue={property.street ?? ""} />
          </label>
        </div>
        <div>
          <label>
            Puerta <input name="doorNumber" defaultValue={property.doorNumber ?? ""} />
          </label>
        </div>
        <div>
          <label>
            Barrio <input name="neighborhood" defaultValue={property.neighborhood ?? ""} />
          </label>
        </div>
        <div>
          <label>
            Ciudad <input name="city" defaultValue={property.city ?? ""} />
          </label>
        </div>
        <div>
          <label>
            Departamento <input name="department" defaultValue={property.department ?? ""} />
          </label>
        </div>
        <div>
          <label>
            Moneda de referencia{" "}
            <select name="referenceCurrency" defaultValue={property.referenceCurrency}>
              <option value="UYU">UYU</option>
              <option value="USD">USD</option>
            </select>
          </label>
        </div>
        <button type="submit">Guardar</button>
      </form>
    </main>
  );
}
