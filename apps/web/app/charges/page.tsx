import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import {
  withOrganizationContext,
  charges,
  leases,
  units,
  properties,
  parties,
  leaseParties,
  journalEntries,
} from "@farfalla/database";
import { getDb } from "@/lib/db";
import { getCurrentUserContext } from "@/lib/current-user";
import { hasPermission } from "@/lib/require-permission";
import { generateChargeAction, collectChargeAction, distributeChargeAction } from "./actions";

export default async function ChargesPage() {
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

  const [canView, canCreate, canCollect, canDistribute] = await Promise.all([
    hasPermission(context, "charge", "view"),
    hasPermission(context, "charge", "create"),
    hasPermission(context, "payment", "create"),
    hasPermission(context, "charge", "distribute"),
  ]);

  if (!canView) {
    return (
      <main>
        <p>No tenés permiso para ver cargos.</p>
      </main>
    );
  }

  const [chargesList, availableLeases, distributedChargeIds] = await withOrganizationContext(
    getDb(),
    context.organizationId,
    async (tx) => {
      const list = await tx
        .select({
          id: charges.id,
          period: charges.period,
          dueDate: charges.dueDate,
          currency: charges.currency,
          originalAmount: charges.originalAmount,
          balance: charges.balance,
          status: charges.status,
          leaseNumber: leases.leaseNumber,
          unitCode: units.unitCode,
          propertyName: properties.name,
          tenantName: parties.displayName,
        })
        .from(charges)
        .innerJoin(leases, eq(leases.id, charges.leaseId))
        .innerJoin(units, eq(units.id, leases.unitId))
        .innerJoin(properties, eq(properties.id, units.propertyId))
        .leftJoin(leaseParties, eq(leaseParties.leaseId, leases.id))
        .leftJoin(parties, eq(parties.id, leaseParties.partyId))
        .orderBy(desc(charges.dueDate));

      const leasesList = await tx
        .select({
          id: leases.id,
          leaseNumber: leases.leaseNumber,
          currency: leases.currency,
          initialRent: leases.initialRent,
        })
        .from(leases);

      const distributedRows = await tx
        .select({ sourceDocumentId: journalEntries.sourceDocumentId })
        .from(journalEntries)
        .where(eq(journalEntries.source, "owner_accrual"));

      return [list, leasesList, new Set(distributedRows.map((row) => row.sourceDocumentId))] as const;
    },
  );

  return (
    <main>
      <p>
        <Link href="/">← Dashboard</Link>
      </p>
      <h1>Cargos</h1>

      {chargesList.length === 0 ? (
        <p>Todavía no hay cargos generados.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Período</th>
              <th>Vencimiento</th>
              <th>Contrato</th>
              <th>Inquilino</th>
              <th>Importe</th>
              <th>Saldo</th>
              <th>Estado</th>
              {(canCollect || canDistribute) && <th></th>}
            </tr>
          </thead>
          <tbody>
            {chargesList.map((charge) => {
              const isDistributed = distributedChargeIds.has(charge.id);
              return (
                <tr key={charge.id}>
                  <td>{charge.period}</td>
                  <td>{charge.dueDate}</td>
                  <td>
                    {charge.leaseNumber} ({charge.propertyName}/{charge.unitCode})
                  </td>
                  <td>{charge.tenantName ?? "—"}</td>
                  <td>
                    {charge.originalAmount} {charge.currency}
                  </td>
                  <td>
                    {charge.balance} {charge.currency}
                  </td>
                  <td>{charge.status}</td>
                  {(canCollect || canDistribute) && (
                    <td>
                      {canCollect && (charge.status === "pending" || charge.status === "partially_paid") && (
                        <form action={collectChargeAction} style={{ display: "inline" }}>
                          <input type="hidden" name="chargeId" value={charge.id} />
                          <input type="hidden" name="amount" value={charge.balance} />
                          <button type="submit">Cobrar {charge.balance}</button>
                        </form>
                      )}
                      {canDistribute && charge.status === "paid" && !isDistributed && (
                        <form action={distributeChargeAction} style={{ display: "inline" }}>
                          <input type="hidden" name="chargeId" value={charge.id} />
                          <button type="submit">Liquidar</button>
                        </form>
                      )}
                      {isDistributed && <span>Liquidado</span>}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {canCreate && (
        <>
          <h2>Generar cargo</h2>
          {availableLeases.length === 0 ? (
            <p>
              Hace falta al menos un <Link href="/leases">contrato</Link> cargado antes de generar
              un cargo.
            </p>
          ) : (
            <form action={generateChargeAction}>
              <div>
                <label>
                  Contrato{" "}
                  <select name="leaseId" required>
                    {availableLeases.map((lease) => (
                      <option key={lease.id} value={lease.id}>
                        {lease.leaseNumber} ({lease.initialRent} {lease.currency})
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div>
                <label>
                  Período (AAAA-MM) <input name="period" placeholder="2026-08" required />
                </label>
              </div>
              <div>
                <label>
                  Importe <input name="amount" type="number" step="0.000001" required />
                </label>
              </div>
              <button type="submit">Generar</button>
            </form>
          )}
        </>
      )}
    </main>
  );
}
