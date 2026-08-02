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
en `.env.example`), el botón de login con Microsoft no funciona — ver
"Probar sin Azure" abajo para probar todo lo demás sin necesitar esas
credenciales.

## Probar sin Azure

No hace falta registrar la app en Microsoft Entra ID para ver el sistema
funcionando. Con Postgres corriendo (`docker compose up postgres` o una
instancia local):

```bash
pnpm install
pnpm run db:migrate
pnpm run db:seed:dev          # crea una organización y un usuario demo
AUTH_ENABLE_DEV_LOGIN=true pnpm --filter @farfalla/web run dev
```

Abrí `http://localhost:3000`: además del botón de Microsoft vas a ver
"Login de prueba (sin Azure)". Con eso entrás como el usuario demo
(`demo@farfalla.uy`, rol Administrador del sistema) y el dashboard
muestra datos reales leídos de Postgres — organización, rol y alcance —
sin haber tocado Azure.

`AUTH_ENABLE_DEV_LOGIN=true` **solo debe usarse en desarrollo local**:
deja entrar sin verificar contraseña ni identidad real. `.env.example` lo
deja vacío por defecto a propósito; nunca ponerlo en `true` en un entorno
accesible desde internet.

## Comandos

```bash
pnpm run lint        # todos los paquetes
pnpm run typecheck   # todos los paquetes
pnpm run test        # pruebas de integración contra Postgres real
pnpm run build       # build de producción de apps/web
pnpm run db:generate # genera una migración a partir del schema
pnpm run db:migrate  # aplica migraciones pendientes
pnpm run db:seed:dev # crea el usuario demo para el login de prueba (ver abajo)
```

Las pruebas son de integración real (no mocks) contra una base
PostgreSQL: por defecto usan `postgres://farfalla:farfalla@localhost:5432/farfalla_test`,
configurable con `TEST_DATABASE_URL`. `packages/documents` prueba su
adapter de storage contra un servidor S3-compatible en memoria
(`s3rver`), sin depender de Docker/MinIO para correr en CI.

## CI

`.github/workflows/ci.yml` corre lint, chequeo de tipos, migraciones,
pruebas y build en cada push/PR, con un servicio PostgreSQL efímero.
