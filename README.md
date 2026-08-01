# Farfalla Asset & Property Management

Sistema web de administración y gestión patrimonial inmobiliaria. La
especificación funcional completa está en
[`PROPERTY_ASSET_MANAGEMENT_MASTER_SPEC.md`](./PROPERTY_ASSET_MANAGEMENT_MASTER_SPEC.md);
las reglas no negociables del proyecto están en [`CLAUDE.md`](./CLAUDE.md).

## Estado

Hito 1 (Fundación) — ver [`docs/implementation-plan.md`](./docs/implementation-plan.md)
y los issues del repo para el detalle por hito.

## Estructura

```text
/apps
  /web      Next.js (App Router) — UI + API routes
  /worker   Jobs en segundo plano (pg-boss)
/packages
  /database RBAC/schema Drizzle, migraciones, RLS, auditoría
  /auth     Auth.js + Microsoft Entra ID, autorización RBAC
  /documents Adapter de almacenamiento S3-compatible
/docs       Plan de implementación, ADR, modelo de datos, decisiones abiertas
```

## Requisitos

- Node.js 20+
- pnpm 10+ (`corepack enable` si no lo tenés)
- PostgreSQL 16 (local o vía `docker compose up postgres`)
- MinIO para probar almacenamiento localmente (`docker compose up minio`)

## Setup local

```bash
cp .env.example .env.local   # completar valores reales
pnpm install
pnpm --filter @farfalla/database run migrate
pnpm run dev   # o: pnpm --filter @farfalla/web run dev
```

Sin credenciales reales de Microsoft Entra ID (`AUTH_MICROSOFT_ENTRA_ID_*`
en `.env.example`), el login no funciona, pero el resto del sistema
(RBAC, RLS, base de datos, storage) es completamente testeable sin ellas —
ver `docs/adr/0002-authentication-and-authorization.md` y
`docs/open-decisions.md`.

## Comandos

```bash
pnpm run lint        # todos los paquetes
pnpm run typecheck   # todos los paquetes
pnpm run test        # pruebas de integración contra Postgres real
pnpm run build       # build de producción de apps/web
pnpm run db:generate # genera una migración a partir del schema
pnpm run db:migrate  # aplica migraciones pendientes
```

Las pruebas son de integración real (no mocks) contra una base
PostgreSQL: por defecto usan `postgres://farfalla:farfalla@localhost:5432/farfalla_test`,
configurable con `TEST_DATABASE_URL`. `packages/documents` prueba su
adapter de storage contra un servidor S3-compatible en memoria
(`s3rver`), sin depender de Docker/MinIO para correr en CI.

## CI

`.github/workflows/ci.yml` corre lint, chequeo de tipos, migraciones,
pruebas y build en cada push/PR, con un servicio PostgreSQL efímero.
