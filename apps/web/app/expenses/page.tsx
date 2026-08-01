import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import {
  withOrganizationContext,
  expenses,
  allocationRules,
  properties,
  owners,
  parties,
} from "@farfalla/database";
import { getDb } from "@/lib/db";
import { getCurrentUserContext } from "@/lib/current-user";
import { hasPermission } from "@/lib/require-permission";
import { createExpenseAction, createAllocationRuleAction, allocateExpenseAction } from "./actions";

export default async function ExpensesPage() {
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

  const [canView, canCreate, canAllocate, canViewRules, canCreateRules] = await Promise.all([
    hasPermission(context, "expense", "view"),
    hasPermission(context, "expense", "create"),
    hasPermission(context, "expense", "allocate"),
    hasPermission(context, "allocation_rule", "view"),
    hasPermission(context, "allocation_rule", "create"),
  ]);

  if (!canView) {
    return (
      <main>
        <p>No tenés permiso para ver gastos.</p>
      </main>
    );
  }

  const { expensesList, rulesList, propertiesList, ownersList } = await withOrganizationContext(
    getDb(),
    context.organizationId,
    async (tx) => {
      const expensesRows = await tx
        .select({
          id: expenses.id,
          propertyName: properties.name,
          vendorName: expenses.vendorName,
          expenseDate: expenses.expenseDate,
          category: expenses.category,
          classification: expenses.classification,
          currency: expenses.currency,
          amount: expenses.amount,
          allocationStatus: expenses.allocationStatus,
        })
        .from(expenses)
        .innerJoin(properties, eq(properties.id, expenses.propertyId))
        .orderBy(desc(expenses.expenseDate));

      const rulesRows = await tx
        .select({
          id: allocationRules.id,
          propertyName: properties.name,
          category: allocationRules.category,
          driverType: allocationRules.driverType,
          validFrom: allocationRules.validFrom,
          validTo: allocationRules.validTo,
        })
        .from(allocationRules)
        .leftJoin(properties, eq(properties.id, allocationRules.propertyId))
        .orderBy(desc(allocationRules.createdAt));

      const propertiesRows = await tx.select({ id: properties.id, name: properties.name }).from(properties);

      const ownersRows = await tx
        .select({ id: owners.id, displayName: parties.displayName })
        .from(owners)
        .innerJoin(parties, eq(parties.id, owners.partyId));

      return { expensesList: expensesRows, rulesList: rulesRows, propertiesList: propertiesRows, ownersList: ownersRows };
    },
  );

  return (
    <main>
      <p>
        <Link href="/">← Dashboard</Link>
      </p>
      <h1>Gastos y distribución</h1>
      <p>
        <small>
          Distribución entre propietarios según driver configurable (spec, sección 7.9, MOV-004).
          Implementados en este tramo: directo (100% a un propietario) y porcentaje de propiedad
          (participación económica vigente). El resto de los drivers del catálogo todavía no está
          disponible.
        </small>
      </p>

      {expensesList.length === 0 ? (
        <p>Todavía no hay gastos cargados.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Propiedad</th>
              <th>Proveedor</th>
              <th>Categoría</th>
              <th>Clasificación</th>
              <th>Importe</th>
              <th>Distribución</th>
              {canAllocate && <th></th>}
            </tr>
          </thead>
          <tbody>
            {expensesList.map((expense) => (
              <tr key={expense.id}>
                <td>{expense.expenseDate}</td>
                <td>{expense.propertyName}</td>
                <td>{expense.vendorName ?? "—"}</td>
                <td>{expense.category}</td>
                <td>{expense.classification}</td>
                <td>
                  {expense.amount} {expense.currency}
                </td>
                <td>{expense.allocationStatus === "allocated" ? "Distribuido" : "Sin distribuir"}</td>
                {canAllocate && (
                  <td>
                    {expense.allocationStatus !== "allocated" && (
                      <form action={allocateExpenseAction} style={{ display: "inline" }}>
                        <input type="hidden" name="expenseId" value={expense.id} />
                        <button type="submit">Distribuir</button>
                      </form>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {canCreate && (
        <>
          <h2>Nuevo gasto</h2>
          {propertiesList.length === 0 ? (
            <p>
              Hace falta al menos una <Link href="/properties">propiedad</Link> cargada.
            </p>
          ) : (
            <form action={createExpenseAction}>
              <div>
                <label>
                  Propiedad{" "}
                  <select name="propertyId" required>
                    {propertiesList.map((property) => (
                      <option key={property.id} value={property.id}>
                        {property.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div>
                <label>
                  Proveedor <input name="vendorName" />
                </label>
              </div>
              <div>
                <label>
                  Documento <input name="documentReference" />
                </label>
              </div>
              <div>
                <label>
                  Fecha <input type="date" name="expenseDate" required />
                </label>
              </div>
              <div>
                <label>
                  Categoría <input name="category" required />
                </label>
              </div>
              <div>
                <label>
                  Clasificación{" "}
                  <select name="classification" defaultValue="opex">
                    <option value="opex">Opex</option>
                    <option value="maintenance">Mantenimiento</option>
                    <option value="repair">Reparación</option>
                    <option value="capex">CapEx</option>
                    <option value="tax">Impuesto</option>
                    <option value="insurance">Seguro</option>
                    <option value="fee">Honorario</option>
                    <option value="financial">Financiero</option>
                  </select>
                </label>
              </div>
              <div>
                <label>
                  Recuperable al inquilino{" "}
                  <select name="tenantRecoverability" defaultValue="none">
                    <option value="none">No</option>
                    <option value="full">Total</option>
                    <option value="partial">Parcial</option>
                  </select>
                </label>
              </div>
              <div>
                <label>
                  Moneda{" "}
                  <select name="currency" defaultValue="UYU">
                    <option value="UYU">UYU</option>
                    <option value="USD">USD</option>
                  </select>
                </label>
              </div>
              <div>
                <label>
                  Importe <input name="amount" type="number" step="0.000001" required />
                </label>
              </div>
              <button type="submit">Registrar gasto</button>
            </form>
          )}
        </>
      )}

      {canViewRules && (
        <>
          <h2>Reglas de distribución</h2>
          {rulesList.length === 0 ? (
            <p>Todavía no hay reglas configuradas.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Propiedad</th>
                  <th>Categoría</th>
                  <th>Driver</th>
                  <th>Vigencia</th>
                </tr>
              </thead>
              <tbody>
                {rulesList.map((rule) => (
                  <tr key={rule.id}>
                    <td>{rule.propertyName ?? "(default organización)"}</td>
                    <td>{rule.category ?? "(todas)"}</td>
                    <td>{rule.driverType}</td>
                    <td>
                      {rule.validFrom} — {rule.validTo ?? "vigente"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {canCreateRules && (
            <form action={createAllocationRuleAction}>
              <div>
                <label>
                  Propiedad (vacío = regla por defecto de la organización){" "}
                  <select name="propertyId" defaultValue="">
                    <option value="">—</option>
                    {propertiesList.map((property) => (
                      <option key={property.id} value={property.id}>
                        {property.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div>
                <label>
                  Categoría (vacío = todas las categorías) <input name="category" />
                </label>
              </div>
              <div>
                <label>
                  Driver{" "}
                  <select name="driverType" defaultValue="ownership_percentage">
                    <option value="ownership_percentage">Porcentaje de propiedad</option>
                    <option value="direct">Directo (100% a un propietario)</option>
                  </select>
                </label>
              </div>
              <div>
                <label>
                  Propietario (solo para driver "Directo"){" "}
                  <select name="directOwnerId" defaultValue="">
                    <option value="">—</option>
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
                  Vigente desde <input type="date" name="validFrom" required />
                </label>
              </div>
              <button type="submit">Crear regla</button>
            </form>
          )}
        </>
      )}
    </main>
  );
}
