import Link from "next/link";
import { eq } from "drizzle-orm";
import { withOrganizationContext, owners, parties, taxProfiles } from "@farfalla/database";
import { getOwnerStatement } from "@farfalla/domain";
import { getDb } from "@/lib/db";
import { getCurrentUserContext } from "@/lib/current-user";
import { hasPermission } from "@/lib/require-permission";
import { createTaxProfileAction } from "./actions";

export default async function OwnerDetailPage({ params }: { params: Promise<{ id: string }> }) {
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

  const [canViewOwner, canViewTax, canCreateTax, canViewStatement] = await Promise.all([
    hasPermission(context, "owner", "view"),
    hasPermission(context, "tax_profile", "view"),
    hasPermission(context, "tax_profile", "create"),
    hasPermission(context, "owner_statement", "view"),
  ]);

  if (!canViewOwner) {
    return (
      <main>
        <p>No tenés permiso para ver propietarios.</p>
      </main>
    );
  }

  const data = await withOrganizationContext(getDb(), context.organizationId, async (tx) => {
    const [owner] = await tx.select().from(owners).where(eq(owners.id, id));
    if (!owner) return null;
    const [party] = await tx.select().from(parties).where(eq(parties.id, owner.partyId));
    const profiles = await tx.select().from(taxProfiles).where(eq(taxProfiles.ownerId, id));
    return { owner, party, profiles };
  });

  if (!data?.party) {
    return (
      <main>
        <p>
          Propietario no encontrado. <Link href="/owners">Volver</Link>
        </p>
      </main>
    );
  }

  const statement = canViewStatement ? await getOwnerStatement(getDb(), context.organizationId, id) : null;

  return (
    <main>
      <p>
        <Link href="/owners">← Propietarios</Link>
      </p>
      <h1>{data.party.displayName}</h1>
      <p>
        {data.party.documentType} {data.party.documentNumber} — tipo de liquidación:{" "}
        {data.owner.settlementType}
      </p>

      {canViewStatement && statement && (
        <>
          <h2>Estado de cuenta</h2>
          {statement.balances.length === 0 ? (
            <p>
              <strong>Saldo disponible: 0.000000</strong>
            </p>
          ) : (
            <p>
              <strong>
                Saldo disponible:{" "}
                {statement.balances.map((b) => `${b.balance} ${b.currency}`).join(" · ")}
              </strong>
            </p>
          )}
          {statement.movements.length === 0 ? (
            <p>Todavía no hay movimientos.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Concepto</th>
                  <th>Moneda</th>
                  <th>Debe</th>
                  <th>Haber</th>
                </tr>
              </thead>
              <tbody>
                {statement.movements.map((movement, index) => (
                  <tr key={index}>
                    <td>{movement.date}</td>
                    <td>{movement.description ?? movement.source}</td>
                    <td>{movement.currency}</td>
                    <td>{movement.debit}</td>
                    <td>{movement.credit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {canViewTax && (
        <>
          <h2>Perfil fiscal</h2>
          {data.profiles.length === 0 ? (
            <p>Sin perfil fiscal asignado — no se retiene nada hasta que exista uno vigente.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Tasa</th>
                  <th>Residencia</th>
                  <th>Vigencia</th>
                </tr>
              </thead>
              <tbody>
                {data.profiles.map((profile) => (
                  <tr key={profile.id}>
                    <td>{profile.taxType.toUpperCase()}</td>
                    <td>{profile.percentage}%</td>
                    <td>{profile.taxResidency ?? "—"}</td>
                    <td>
                      {profile.validFrom} — {profile.validTo ?? "vigente"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {canCreateTax && (
            <form action={createTaxProfileAction}>
              <input type="hidden" name="ownerId" value={data.owner.id} />
              <div>
                <label>
                  Tipo{" "}
                  <select name="taxType" defaultValue="irpf">
                    <option value="irpf">IRPF</option>
                    <option value="irnr">IRNR</option>
                  </select>
                </label>
              </div>
              <div>
                <label>
                  Tasa (%) <input name="percentage" type="number" step="0.00000001" required />
                </label>
              </div>
              <div>
                <label>
                  Residencia fiscal <input name="taxResidency" />
                </label>
              </div>
              <div>
                <label>
                  Fundamento/fuente <input name="source" />
                </label>
              </div>
              <div>
                <label>
                  Vigente desde <input type="date" name="validFrom" required />
                </label>
              </div>
              <button type="submit">Asignar</button>
            </form>
          )}
        </>
      )}
    </main>
  );
}
