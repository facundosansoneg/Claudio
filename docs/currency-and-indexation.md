# Política multimoneda y de indexación (UYU / USD / UI)

Basado en las secciones 3.2, 7.13 y 9.5 del spec. La fuente exacta de
cotizaciones sigue **abierta** (`docs/open-decisions.md`, ítems 4 y 5);
este documento fija el modelo y las reglas que no dependen de esa fuente.

## 1. Monedas y unidades soportadas desde V1

- **UYU** — peso uruguayo, moneda base típica de operación local.
- **USD** — dólar estadounidense, moneda frecuente de contratos.
- **UI** — Unidad Indexada, usada en reajustes y algunos contratos.
- Extensible a otras monedas/índices (`currencies`, `index_units`) sin
  migración de schema — nunca hardcodear el conjunto de monedas en código.

## 2. Regla de oro: nunca perder el valor original

Todo importe con relevancia económica registra siempre:

| Campo | Descripción |
|---|---|
| `original_amount` | Importe en la moneda/unidad en que se originó la transacción |
| `original_currency` | Código de moneda o unidad original |
| `economic_date` | Fecha del hecho económico (devengamiento, pago, etc.) |
| `accounting_date` | Fecha de contabilización, puede diferir de la económica |
| `rate_source` | Fuente de la cotización o índice usado para convertir |
| `rate_value` | Tipo de cambio o valor de unidad aplicado |
| `converted_amount` | Snapshot derivado en la moneda de reporte — **nunca** la única fuente de verdad |

`converted_amount` se recalcula en reportes, nunca se sobrescribe el
`original_amount` histórico. Esto es lo que permite reprocesar reportes
con una política de conversión distinta sin perder información (sección
9.5).

## 3. Tipos numéricos (no negociable)

- Dinero: `NUMERIC(20, 6)`.
- Porcentajes: `NUMERIC(12, 8)`.
- Tipos de cambio e índices: `NUMERIC(20, 10)`.
- `float`/`double` prohibido para cualquiera de estos campos en todo el
  código — incluye cálculos intermedios, no solo el almacenamiento.

## 4. `exchange_rates` e `index_values`

- Una cotización o valor de índice **confirmado no se sobrescribe**; una
  corrección crea una nueva fila versionada (mismo patrón que el ledger
  inmutable) con estado de verificación propio.
- Cada fila registra fuente y, para `exchange_rates`, el tipo de
  cotización: comprador, vendedor, promedio o interbancario — el spec
  exige que el sistema distinga estos tipos, no que asuma uno solo.
- Mientras la fuente automática esté pendiente (ítems 4 y 5 de
  `docs/open-decisions.md`), la carga es manual o por importación
  CSV/job configurable, nunca con un valor hardcodeado como "tipo de
  cambio del sistema".

## 5. Políticas de conversión para reporting (sección 9.5)

Cada reporte permite elegir moneda de salida (original, UYU, USD, UI) y
una política de conversión explícita, mostrada siempre junto al reporte:

- Tipo de cambio de la fecha de la transacción.
- Tipo de cambio de cierre de período.
- Promedio mensual.
- Tipo comprador, vendedor o interbancario (según corresponda a la
  política elegida).
- Valor de UI de la fecha, de cierre, o promedio.

No existe una "política por defecto silenciosa": si un usuario no elige,
el sistema debe mostrar explícitamente cuál está aplicando.

## 6. Balanceo contable multimoneda

Un `journal_entry` puede tener líneas en distintas monedas originales,
pero **debe balancear (débito = crédito) en la moneda funcional de la
organización**, usando el tipo de cambio vigente a la fecha contable de
cada línea. El detalle por moneda original de cada línea se conserva en
`journal_lines.original_currency` / `original_amount` para trazabilidad,
sin afectar el balanceo funcional.

## 7. Reajustes indexados (UI, IPC, UR, etc.)

`adjustment_rules` parametriza el tipo de índice, fecha base, frecuencia,
meses de diferimiento, repetición anual, fuente y regla de redondeo — el
cálculo de un reajuste nunca asume una fórmula fija en código; lee la
regla vigente para ese contrato y guarda evidencia del cálculo
(`adjustment_schedule.calculation_evidence`: valores de índice usados,
fórmula aplicada, resultado) para poder auditar por qué un alquiler subió
a determinado valor.

## 8. Pendiente

Fuente y frecuencia exactas de tipo de cambio y de UI: ver
`docs/open-decisions.md`, ítems 4 y 5.
