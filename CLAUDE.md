# CLAUDE.md — Farfalla Asset & Property Management

Este repositorio implementa el sistema descrito en
[`PROPERTY_ASSET_MANAGEMENT_MASTER_SPEC.md`](./PROPERTY_ASSET_MANAGEMENT_MASTER_SPEC.md)
(v1.0, 2026-08-01). Ese documento es la **fuente funcional principal** del
proyecto. Ante cualquier duda funcional, consultarlo antes de decidir.

Documentos de apoyo:

- [`docs/implementation-plan.md`](./docs/implementation-plan.md) — hitos, entregables y criterios de aceptación.
- [`docs/open-decisions.md`](./docs/open-decisions.md) — puntos `[OPEN]` que requieren información externa antes de implementarse en firme.
- [`docs/domain-model.md`](./docs/domain-model.md) — modelo de datos y diagrama ER.
- [`docs/accounting-rules.md`](./docs/accounting-rules.md) — plan de cuentas y reglas del subledger.
- [`docs/currency-and-indexation.md`](./docs/currency-and-indexation.md) — política multimoneda (UYU/USD/UI).
- [`docs/adr/`](./docs/adr/) — decisiones de arquitectura.

## Reglas no negociables (spec, sección 0)

1. **Monolito modular.** Nada de microservicios prematuros ni de código sin
   límites de dominio claros. Ver `/packages/*` en la estructura del repo.
2. **Dinero, porcentajes, unidades indexadas y tipos de cambio nunca usan
   `float`.** Usar `DECIMAL`/`NUMERIC`: dinero `NUMERIC(20,6)`, porcentajes
   `NUMERIC(12,8)`, tipos de cambio e índices `NUMERIC(20,10)`.
3. **Ledger inmutable.** Un asiento confirmado no se edita ni se borra. Toda
   corrección es una reversión, una nueva versión o un contraasiento. Un
   recibo reimpreso conserva su ID y suma un contador de copias. Períodos
   cerrados no aceptan contabilizaciones sin reapertura autorizada.
4. **Historial por vigencia (`valid_from`/`valid_to`)** en: participación de
   propietarios, distribución económica de rentas, responsable de
   IRPF/IRNR, exoneraciones fiscales, contratos y adendas, reglas de
   reajuste, valores de mercado, moneda funcional, reglas de comisión,
   drivers de gastos, roles y autorizaciones especiales. Nunca guardar solo
   el "estado actual" de estas relaciones.
5. **Separación operación/fiscalidad.** Modelar como pasos distintos:
   devengamiento → cobro → acreditación al propietario → retención fiscal →
   comisión → IVA → fondos disponibles → pago efectivo.
6. **Configuración antes que código rígido.** Tipos de documento, conceptos
   de movimiento, tasas fiscales, tipos de garantía, reglas de mora, tipos
   de reajuste, conceptos de comisión, tipos de factura, series/numeración,
   plantillas, reglas de distribución y fuentes de cotización/índice deben
   ser parametrizables y versionados — nunca hardcodeados.
7. **No inventar formatos fiscales ni integraciones no documentadas.** Los
   puntos listados en `docs/open-decisions.md` requieren dato real, muestra
   o especificación oficial antes de darse por "completos". Mientras tanto:
   interfaces configurables, adaptadores y carga manual/CSV.
8. **Multimoneda desde la primera migración.** UYU, USD y UI conviven desde
   el día uno del esquema de base de datos.
9. **Auditoría completa.** Toda alta, modificación, aprobación, anulación,
   cierre, reversión, exportación y envío queda registrada en `audit_log`
   con usuario, fecha/hora, IP/sesión, entidad, acción, estado
   anterior/nuevo y motivo obligatorio cuando corresponda.
10. **Eliminación lógica**, salvo datos de prueba. Nunca se borran
    movimientos financieros ni históricos.
11. **Calidad en cada entrega.** `lint`, chequeo de tipos, pruebas
    unitarias, pruebas de integración y migraciones deben correr (y pasar)
    en cada entrega, vía CI.
12. **Dependencias estables vigentes.** No fijar versiones obsoletas
    sugeridas por el documento maestro; usar las versiones estables
    actuales al momento de implementar.
13. **Pedir antes de inventar.** Si una salida debe replicar exactamente un
    formato externo no documentado (BETA/SIGMA, CFE, ANDA/CGN, etc.),
    solicitar datos o muestras reales — ver sección 24 del spec y
    `docs/open-decisions.md`.

## Etiquetas del spec

- `[SGA]` — funcionalidad del manual SGA de referencia (paridad obligatoria).
- `[PATRIMONIAL]` — gestión patrimonial y análisis de inversión.
- `[TECH]` — decisión o requisito técnico.
- `[OPEN]` — requiere información externa o decisión funcional antes de cerrarse.
- `[V1]` — obligatorio para la primera versión operativa.
- `[POST-V1]` — mejora posterior, no bloquea la salida inicial.

## Orden de trabajo

No implementar código de aplicación sin que el plan de la sección
`docs/implementation-plan.md` esté aprobado. El primer código debe ser el
*vertical slice* mínimo: propietario → propiedad → unidad → inquilino →
contrato → cargo → pago → recibo → estado de cuenta, con permisos, auditoría
y pruebas desde el principio (spec, sección 25, Paso 4).

## Definition of Done (spec, sección 23)

Una funcionalidad está terminada solo cuando: cumple sus criterios de
aceptación, tiene pruebas automáticas, respeta permisos, genera auditoría,
maneja errores y estados vacíos, funciona en UYU/USD/UI si involucra
importes, es idempotente cuando corresponde, tiene documentación funcional
breve, tiene migración de base de datos, no rompe conciliaciones contables y
pasó validación en staging.
