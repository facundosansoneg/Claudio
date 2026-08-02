# ADR 0001 — ORM y acceso a base de datos

## Estado

Aceptado — 2026-08-01.

## Contexto

El spec (sección 4.2) exige elegir entre Prisma o Drizzle y documentar la
decisión. El dominio requiere: `NUMERIC` de precisión arbitraria para
dinero/porcentajes/tasas (sección 3.2, regla no negociable), migraciones
versionadas y revisables, soporte para vigencias (`valid_from`/`valid_to`)
y para un ledger inmutable con muchas tablas de dimensión.

## Decisión

Usar **Drizzle ORM** con `drizzle-kit` para migraciones, sobre PostgreSQL.

Razones:

- Los tipos `numeric` de Drizzle mapean a `string` en TypeScript por
  defecto, lo que evita que un desarrollador reintroduzca `float` sin
  querer al leer un importe (riesgo real en Prisma, donde `Decimal` es un
  tipo aparte fácil de convertir a `number` por descuido).
- Las migraciones de Drizzle son SQL plano generado y editable, más fácil
  de auditar en `docs/adr/` y en code review para un dominio contable donde
  cada migración debe revisarse con cuidado (regla no negociable: períodos
  cerrados no admiten contabilizaciones sin reapertura autorizada).
- Consultas relacionales explícitas (sin "magia" de resolución automática)
  facilitan aplicar la separación operación/fiscalidad y las dimensiones
  del ledger (`journal_lines` con familia, propietario, propiedad, unidad,
  contrato, inquilino, proveedor) sin N+1 ocultos.
- Menor overhead en runtime para reportes pesados (sección 18.3,
  rendimiento).

## Alternativas consideradas

- **Prisma**: mejor DX y ecosistema más maduro, pero el modelo de tipos
  para `Decimal` y la generación de cliente binaria añaden fricción para
  un dominio donde "nunca uses `float` para dinero" es una regla dura.

## Consecuencias

- El equipo escribe más SQL explícito en queries complejas (reportes,
  agregaciones patrimoniales) — aceptable porque esas queries deben ser
  auditables de todos modos.
- `packages/database` concentra el schema Drizzle, las migraciones y los
  helpers de acceso; ningún otro paquete accede a Postgres directamente.
