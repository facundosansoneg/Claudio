# Reglas contables y plan de cuentas inicial

Basado en la sección 7.8 del spec. **Este plan de cuentas es una propuesta
inicial de trabajo, no un plan de cuentas contable-fiscal validado** — ver
`docs/open-decisions.md`, ítem 7. No usar en producción sin validación por
contabilidad.

## 1. Principios (no negociables, ver `CLAUDE.md`)

1. Un asiento confirmado (`journal_entries.status = 'posted'`) no se edita
   ni se borra.
2. Toda corrección es un asiento de reversión vinculado al original
   (`journal_entries.reversed_entry_id`), nunca un `UPDATE`.
3. Un recibo reimpreso conserva su ID y aumenta `receipts.reprint_count`.
4. Un período cerrado (`accounting_periods.status = 'closed'`) rechaza
   nuevas contabilizaciones hasta una reapertura auditada
   (`ReopenAccountingPeriod`, con motivo obligatorio).
5. Toda línea de asiento (`journal_lines`) balancea débito = crédito **por
   moneda funcional** dentro de cada `journal_entry`.
6. Todo importe original se conserva junto con su moneda, fecha económica,
   fecha contable, fuente de cotización y tipo de cambio usado — el
   importe convertido es siempre un snapshot derivado, nunca la única
   fuente de verdad (sección 3.2).

## 2. Plan de cuentas mínimo (`ledger_accounts`)

Código sugerido de 4 dígitos por grupo, a ajustar cuando se valide el plan
final:

| Código | Cuenta | Tipo | Uso |
|---|---|---|---|
| 1100 | Cuentas por cobrar a inquilinos | Activo | Contrapartida de `charges` devengados no cobrados |
| 1200 | Caja y bancos | Activo | Ingresos/egresos de `payments` |
| 1300 | Saldos con agentes de garantía (ANDA/CGN) | Activo | Esperado vs. acreditado por `guarantee_runs` |
| 2100 | Fondos de propietarios por pagar | Pasivo | Saldo pendiente de liquidar a cada propietario |
| 2200 | IVA débito | Pasivo | IVA generado en facturación de comisiones/honorarios |
| 2300 | Retenciones IRPF/IRNR a depositar | Pasivo | Retención fiscal practicada, pendiente de DGI |
| 2400 | Mora de la administración | Pasivo | Mora cuyo destino es la administración, no el propietario |
| 4100 | Ingresos por alquiler | Ingreso | Devengamiento de `charges` tipo alquiler |
| 4200 | Ingresos por comisión de administración | Ingreso | `commission_concepts` con destino administración |
| 4300 | Mora del propietario | Ingreso/Ajuste | Mora cuyo destino es el propietario |
| 5100 | Gastos por propiedad (Opex) | Gasto | `expenses` clasificación Opex/mantenimiento/reparación |
| 5200 | CapEx | Activo (capitalizable) | `expenses` clasificación CapEx |
| 5300 | Impuestos y tasas sobre inmuebles | Gasto | Impuestos que no son retención de inquilino |
| 5400 | Honorarios y comisiones pagadas | Gasto | Honorarios a proveedores/profesionales |
| 6200 | IVA crédito | Activo | IVA de gastos deducibles |

Este listado cubre el mínimo textual de la sección 7.8; **no** incluye
subcuentas por moneda — la moneda es una dimensión de `journal_lines`, no
parte del código de cuenta, para no multiplicar el plan de cuentas por
UYU/USD/UI.

## 3. Ciclo del alquiler (sección 3.4) → asientos conceptuales

Cada paso es un evento de dominio separado, con su propio asiento cuando
corresponde, nunca un solo asiento monolítico "cobro de alquiler":

1. **Devengamiento** (`GenerateRentCharges`): débito 1100 / crédito 4100,
   por el importe original del cargo.
2. **Cobro** (`RegisterPayment` + `AllocatePayment`): débito 1200 (o 1300
   si el cobrador es ANDA/CGN) / crédito 1100.
3. **Comisión de administración** (calculada según `commission_concepts`
   vigente): débito 2100 (reduce lo que se le debe al propietario) /
   crédito 4200, más IVA si aplica: débito 2100 adicional / crédito 2200.
4. **Retención fiscal** (según `tax_profiles` vigente del propietario):
   débito 2100 / crédito 2300.
5. **Fondos disponibles para liquidación**: lo que queda en 2100 después
   de comisión y retención es el saldo a pagar al propietario.
6. **Pago efectivo al propietario** (`GenerateOwnerStatement` →
   transferencia): débito 2100 / crédito 1200.

Cada paso queda auditado por separado (regla no negociable 9/10), lo que
permite responder "cuánto se devengó" vs. "cuánto se cobró" vs. "cuánto se
le pagó realmente al propietario" sin ambigüedad — que es exactamente la
separación que exige la sección 3.4.

## 4. Reversión de recibo (PAY-004)

`ReverseReceipt` genera:

- Un asiento de reversión con las líneas invertidas del asiento de cobro
  original (`reversed_entry_id` apuntando al original).
- El/los cargo(s) originalmente saldado(s) vuelven a `status = 'pending'`
  si no fueron reasignados a otro pago.
- El recibo cambia a `status = 'voided'` con `void_reason` obligatorio; no
  se borra ni se reutiliza su número.

## 5. Cierre y reapertura de período

- `CloseAccountingPeriod`: valida que todos los asientos del período estén
  `posted` (no `draft`), congela el período (`accounting_periods.status =
  'closed'`).
- `ReopenAccountingPeriod`: requiere rol autorizado + motivo obligatorio;
  queda auditado con severidad reforzada (sección 17).
- Ningún asiento nuevo puede tener `accounting_date` dentro de un período
  `closed`.

## 6. Pendiente

El plan de cuentas final, la correspondencia con un plan de cuentas
uruguayo estándar (si la organización usa uno) y el tratamiento contable
exacto de UI/IU en el ledger quedan sujetos a validación — ver
`docs/open-decisions.md`, ítems 4, 5 y 7.
