# Plan de implementación — Versión 1

Basado en la sección 21 del spec (hitos internos), la sección 20 (matriz
de paridad SGA), la sección 22 (seed demo) y la sección 23 (Definition of
Done). Cada hito solo se declara terminado cuando cumple su propio
criterio de aceptación **y** el DoD general de `CLAUDE.md`.

Estado general: **Hito 0 en curso** (este conjunto de documentos). Ningún
código de aplicación se escribe hasta que este plan esté aprobado (spec,
sección 25, Paso 1-3).

## Hito 0 — Descubrimiento y prototipo

**Entregables** (este commit):

- [x] `PROPERTY_ASSET_MANAGEMENT_MASTER_SPEC.md` en la raíz del repo.
- [x] `CLAUDE.md` con las reglas no negociables.
- [x] `docs/open-decisions.md` con los 10 puntos `[OPEN]`.
- [x] `docs/domain-model.md` con diagrama ER inicial.
- [x] `docs/adr/0001` a `0006` (ORM, auth, storage, cola, documentos,
      multitenancy).
- [x] `docs/accounting-rules.md` (plan de cuentas inicial).
- [x] `docs/currency-and-indexation.md` (política multimoneda).
- [ ] Wireframes — pendiente, no bloquea el resto del plan; se abordan al
      inicio del Hito 2 sobre los flujos ya definidos en la sección 14.

**Criterio de aceptación**: el responsable funcional revisa y aprueba
(o pide ajustes a) este plan, el modelo de datos y las decisiones de ADR
antes de iniciar el Hito 1.

## Hito 1 — Fundación

**Alcance** (spec, sección 21): repositorio, CI/CD, autenticación,
organización/familias/roles, base de datos y auditoría, archivos,
parámetros.

**Entregables**:

- Estructura de monorepo (`/apps/web`, `/apps/worker`, `/packages/*`,
  sección 4.3).
- PostgreSQL + Drizzle configurado, primera migración (`organizations`,
  `families`, `parties`, `users`, `roles`, `permissions`,
  `role_permissions`, `user_scopes`, `audit_log`) con RLS desde el primer
  esquema (ADR 0006).
- Auth.js + Microsoft Entra ID (ADR 0002) funcionando en un entorno de
  desarrollo/staging.
- `packages/documents` con `StorageAdapter` sobre MinIO local (ADR 0003).
- CI: lint, type-check, tests unitarios, migraciones — bloqueante en cada
  PR (regla no negociable 11).
- Tabla de parámetros/configuración genérica para lo listado en sección
  3.5 (tipos de documento, conceptos de movimiento, etc.), aunque los
  valores concretos se cargan hito a hito.

**Criterio de aceptación**: un usuario puede autenticarse vía Entra ID,
quedar asignado a un rol y organización, y toda acción de alta queda en
`audit_log`. CI verde de punta a punta.

## Hito 2 — Maestros y contratos

**Alcance**: propietarios, grupos, propiedades/unidades, participaciones,
inquilinos, garantías, contratos, reajustes, documentos.

**Entregables**: implementa OWN-001 a 005, PROP-001 a 003, TEN-001,
LEASE-001 a 006, DOC-001, con las fichas maestras y pestañas de la
sección 14.2.

**Criterio de aceptación**: escenario E2E-002 (propiedad compartida,
60/40 con contribución fiscal 100/0) pasa de punta a punta, incluyendo
validación de que cada dimensión de `ownership_interests` totaliza 100%
en la fecha correspondiente (sección 7.2).

## Hito 3 — Operación SGA

**Alcance**: generación y copia de alquileres, consulta de cargos, pagos,
recibos, reimpresión, anulación, mora, ANDA/CGN, movimientos por
propietario y vivienda.

**Entregables**: RENT-001 a 004, PAY-001 a 005, GUAR-001 a 005, MOV-001 a
004, más el subledger contable mínimo (`ledger_accounts`,
`journal_entries`, `journal_lines`) para que cobro/recibo/anulación
generen asientos reales.

**Criterio de aceptación**: escenarios E2E-001 (alquiler normal, incluida
reimpresión y anulación) y E2E-004 (ANDA/CGN con diferencia, corrección,
acreditación, reejecución sin duplicar) pasan de punta a punta.

