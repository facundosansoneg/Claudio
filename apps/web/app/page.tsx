import Link from "next/link";
import { getPortfolioVacancy, getPortfolioDelinquency, getYieldByDimension, type DimensionYield } from "@farfalla/domain";
import { getDb } from "@/lib/db";
import { getCurrentUserContext } from "@/lib/current-user";
import { hasPermission } from "@/lib/require-permission";
import { signIn, signOut } from "@/auth";

export default async function DashboardPage() {
  const context = await getCurrentUserContext();
  const devLoginEnabled = process.env.AUTH_ENABLE_DEV_LOGIN === "true";

  if (!context) {
    return (
      <main>
        <h1>Farfalla Asset &amp; Property Management</h1>
        <p>No hay sesión activa.</p>
        <form
          action={async () => {
            "use server";
            await signIn("microsoft-entra-id");
          }}
        >
          <button type="submit">Iniciar sesión con Microsoft Entra ID</button>
        </form>
        {devLoginEnabled && (
          <form
            action={async () => {
              "use server";
              await signIn("dev-login");
            }}
          >
            <button type="submit">Login de prueba (sin Azure)</button>
            <p>
              <small>
                Solo visible porque AUTH_ENABLE_DEV_LOGIN=true. Nunca activar esta variable en
                un entorno accesible públicamente.
              </small>
            </p>
          </form>
        )}
      </main>
    );
  }

  const canViewDashboard = await hasPermission(context, "portfolio_dashboard", "view");
  const todayIso = new Date().toISOString().slice(0, 10);
  const [vacancy, delinquency, yieldByDimension] = canViewDashboard
    ? await Promise.all([
        getPortfolioVacancy(getDb(), { organizationId: context.organizationId, asOfDate: todayIso }),
        getPortfolioDelinquency(getDb(), { organizationId: context.organizationId, asOfDate: todayIso }),
        getYieldByDimension(getDb(), { organizationId: context.organizationId, asOfDate: todayIso }),
      ])
    : [null, null, null];

  return (
    <main>
      <h1>Farfalla Asset &amp; Property Management</h1>
      <p>
        Sesión iniciada como <strong>{context.displayName}</strong> ({context.email})
      </p>
      <p>Organización: {context.organizationId}</p>

      {canViewDashboard && vacancy && delinquency && (
        <>
          <h2>Dashboard de cartera</h2>
          <p>
            <small>
              Vacancia física/económica y morosidad (spec, sección 9.1) a la fecha de hoy (
              {todayIso}). El resto del dashboard (cash-on-cash, retorno total, XIRR) requiere
              modelar capital invertido acumulado y deuda — todavía no implementado.
            </small>
          </p>
          <p>
            <strong>Vacancia física:</strong>{" "}
            {vacancy.physicalVacancyPercentage !== null
              ? `${vacancy.physicalVacancyPercentage}% (${vacancy.vacantUnits} de ${vacancy.totalUnits} unidades)`
              : "sin unidades cargadas"}
          </p>
          {vacancy.unitsExcludedForMissingRent > 0 && (
            <p>
              <small>
                {vacancy.unitsExcludedForMissingRent} unidad(es) vacante(s) sin renta objetivo
                cargada — excluidas de la vacancia económica en vez de asumir $0.
              </small>
            </p>
          )}
          {vacancy.byCurrency.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th>Moneda</th>
                  <th>Ingreso bruto potencial</th>
                  <th>Renta contratada</th>
                  <th>Vacancia económica</th>
                </tr>
              </thead>
              <tbody>
                {vacancy.byCurrency.map((entry) => (
                  <tr key={entry.currency}>
                    <td>{entry.currency}</td>
                    <td>{entry.potentialGrossRent}</td>
                    <td>{entry.contractedRent}</td>
                    <td>{entry.economicVacancyPercentage}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <p>
            <strong>Morosidad</strong>
          </p>
          {delinquency.byCurrency.length === 0 ? (
            <p>Sin cargos vencidos hasta la fecha.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Moneda</th>
                  <th>Facturado (vencido)</th>
                  <th>Saldo vencido</th>
                  <th>Morosidad</th>
                </tr>
              </thead>
              <tbody>
                {delinquency.byCurrency.map((entry) => (
                  <tr key={entry.currency}>
                    <td>{entry.currency}</td>
                    <td>{entry.billed}</td>
                    <td>{entry.overdueBalance}</td>
                    <td>{entry.delinquencyPercentage}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {yieldByDimension && (
            <>
              <h3>Rentabilidad por dimensión (yield bruto)</h3>
              <p>
                <small>
                  Solo incluye propiedades con valoración vigente y renta activa en la misma
                  moneda que la valoración. Zona, entidad y portafolio todavía no están cubiertas.
                </small>
              </p>
              <DimensionYieldTable title="Por tipo de inmueble" rows={yieldByDimension.byPropertyType} />
              <DimensionYieldTable title="Por barrio" rows={yieldByDimension.byNeighborhood} />
              <DimensionYieldTable title="Por propietario (prorrateado por participación económica)" rows={yieldByDimension.byOwner} />
              <DimensionYieldTable title="Por familia" rows={yieldByDimension.byFamily} />
            </>
          )}
        </>
      )}

      <h2>Roles y alcances</h2>
      <ul>
        {context.roles.map((role, index) => (
          <li key={index}>
            {role.roleName} — alcance: {role.scopeType}
            {role.scopeId ? ` (${role.scopeId})` : ""}
          </li>
        ))}
      </ul>
      <h2>Ir a</h2>
      <ul>
        <li>
          <Link href="/owners">Propietarios</Link>
        </li>
        <li>
          <Link href="/properties">Propiedades</Link>
        </li>
        <li>
          <Link href="/tenants">Inquilinos</Link>
        </li>
        <li>
          <Link href="/leases">Contratos</Link>
        </li>
        <li>
          <Link href="/charges">Cargos</Link>
        </li>
        <li>
          <Link href="/receipts">Recibos</Link>
        </li>
        <li>
          <Link href="/commission-concepts">Conceptos de comisión</Link>
        </li>
        <li>
          <Link href="/invoices">Facturación manual</Link>
        </li>
        <li>
          <Link href="/expenses">Gastos y distribución</Link>
        </li>
        <li>
          <Link href="/market-comparables">Comparables de mercado</Link>
        </li>
      </ul>
      <form
        action={async () => {
          "use server";
          await signOut();
        }}
      >
        <button type="submit">Cerrar sesión</button>
      </form>
    </main>
  );
}

function DimensionYieldTable({ title, rows }: { title: string; rows: DimensionYield[] }) {
  if (rows.length === 0) {
    return (
      <p>
        <em>{title}:</em> sin datos suficientes.
      </p>
    );
  }
  return (
    <>
      <p>
        <em>{title}</em>
      </p>
      <table>
        <thead>
          <tr>
            <th>Grupo</th>
            <th>Moneda</th>
            <th>Valor de mercado</th>
            <th>Alquiler anualizado</th>
            <th>Yield bruto</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.key}-${row.currency}`}>
              <td>{row.label}</td>
              <td>{row.currency}</td>
              <td>{row.marketValue}</td>
              <td>{row.annualizedRent}</td>
              <td>{row.yieldPercentage}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
