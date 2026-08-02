import Link from "next/link";
import { eq } from "drizzle-orm";
import { withOrganizationContext, owners, parties } from "@farfalla/database";
import { getDb } from "@/lib/db";
import { getCurrentUserContext } from "@/lib/current-user";
import { hasPermission } from "@/lib/require-permission";
import { updateOwnerAction } from "../../actions";

export default async function EditOwnerPage({ params }: { params: Promise<{ id: string }> }) {
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

  const allowed = await hasPermission(context, "owner", "edit");
  if (!allowed) {
    return (
      <main>
        <p>No tenés permiso para editar propietarios.</p>
      </main>
    );
  }

  const record = await withOrganizationContext(getDb(), context.organizationId, async (tx) => {
    const [owner] = await tx.select().from(owners).where(eq(owners.id, id));
    if (!owner) return null;
    const [party] = await tx.select().from(parties).where(eq(parties.id, owner.partyId));
    return { owner, party };
  });

  if (!record?.party) {
    return (
      <main>
        <p>
          Propietario no encontrado. <Link href="/owners">Volver</Link>
        </p>
      </main>
    );
  }

  return (
    <main>
      <p>
        <Link href="/owners">← Propietarios</Link>
      </p>
      <h1>Editar propietario</h1>
      <form action={updateOwnerAction}>
        <input type="hidden" name="ownerId" value={record.owner.id} />
        <div>
          <label>
            Nombre <input name="displayName" defaultValue={record.party.displayName} required />
          </label>
        </div>
        <div>
          <label>
            Tipo{" "}
            <select name="partyType" defaultValue={record.party.partyType}>
              <option value="person">Persona física</option>
              <option value="company">Sociedad</option>
            </select>
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
            Tipo de liquidación{" "}
            <select name="settlementType" defaultValue={record.owner.settlementType}>
              <option value="normal">Normal</option>
              <option value="group">Grupo</option>
            </select>
          </label>
        </div>
        <button type="submit">Guardar</button>
      </form>
    </main>
  );
}