## Hito 4 — Fiscal y facturación

**Alcance**: IRPF/IRNR, exoneraciones, contribución fiscal distinta,
comisiones, resguardos, facturación manual y recurrente, marco BETA/SIGMA.

**Entregables**: TAX-001 a 005, COMM-001 a 003, INV-001 a 004 (dominio +
adapter; exportador CFE real bloqueado por ítem 2 de open-decisions),
DGI-001 a 004 (dominio + exportador configurable; exportador oficial
bloqueado por ítem 1).

**Criterio de aceptación**: escenario E2E-003 (mismo propietario, una
propiedad gravada y otra exonerada, retención solo en la gravada) pasa de
punta a punta. Las filas BETA/SIGMA y facturación electrónica de la
matriz de paridad (sección 20) quedan explícitamente en estado "dominio
completo, exportador sujeto a muestra oficial" — no se marcan
"Completo" sin la muestra real.

## Hito 5 — Gestión patrimonial

**Alcance**: gastos y drivers, valoraciones, comparables, KPIs, reportes,
UI y USD, presupuesto vs. real.

**Entregables**: allocation rules/runs (sección 7.9), `valuations`,
`market_comparables`, `market_estimates` (sección 7.11), todas las
métricas de la sección 9.2 (NOI, yields, cash-on-cash, XIRR) y los
reportes obligatorios de la sección 9.4.

**Criterio de aceptación**: escenario E2E-005 (compra + 12 meses de
ingresos/gastos → NOI, yields, cash-on-cash, XIRR, cambio de moneda de
reporte, consistencia) pasa de punta a punta.

## Hito 6 — Automatización

**Alcance**: Microsoft 365, correos, plantillas, tareas, mantenimiento,
alertas, reportes programados.

**Entregables**: EMAIL-001 a 006, DOC-001 (plantillas ya generando
DOCX/PDF reales vía ADR 0005), sección 11 completa (tareas, órdenes de
trabajo, proveedores), CTRL-001 y CTRL-002 (controles y centro de
alertas), jobs de la sección 15 corriendo en `apps/worker` vía pg-boss
(ADR 0004).

**Criterio de aceptación**: un recordatorio de vencimiento se genera,
envía por correo con adjunto PDF y queda en el historial de entrega sin
intervención manual.

## Hito 7 — Migración y paralelismo

**Alcance**: importar SGA, conciliar, correr al menos dos cierres
mensuales en paralelo, resolver diferencias, aprobar cutover.

**Bloqueado por**: ítem 8 de `docs/open-decisions.md` (exportación real
de SGA). No puede iniciarse en firme sin ese insumo; se puede preparar el
diseño de importadores genéricos por entidad mientras tanto.

**Criterio de aceptación**: los controles de migración de la sección
16.3 (conteos, totales de saldos por moneda, participaciones que suman
100%, etc.) cierran sin diferencias tras dos cierres paralelos.

## Definition of Done aplicado a cada hito

Ningún hito se marca completo si:

- Falta alguna prueba automática correspondiente (sección 19).
- No respeta permisos/alcance (ADR 0002).
- No genera auditoría (sección 17).
- No funciona en UYU/USD/UI cuando involucra importes.
- No es idempotente cuando el spec lo exige explícitamente (generación de
  alquileres, ANDA/CGN, facturación recurrente).
- No tiene migración de base de datos versionada.
- Rompe una conciliación contable existente.

## Seed de demo

El seed reproducible de la sección 22 (organización, dos familias, cuatro
propietarios con una sociedad, un grupo de propietarios, seis
propiedades/ocho unidades, contratos en UYU/USD/UI, exoneración,
IRPF distinto al porcentaje legal, ANDA, CGN, garantía personal, alquiler
afianzado con dos garantías, recibo anulado, gastos con dos drivers
distintos, valuaciones, comparables, tareas/órdenes de trabajo, facturas)
se construye incrementalmente: cada hito agrega los datos de demo que
necesita para probar su propio alcance, no se posterga todo a un único
seed final.
