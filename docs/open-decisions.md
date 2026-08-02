# Decisiones abiertas (`[OPEN]`)

Fuente: `PROPERTY_ASSET_MANAGEMENT_MASTER_SPEC.md`, secciones 8.6, 8.9, 8.10,
8.13, 16.4 y 24. Ninguno de estos puntos debe resolverse inventando un
formato, tasa o integración. Mientras estén pendientes, el sistema debe
ofrecer interfaces configurables, adaptadores desacoplados y carga
manual/CSV que permitan operar y luego enchufar la integración real sin
rediseñar el dominio.

Estado: todas **pendientes** al 2026-08-01. Actualizar la columna Estado a
medida que se resuelvan, con fecha y responsable.

| # | Decisión | Seccion(es) relacionadas | Qué se necesita | Enfoque interino (V1) | Estado |
|---|---|---|---|---|---|
| 1 | Layout oficial y muestras de archivos BETA/SIGMA (DGI) | DGI-001 a 004 (8.9) | Archivo de ejemplo generado por SGA + especificación oficial vigente + reglas de validación de DGI | Construir dominio, pantalla, cálculo, almacenamiento y una interfaz de exportador configurable. El exportador final se activa solo tras validar el formato con muestras reales | Pendiente |
| 2 | Integración exacta de facturación electrónica / CFE | INV-004 (8.10) | Proveedor, API, certificados y formato de CFE definitivo | Adaptador desacoplado; comenzar con numeración interna y exportación controlada (no fiscal) | Pendiente |
| 3 | Archivos o APIs de ANDA y Contaduría General de la Nación (CGN) | GUAR-001 a 005 (8.6) | Especificación o archivo de muestra de cada agente de garantía para automatizar importación y conciliación | Carga manual y CSV configurable; comparación esperado vs. recibido manual | Pendiente |
| 4 | Fuente y política exacta de tipo de cambio | 3.2, 9.5, 13.2 | Definir fuente (BCU, banco, otra), tipo (comprador/vendedor/interbancario) y momento (transacción, cierre, promedio) por defecto | Modelo de `exchange_rates` con fuente y tipo parametrizables; sin fuente automática hasta decidir proveedor | Pendiente |
| 5 | Fuente y frecuencia de actualización de UI (Unidad Indexada) | 3.2, 7.13, 9.5 | Proveedor de la serie de UI y frecuencia de actualización (diaria/mensual) | Modelo de `index_values` versionado; carga manual/import job hasta definir fuente automática | Pendiente |
| 6 | Plantillas legales definitivas de contratos y adendas | DOC-001 (8.11) | Textos legales aprobados por el responsable funcional/legal | `document_templates` con variables definidas en el spec; plantillas placeholder no vinculantes hasta aprobación | Pendiente |
| 7 | Plan contable final | 7.8, Hito 0 | Validación del plan de cuentas mínimo por contabilidad | Ver `docs/accounting-rules.md` — plan de cuentas inicial propuesto, sujeto a ajuste | Pendiente |
| 8 | Datos de migración y esquema exportado desde SGA | 16.1 a 16.4 | Esquema de base de datos o exportación CSV/Excel de SGA: propietarios, viviendas, inquilinos, contratos, alquileres, pagos, movimientos, facturas/resguardos, BETA/SIGMA, usuarios | No iniciar Hito 7 (migración) sin esta exportación; diseñar importadores genéricos por entidad mientras tanto | Pendiente |
| 9 | Reglas fiscales uruguayas no contenidas en el manual SGA (tasas IRPF/IRNR vigentes, topes, condiciones de exoneración) | TAX-001 a 005 (8.8) | Confirmación de tasas y reglas vigentes por un responsable fiscal | `tax_profiles` parametrizado y versionado por vigencia, sin tasas *hardcodeadas*; valores de ejemplo solo en seed de demo, claramente marcados como no oficiales | Pendiente |
| 10 | Diferencia funcional exacta entre los atajos `Ctrl+J` y `Ctrl+U` (el manual SGA repite "movimientos de alquiler" para ambos) | 8.13 | Confirmación con un usuario operador de SGA | Implementar ambos atajos apuntando a la misma pantalla de consulta hasta aclarar la diferencia; documentar la ambigüedad en la ayuda contextual | Pendiente |

## Impacto si no se resuelven antes de V1

- **Bloquean "Completo" en la matriz de paridad SGA** (spec, sección 20)
  para BETA/SIGMA y ANDA/CGN — esas filas quedan como "dominio completo,
  exportador/integración sujeta a muestra oficial", nunca como paridad
  100% cerrada.
- **No bloquean** el resto del producto: propietarios, propiedades,
  contratos, cobros, recibos, movimientos, comisiones, facturación manual,
  gestión patrimonial y reporting pueden completarse sin estos datos.
- El punto 9 (tasas fiscales) es el de mayor riesgo legal si se asumen
  valores incorrectos como definitivos — por eso el requisito no
  negociable de `CLAUDE.md` de nunca codificar tasas fiscales en el código.

## Cómo pedir lo que falta

Para cada ítem, la forma más rápida de destrabarlo es que el responsable
funcional entregue uno de estos artefactos:

1. Un archivo real (o anonimizado) generado por el sistema/proceso actual.
2. Un documento de especificación oficial (DGI, ANDA, CGN, proveedor de
   facturación electrónica, proveedor de UI/tipo de cambio).
3. Una decisión explícita cuando se trata de una elección de política
   interna (por ejemplo, qué tipo de cambio usar por defecto).
