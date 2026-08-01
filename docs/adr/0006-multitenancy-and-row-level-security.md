# ADR 0006 — Estrategia multitenant y autorización a nivel de fila

## Estado

Aceptado — 2026-08-01.

## Contexto

El spec modela una jerarquía patrimonial
`Organización → Familia → Entidad propietaria → Propiedad → Unidad → Contrato`
(sección 5.1) y exige "separación por organización y familia" y
"protección contra acceso directo por ID" como requisitos de seguridad no
funcionales (sección 18.1). El sistema debe soportar que una organización
administre varios grupos familiares, y que usuarios (incluido el rol
Propietario externo) queden restringidos a un subconjunto de
familias/entidades/propiedades (sección 5.3).

## Decisión

- **Single database, single schema, tenant por columna**: toda tabla de
  dominio lleva `organization_id` (y, cuando aplica, `family_id`)
  heredado de forma consistente, en vez de esquemas o bases separadas por
  organización. A esta escala (una organización administradora inicial,
  con posibilidad de más en el futuro) un esquema compartido es más simple
  de operar, migrar y respaldar, y no compromete el aislamiento si se
  refuerza con RLS.
- **Row-Level Security (RLS) de PostgreSQL como defensa en profundidad**:
  cada tabla con `organization_id` tiene una policy RLS que exige que
  `organization_id` coincida con el `organization_id` de la sesión actual
  (seteado vía `SET LOCAL app.current_organization_id` al abrir cada
  request/job). La autorización de negocio (rol, alcance de
  familia/propiedad, acción permitida) se resuelve en la capa de
  aplicación (ADR 0002); RLS es la última barrera si esa capa falla o si
  alguien accede a la base directamente.
- **IDs no adivinables**: usar UUID v7 (u otro identificador no
  secuencial) como clave primaria pública en URLs y API, para cumplir
  "protección contra acceso directo por ID" sin depender solo de RLS.

## Alternativas consideradas

- **Esquema por organización**: mejor aislamiento teórico, pero migra y
  opera peor a esta escala (migraciones × N esquemas, backups más
  complejos) y el spec no pide aislamiento físico, solo lógico.
- **Solo autorización de aplicación, sin RLS**: descartado — un bug de
  autorización o una query directa (reporte ad-hoc, script de soporte)
  podría filtrar datos entre organizaciones/familias, algo inaceptable
  para datos patrimoniales y fiscales.

## Consecuencias

- Toda migración que agregue una tabla de dominio debe agregar también su
  policy RLS correspondiente; esto se documenta como checklist en
  `docs/implementation-plan.md`.
- Los jobs en segundo plano (worker) deben setear el contexto de
  organización explícitamente antes de tocar datos, igual que las
  requests HTTP.
