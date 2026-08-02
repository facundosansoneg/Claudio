import Link from "next/link";
import {
  getPortfolioVacancy,
  getPortfolioDelinquency,
  getYieldByDimension,
  getBelowMarketLeases,
  getExpiringTaxExemptions,
  getExpiringLeases,
  getOverdueTasks,
  type DimensionYield,
} from "@farfalla/domain";
import { getDb } from "@/lib/db";
import { getCurrentUserContext } from "@/lib/current-user";
import { hasPermission } from "@/lib/require-permission";
import { signIn, signOut } from "@/auth";

function statTone(percentage: string | null): string {
  if (percentage === null) return "";
  const value = Number(percentage);
  if (value >= 20) return "stat--danger";
  if (value >= 10) return "stat--warning";
  return "stat--success";
}

function barFillClass(percentage: string): string {
  const value = Number(percentage);
  if (value >= 20) return "bar-fill--danger";
  if (value >= 10) return "bar-fill--warning";
  return "bar-fill--success";
}

// Solo formateo de presentación (redondeo a 2 decimales) — el valor exacto
// almacenado y usado en los cálculos sigue siendo el NUMERIC/string original.
function fmtPct(percentage: string): string {
  return `${Number(percentage).toFixed(2)}%`;
}

function fmtMoney(amount: string): string {
  return Number(amount).toLocaleString("es-UY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default async function DashboardPage() {
  const context = await getCurrentUserContext();
  const devLoginEnabled = process.env.AUTH_ENABLE_DEV_LOGIN === "true";

  if (!context) {
    return (
      <main className="auth-screen">
        <h1>Iniciar sesión</h1>
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
  // CTRL-001: "días previos configurables" — todavía sin llevar a
  // `parameters`, mismo default documentado que ya usa la ficha de
  // propiedad para exoneraciones (apps/web/app/properties/[id]/page.tsx).
  const ALERT_WINDOW_DAYS = 30;
  const [vacancy, delinquency, yieldByDimension, belowMarketLeases, expiringTaxExemptions, expiringLeases, overdueTasks] =
    canViewDashboard
      ? await Promise.all([
          getPortfolioVacancy(getDb(), { organizationId: context.organizationId, asOfDate: todayIso }),
          getPortfolioDelinquency(getDb(), { organizationId: context.organizationId, asOfDate: todayIso }),
          getYieldByDimension(getDb(), { organizationId: context.organizationId, asOfDate: todayIso }),
          getBelowMarketLeases(getDb(), { organizationId: context.organizationId, asOfDate: todayIso }),
          getExpiringTaxExemptions(getDb(), {
            organizationId: context.organizationId,
            daysAhead: ALERT_WINDOW_DAYS,
            today: todayIso,
          }),
          getExpiringLeases(getDb(), { organizationId: context.organizationId, daysAhead: ALERT_WINDOW_DAYS, today: todayIso }),
          getOverdueTasks(getDb(), { organizationId: context.organizationId, today: todayIso }),
        ])
      : [null, null, null, null, null, null, null];

  return (
    <main>
      <h1>Panel general</h1>
      <div className="card">
        <p>
          Sesión iniciada como <strong>{context.displayName}</strong> ({context.email})
        </p>
        <p>
          <small>Organización: {context.organizationId}</small>
        </p>
      </div>

      {canViewDashboard && expiringTaxExemptions && expiringLeases && overdueTasks && (
        <div className="card">
          <h2>Centro de alertas</h2>
          <p>
            <small>
              Spec, CTRL-001/CTRL-002. Ventana de {ALERT_WINDOW_DAYS} días para exoneraciones y
              contratos. Pagos sin aplicar, saldos a favor, conciliaciones pendientes, documentos
              y seguros próximos a vencer, gastos fuera de presupuesto, rendimiento inferior al
              objetivo y reajustes próximos no están cubiertos todavía — no hay conciliación
              bancaria, tracking de vencimientos documentales/pólizas, presupuesto, yield objetivo
              por propiedad ni reajustes (sección 7.6) implementados.
            </small>
          </p>
          {expiringTaxExemptions.length === 0 && expiringLeases.length === 0 && overdueTasks.length === 0 ? (
            <p>
              <span className="badge badge--success">Sin alertas activas</span>
            </p>
          ) : (
            <ul className="alert-list">
              {expiringTaxExemptions.map((exemption) => (
                <li key={exemption.id} className="alert--warning">
                  <span className="badge badge--warning">Exoneración</span> {exemption.taxType.toUpperCase()} de{" "}
                  {exemption.propertyName} vence en {exemption.daysUntilExpiration} días ({exemption.validTo})
                </li>
              ))}
              {expiringLeases.map((lease) => (
                <li key={lease.leaseId} className="alert--warning">
                  <span className="badge badge--warning">Contrato</span> {lease.leaseNumber} de {lease.propertyName} (
                  {lease.unitCode}) vence en {lease.daysUntilExpiration} días ({lease.endDate})
                </li>
              ))}
              {overdueTasks.map((task) => (
                <li key={task.taskId} className="alert--danger">
                  <span className="badge badge--danger">Tarea vencida</span> "{task.title}" vencida hace{" "}
                  {task.daysOverdue} días (prioridad {task.priority})
                </li>
              ))}
            </ul>
          )}
          <p>
            <small>
              Alquileres vencidos: ver "Morosidad" y rentas por debajo de mercado: ver "Contratos
              con alquiler inferior al mercado", ambos en el dashboard de cartera debajo.
            </small>
          </p>
        </div>
      )}

      {canViewDashboard && vacancy && delinquency && (
        <div className="card">
          <h2>Dashboard de cartera</h2>
          <p>
            <small>
              Vacancia física/económica y morosidad (spec, sección 9.1) a la fecha de hoy (
              {todayIso}). El resto del dashboard (cash-on-cash, retorno total, XIRR) requiere
              modelar capital invertido acumulado y deuda — todavía no implementado.
            </small>
          </p>

          <div className="stat-grid">
            <div className={`stat ${statTone(vacancy.physicalVacancyPercentage)}`}>
              <div className="stat-label">Vacancia física</div>
              <div className="stat-value">
                {vacancy.physicalVacancyPercentage !== null ? fmtPct(vacancy.physicalVacancyPercentage) : "—"}
              </div>
              <div className="stat-sub">
                {vacancy.physicalVacancyPercentage !== null
                  ? `${vacancy.vacantUnits} de ${vacancy.totalUnits} unidades`
                  : "sin unidades cargadas"}
              </div>
            </div>
          </div>
          {vacancy.unitsExcludedForMissingRent > 0 && (
            <p>
              <small>
                {vacancy.unitsExcludedForMissingRent} unidad(es) vacante(s) sin renta objetivo
                cargada — excluidas de la vacancia económica en vez de asumir $0.
              </small>
            </p>
          )}
          {vacancy.byCurrency.length > 0 && (
            <>
              <h3>Vacancia económica por moneda</h3>
              {vacancy.byCurrency.map((entry) => (
                <div className="bar-row" key={entry.currency}>
                  <span className="bar-row__label">{entry.currency}</span>
                  <span className="bar-track">
                    <span
                      className={`bar-fill ${barFillClass(entry.economicVacancyPercentage)}`}
                      style={{ width: `${Math.min(100, Number(entry.economicVacancyPercentage))}%` }}
                    />
                  </span>
                  <span className="bar-row__value">{fmtPct(entry.economicVacancyPercentage)}</span>
                </div>
              ))}
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
                      <td>{fmtMoney(entry.potentialGrossRent)}</td>
                      <td>{fmtMoney(entry.contractedRent)}</td>
                      <td>{fmtPct(entry.economicVacancyPercentage)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <h3>Morosidad</h3>
          {delinquency.byCurrency.length === 0 ? (
            <p>
              <span className="badge badge--success">Sin cargos vencidos hasta la fecha</span>
            </p>
          ) : (
            <>
              {delinquency.byCurrency.map((entry) => (
                <div className="bar-row" key={entry.currency}>
                  <span className="bar-row__label">{entry.currency}</span>
                  <span className="bar-track">
                    <span
                      className={`bar-fill ${barFillClass(entry.delinquencyPercentage)}`}
                      style={{ width: `${Math.min(100, Number(entry.delinquencyPercentage))}%` }}
                    />
                  </span>
                  <span className="bar-row__value">{fmtPct(entry.delinquencyPercentage)}</span>
                </div>
              ))}
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
                      <td>{fmtMoney(entry.billed)}</td>
                      <td>{fmtMoney(entry.overdueBalance)}</td>
                      <td>{fmtPct(entry.delinquencyPercentage)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
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

          {belowMarketLeases && (
            <>
              <h3>Contratos con alquiler inferior al mercado</h3>
              <p>
                <small>
                  Compara la renta contractual contra la última estimación de mercado de la
                  propiedad (sección 10.3) o, si no hay, contra la renta objetivo de la unidad —
                  solo cuando están en la misma moneda que el contrato.
                </small>
              </p>
              {belowMarketLeases.length === 0 ? (
                <p>Ningún contrato activo está por debajo del benchmark de mercado disponible.</p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Propiedad</th>
                      <th>Unidad</th>
                      <th>Contrato</th>
                      <th>Renta contractual</th>
                      <th>Benchmark</th>
                      <th>Fuente</th>
                      <th>Diferencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {belowMarketLeases.map((lease) => (
                      <tr key={lease.leaseId}>
                        <td>{lease.propertyName}</td>
                        <td>{lease.unitCode}</td>
                        <td>{lease.leaseNumber}</td>
                        <td>
                          {fmtMoney(lease.contractualRent)} {lease.currency}
                        </td>
                        <td>
                          {fmtMoney(lease.benchmarkRent)} {lease.currency}
                        </td>
                        <td>{lease.benchmarkSource === "market_estimate" ? "Estimación de mercado" : "Renta objetivo"}</td>
                        <td>-{fmtPct(lease.gapPercentage)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>
      )}

      <h2>Roles y alcances</h2>
      <ul className="alert-list">
        {context.roles.map((role, index) => (
          <li key={index} className="alert--neutral">
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
        <li>
          <Link href="/tasks">Tareas</Link>
        </li>
        <li>
          <Link href="/vendors">Proveedores</Link>
        </li>
        <li>
          <Link href="/work-orders">Órdenes de trabajo</Link>
        </li>
        <li>
          <Link href="/migration/owners">Migración — Propietarios</Link>
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
              <td>{fmtMoney(row.marketValue)}</td>
              <td>{fmtMoney(row.annualizedRent)}</td>
              <td>{fmtPct(row.yieldPercentage)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
