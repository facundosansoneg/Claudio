# ADR 0004 — Cola persistente y procesos en segundo plano

## Estado

Aceptado — 2026-08-01.

## Contexto

La sección 15 exige jobs persistentes, reintentables e idempotentes para
generación mensual de cargos, reajustes, actualización de UI/tipo de
cambio, recordatorios, generación de PDF/DOCX, envío de correo, reportes,
control de vencimientos, importación bancaria, conciliación sugerida,
facturas recurrentes y backups. Cada job debe registrar inicio, fin,
parámetros, resultado, errores, reintentos y usuario/regla que lo originó
(regla no negociable de auditoría, sección 17).

## Decisión

Usar **pg-boss** (cola de trabajos respaldada por PostgreSQL) en lugar de
una cola separada basada en Redis.

Razones:

- Reutiliza la misma base PostgreSQL que ya es requisito del proyecto
  (sección 4.2), evitando una pieza de infraestructura adicional (Redis)
  solo para encolar trabajos.
- Los jobs quedan en la misma transacción/backup que el resto de los
  datos: un restore de base de datos (sección 18.2, requisito no
  funcional) recupera también la cola, algo relevante porque varios jobs
  son financieros (generación de cargos, reajustes, facturas recurrentes).
- Soporta reintentos, backoff, jobs programados (cron) y jobs
  singleton/idempotentes de forma nativa, que es exactamente lo que pide
  la sección 15.
- `apps/worker` corre pg-boss como proceso separado de `apps/web`,
  respetando el diagrama de arquitectura de la sección 4.1.

Cada tipo de job registra su ejecución en una tabla `job_runs` (inicio,
fin, parámetros, resultado, errores, reintentos, usuario o regla que lo
originó), independiente de la tabla interna de pg-boss, para que la
auditoría funcional no dependa de un detalle de implementación de la
cola.

## Alternativas consideradas

- **BullMQ + Redis**: más rápido para colas de alto volumen, pero suma una
  pieza de infraestructura sin necesidad a esta escala (40+ inmuebles) y
  separa el estado de los jobs del backup transaccional de Postgres.
- Cron simple sin cola: descartado, no da reintentos, idempotencia ni
  trazabilidad por ejecución.

## Consecuencias

- A escalas mucho mayores (miles de organizaciones) podría requerirse
  revisar esta decisión; no es un riesgo a la escala inicial documentada
  en la sección 2.
