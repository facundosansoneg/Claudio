import Link from "next/link";
import { eq } from "drizzle-orm";
import { withOrganizationContext, tenants, parties } from "@farfalla/database";
import { getDb } from "@/lib/db";
import { getCurrentUserContext } from "@/lib/current-user";
import { hasPermission } from "@/lib/require-permission";
import { updateTenantAction } from "../../actions";

export default async function EditTenantPage({ params }: { params: Promise<{ id: string }> }) {
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

  const allowed = await hasPermission(context, "tenant", "edit");
  if (!allowed) {
    return (
      <main>
        <p>No tenés permiso para editar inquilinos.</p>
      </main>
    );
  }

  const record = await withOrganizationContext(getDb(), context.organizationId, async (tx) => {
    const [tenant] = await tx.select().from(tenants).where(eq(tenants.id, id));
    if (!tenant) return null;
    const [party] = await tx.select().from(parties).where(eq(parties.id, tenant.partyId));
    return { tenant, party };
  });

  if (!record?.party) {
    return (
      <main>
        <p>
          Inquilino no encontrado. <Link href="/tenants">Volver</Link>
        </p>
      </main>
    );
  }

  return (
    <main>
      <p>
        <Link href="/tenants">← Inquilinos</Link>
      </p>
      <h1>Editar inquilino</h1>
      <form action={updateTenantAction}>
        <input type="hidden" name="tenantId" value={record.tenant.id} />
        <div>
          <label>
            Nombre <input name="displayName" defaultValue={record.party.displayName} required />
          </label>
        </div>
        <div>
          <label>
            Tipo de documento{" "}
            <input name="documentType" defaultValue={record.party.documentType ?? ""} />
          </label>
        </div>
        <div>
          <label>
            Número de documento{" "}
            <input name="documentNumber" defaultValue={record.party.documentNumber ?? ""} />
          </label>
        </div>
        <div>
          <label>
            Referencia bancaria{" "}
            <input name="bankReference" defaultValue={record.tenant.bankReference ?? ""} />
          </label>
        </div>
        <button type="submit">Guardar</button>
      </form>
    </main>
  );
}
