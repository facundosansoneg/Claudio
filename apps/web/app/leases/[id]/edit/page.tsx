import Link from "next/link";
import { eq } from "drizzle-orm";
import { withOrganizationContext, leases } from "@farfalla/database";
import { getDb } from "@/lib/db";
import { getCurrentUserContext } from "@/lib/current-user";
import { hasPermission } from "@/lib/require-permission";
import { updateLeaseAction } from "../../actions";

export default async function EditLeasePage({ params }: { params: Promise<{ id: string }> }) {
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

  const allowed = await hasPermission(context, "lease", "edit");
  if (!allowed) {
    return (
      <main>
        <p>No tenés permiso para editar contratos.</p>
      </main>
    );
  }

  const [lease] = await withOrganizationContext(getDb(), context.organizationId, (tx) =>
    tx.select().from(leases).where(eq(leases.id, id)),
  );

  if (!lease) {
    return (
      <main>
        <p>
          Contrato no encontrado. <Link href="/leases">Volver</Link>
        </p>
      </main>
    );
  }

  return (
    <main>
      <p>
        <Link href="/leases">← Contratos</Link>
      </p>
      <h1>Editar contrato</h1>
      <form action={updateLeaseAction}>
        <input type="hidden" name="leaseId" value={lease.id} />
        <div>
          <label>
            Número de contrato <input name="leaseNumber" defaultValue={lease.leaseNumber} required />
          </label>
        </div>
        <div>
          <label>
            Inicio <input type="date" name="startDate" defaultValue={lease.startDate} required />
          </label>
        </div>
        <div>
          <label>
            Fin <input type="date" name="endDate" defaultValue={lease.endDate} required />
          </label>
        </div>
        <div>
          <label>
            Moneda{" "}
            <select name="currency" defaultValue={lease.currency}>
              <option value="UYU">UYU</option>
              <option value="USD">USD</option>
            </select>
          </label>
        </div>
        <div>
          <label>
            Alquiler{" "}
            <input name="initialRent" type="number" step="0.000001" defaultValue={lease.initialRent} required />
          </label>
        </div>
        <div>
          <label>
            Estado{" "}
            <select name="status" defaultValue={lease.status}>
              <option value="draft">Borrador</option>
              <option value="active">Activo</option>
              <option value="terminated">Rescindido</option>
              <option value="expired">Vencido</option>
            </select>
          </label>
        </div>
        <div>
          <label>
            % Comisión negociada (opcional, sin IVA/mínimo/máximo){" "}
            <input
              name="commissionOnRentPercentage"
              type="number"
              step="0.00000001"
              defaultValue={lease.commissionOnRentPercentage ?? ""}
            />
          </label>
        </div>
        <div>
          <label>
            Código de concepto de comisión (opcional — usa el catálogo en vez
            de la negociación puntual){" "}
            <input name="commissionConceptCode" defaultValue={lease.commissionConceptCode ?? ""} />
          </label>
        </div>
        <p>
          <small>
            Si se completa el código de concepto, la comisión se calcula desde{" "}
            <a href="/commission-concepts">Conceptos de comisión</a> (con su IVA, mínimo y
            máximo) y se ignora el porcentaje negociado de arriba.
          </small>
        </p>
        <button type="submit">Guardar</button>
      </form>
    </main>
  );
}
