# ADR 0003 — Almacenamiento de archivos

## Estado

Aceptado — 2026-08-01.

## Contexto

El spec exige object storage compatible con S3 (sección 4.2), URLs
temporales para documentos (sección 18.1) y versionado de documentos y
plantillas (secciones 7.12, 8.11). Los archivos involucrados incluyen:
fotos de propiedades y órdenes de trabajo, documentos de garantías,
contratos generados (DOCX/PDF), recibos y liquidaciones en PDF, archivos
BETA/SIGMA, respaldos de exoneración y comparables.

## Decisión

Usar almacenamiento **compatible con S3** a través de una interfaz propia
en `packages/documents` (`StorageAdapter`), con dos implementaciones:

- Desarrollo/CI: MinIO local (vía Docker), sin dependencias externas.
- Staging/producción: proveedor S3-compatible a definir por infraestructura
  (AWS S3 u otro), configurado por variables de entorno — no hardcodeado.

Cada archivo se registra en `documents` con hash de contenido, versión,
tipo, entidad vinculada, fecha de vencimiento (cuando aplica) y
visibilidad. El acceso siempre pasa por URLs firmadas de vida corta
generadas por el adapter, nunca por rutas públicas directas.

## Alternativas consideradas

- Almacenamiento en base de datos (bytea): descartado por volumen (fotos,
  PDFs) y porque complica backups/rendimiento (sección 18.3).
- Filesystem local persistente: descartado, no sobrevive a despliegues
  sin estado ni escala a múltiples instancias del worker.

## Consecuencias

- Ningún paquete de dominio (`accounting`, `domain`, `reporting`) conoce
  el proveedor de storage concreto; todos pasan por
  `packages/documents`.
- El cambio de proveedor S3 en el futuro no requiere tocar lógica de
  negocio, solo configuración del adapter.
