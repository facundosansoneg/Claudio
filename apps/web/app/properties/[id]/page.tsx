import Link from "next/link";
import { eq } from "drizzle-orm";
import { withOrganizationContext, properties, ownershipInterests, owners, parties } from "@farfalla/database";
import { getDb } from "@/lib/db";
import { getCurrentUserContext } from "@/lib/current-user";
import { hasPermission } from "@/lib/require-permission";
import { createOwnershipInterestAction } from "./actions";

export default async function PropertyDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
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
    hasPermission(context, "ownership_interest", "view"),
    hasPermission(context, "ownership_interest", "create"),
  ]);

  if (!canView) {
    return (
      <main>
        <p>No tenés permiso para ver participaciones.</p>
      </main>
    );
  }

  const data = await withOrganizationContext(getDb(), context.organizationId, async (tx) => {
    const [property] = await tx.select().from(properties).where(eq(properties.id, id));
    if (!property) return null;

    const interests = await tx
      .select({
        id: ownershipInterests.id,
        ownerId: ownershipInterests.ownerId,
        ownerName: parties.displayName,
        legalPercentage: ownershipInterests.legalPercentage,
        economicPercentage: ownershipInterests.economicPercentage,
        rentDistributionPercentage: ownershipInterests.rentDistributionPercentage,
        taxContributionPercentage: ownershipInterests.taxContributionPercentage,
        validFrom: ownershipInterests.validFrom,
        validTo: ownershipInterests.validTo,
      })
      .from(ownershipInterests)
      .innerJoin(owners, eq(owners.id, ownershipInterests.ownerId))
      .innerJoin(parties, eq(parties.id, owners.partyId))
      .where(eq(ownershipInterests.propertyId, id));

    const ownersList = await tx
      .select({ id: owners.id, displayName: parties.displayName })
      .from(owners)
      .innerJoin(parties, eq(parties.id, owners.partyId));

    return { property, interests, ownersList };
  });

  if (!data) {
    return (
      <main>
        <p>
          Propiedad no encontrada. <Link href="/properties">Volver</Link>
        </p>
      </main>
    );
  }

  const { property, interests, ownersList } = data;

  return (
    <main>
      <p>
        <Link href="/properties">← Propiedades</Link>
      </p>
      <h1>{property.name}</h1>
      <p>
        {property.internalCode} — {property.street} {property.doorNumber}, {property.city}
      </p>

      {error && (
        <p>
          <strong>No se pudo guardar:</strong> {error}
        </p>
      )}

      <h2>Participaciones</h2>
      {interests.length === 0 ? (
        <p>Esta propiedad todavía no tiene propietarios asignados.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Propietario</th>
              <th>Legal</th>
              <th>Económica</th>
              <th>Renta</th>
              <th>Fiscal</th>
              <th>Vigencia</th>
            </tr>
          </thead>
          <tbody>
            {interests.map((interest) => (
              <tr key={interest.id}>
                <td>{interest.ownerName}</td>
                <td>{interest.legalPercentage}%</td>
                <td>{interest.economicPercentage}%</td>
                <td>{interest.rentDistributionPercentage}%</td>
                <td>{interest.taxContributionPercentage}%</td>
                <td>
                  {interest.validFrom} — {interest.validTo ?? "vigente"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {canCreate && (
        <>
          <h2>Asignar propietario</h2>
          {ownersList.length === 0 ? (
            <p>
              Hace falta al menos un <Link href="/owners">propietario</Link> cargado.
            </p>
          ) : (
            <form action={createOwnershipInterestAction}>
              <input type="hidden" name="propertyId" value={property.id} />
              <div>
                <label>
                  Propietario{" "}
                  <select name="ownerId" required>
                    {ownersList.map((owner) => (
                      <option key={owner.id} value={owner.id}>
                        {owner.displayName}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div>
                <label>
                  % Legal{" "}
                  <input name="legalPercentage" type="number" step="0.00000001" min="0" max="100" required />
                </label>
              </div>
              <div>
                <label>
                  % Económica{" "}
                  <input name="economicPercentage" type="number" step="0.00000001" min="0" max="100" required />
                </label>
              </div>
              <div>
                <label>
                  % Distribución de renta{" "}
                  <input
                    name="rentDistributionPercentage"
                    type="number"
                    step="0.00000001"
                    min="0"
                    max="100"
                    required
                  />
                </label>
              </div>
              <div>
                <label>
                  % Aporte fiscal{" "}
                  <input
                    name="taxContributionPercentage"
                    type="number"
                    step="0.00000001"
                    min="0"
                    max="100"
                    required
                  />
                </label>
              </div>
              <div>
                <label>
                  Vigente desde <input type="date" name="validFrom" required />
                </label>
              </div>
              <div>
                <label>
                  Vigente hasta (opcional) <input type="date" name="validTo" />
                </label>
              </div>
              <button type="submit">Asignar</button>
              <p>
                <small>
                  Cada porcentaje debe sumar 100% entre todos los propietarios vigentes en la
                  misma fecha — se valida al guardar.
                </small>
              </p>
            </form>
          )}
        </>
      )}
    </main>
  );
}
