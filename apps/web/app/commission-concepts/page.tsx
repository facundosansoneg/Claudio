import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import {
  withOrganizationContext,
  commissionConcepts,
  commissionConceptOverrides,
  owners,
  parties,
} from "@farfalla/database";
import { getDb } from "@/lib/db";
import { getCurrentUserContext } from "@/lib/current-user";
import { hasPermission } from "@/lib/require-permission";
import { createCommissionConceptAction, createCommissionConceptOverrideAction } from "./actions";

export default async function CommissionConceptsPage() {
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

  const [canView, canCreate, canOverride] = await Promise.all([
    hasPermission(context, "commission_concept", "view"),
    hasPermission(context, "commission_concept", "create"),
    hasPermission(context, "commission_concept", "override"),
  ]);

  if (!canView) {
    return (
      <main>
        <p>No tenés permiso para ver conceptos de comisión.</p>
      </main>
    );
  }

  const { concepts, overridesByConcept, ownersList } = await withOrganizationContext(
    getDb(),
    context.organizationId,
    async (tx) => {
      const conceptsList = await tx.select().from(commissionConcepts).orderBy(desc(commissionConcepts.createdAt));

      const overrideRows = await tx
        .select({
          id: commissionConceptOverrides.id,
          commissionConceptId: commissionConceptOverrides.commissionConceptId,
          ownerId: commissionConceptOverrides.ownerId,
          ownerName: parties.displayName,
          percentage: commissionConceptOverrides.percentage,
          minAmount: commissionConceptOverrides.minAmount,
          maxAmount: commissionConceptOverrides.maxAmount,
          validFrom: commissionConceptOverrides.validFrom,
          validTo: commissionConceptOverrides.validTo,
        })
        .from(commissionConceptOverrides)
        .innerJoin(owners, eq(owners.id, commissionConceptOverrides.ownerId))
        .innerJoin(parties, eq(parties.id, owners.partyId));

      const byConcept = new Map<string, typeof overrideRows>();
      for (const row of overrideRows) {
        const list = byConcept.get(row.commissionConceptId) ?? [];
        list.push(row);
        byConcept.set(row.commissionConceptId, list);
      }

      const ownersRows = await tx
        .select({ id: owners.id, displayName: parties.displayName })
        .from(owners)
        .innerJoin(parties, eq(parties.id, owners.partyId));

      return { concepts: conceptsList, overridesByConcept: byConcept, ownersList: ownersRows };
    },
  );

  return (
    <main>
      <p>
        <Link href="/">← Dashboard</Link>
      </p>
      <h1>Conceptos de comisión</h1>
      <p>
        <small>
          Catálogo configurable de comisiones (spec, COMM-001) — nunca se hardcodea una tasa de
          comisión: se define acá y opcionalmente se personaliza por propietario (COMM-002).
        </small>
      </p>

      {concepts.length === 0 ? (
        <p>Todavía no hay conceptos de comisión cargados.</p>
      ) : (
        concepts.map((concept) => {
          const overrides = overridesByConcept.get(concept.id) ?? [];
          return (
            <section key={concept.id}>
              <h2>
                {concept.code} — {concept.name}
              </h2>
              <p>
                Destino: {concept.paymentDestination} · Tipo: {concept.conceptType} · {concept.percentage}%
                {concept.minAmount ? ` · mín ${concept.minAmount}` : ""}
                {concept.maxAmount ? ` · máx ${concept.maxAmount}` : ""}
                {concept.hasVat ? " · con IVA" : ""}
                {concept.hasCommissionTax ? " · con impuesto a la comisión" : ""}
              </p>
              <p>
                <small>
                  Vigente desde {concept.validFrom} {concept.validTo ? `hasta ${concept.validTo}` : "(sin fin)"}
                </small>
              </p>

              <h3>Overrides por propietario</h3>
              {overrides.length === 0 ? (
                <p>Sin overrides — todos los propietarios usan el concepto base.</p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Propietario</th>
                      <th>%</th>
                      <th>Mín</th>
                      <th>Máx</th>
                      <th>Vigencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overrides.map((override) => (
                      <tr key={override.id}>
                        <td>{override.ownerName}</td>
                        <td>{override.percentage ?? "(base)"}</td>
                        <td>{override.minAmount ?? "(base)"}</td>
                        <td>{override.maxAmount ?? "(base)"}</td>
                        <td>
                          {override.validFrom} — {override.validTo ?? "vigente"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {canOverride && ownersList.length > 0 && (
                <form action={createCommissionConceptOverrideAction}>
                  <input type="hidden" name="commissionConceptId" value={concept.id} />
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
                      % (vacío = usar el del concepto base) <input name="percentage" type="number" step="0.00000001" />
                    </label>
                  </div>
                  <div>
                    <label>
                      Mínimo (opcional) <input name="minAmount" type="number" step="0.000001" />
                    </label>
                  </div>
                  <div>
                    <label>
                      Máximo (opcional) <input name="maxAmount" type="number" step="0.000001" />
                    </label>
                  </div>
                  <div>
                    <label>
                      Descripción (opcional) <input name="description" />
                    </label>
                  </div>
                  <div>
                    <label>
                      Vigente desde <input type="date" name="validFrom" required />
                    </label>
                  </div>
                  <button type="submit">Agregar override</button>
                </form>
              )}
            </section>
          );
        })
      )}

      {canCreate && (
        <>
          <h2>Nuevo concepto de comisión</h2>
          <form action={createCommissionConceptAction}>
            <div>
              <label>
                Código <input name="code" required />
              </label>
            </div>
            <div>
              <label>
                Nombre <input name="name" required />
              </label>
            </div>
            <div>
              <label>
                Destino del pago{" "}
                <select name="paymentDestination" defaultValue="administration">
                  <option value="administration">Administración</option>
                  <option value="owner">Propietario</option>
                </select>
              </label>
            </div>
            <div>
              <label>
                Tipo{" "}
                <select name="conceptType" defaultValue="owner">
                  <option value="both">Ambos</option>
                  <option value="owner">Propietario</option>
                  <option value="tenant">Inquilino</option>
                  <option value="property">Vivienda</option>
                </select>
              </label>
            </div>
            <div>
              <label>
                Descripción ampliada <input name="description" />
              </label>
            </div>
            <div>
              <label>
                Porcentaje <input name="percentage" type="number" step="0.00000001" required />
              </label>
            </div>
            <div>
              <label>
                Importe mínimo (opcional) <input name="minAmount" type="number" step="0.000001" />
              </label>
            </div>
            <div>
              <label>
                Importe máximo (opcional) <input name="maxAmount" type="number" step="0.000001" />
              </label>
            </div>
            <div>
              <label>
                <input name="hasVat" type="checkbox" /> Con IVA
              </label>
            </div>
            <div>
              <label>
                <input name="hasCommissionTax" type="checkbox" /> Con impuesto a la comisión
              </label>
            </div>
            <div>
              <label>
                Vigente desde <input type="date" name="validFrom" required />
              </label>
            </div>
            <button type="submit">Crear</button>
          </form>
        </>
      )}
    </main>
  );
}
