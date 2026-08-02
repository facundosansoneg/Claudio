# ADR 0005 — Generación de documentos (DOCX/PDF) y correo

## Estado

Aceptado — 2026-08-01.

## Contexto

La sección 8.11 (DOC-001) exige generar DOCX y PDF desde plantillas con
variables (`{{owner.display_name}}`, etc.), conservando versión de
plantilla y de documento generado. La sección 8.11 (EMAIL-001 a 006)
exige envío desde cuentas corporativas Microsoft 365 vía Microsoft Graph,
con historial de entrega (destinatarios, asunto, plantilla, adjuntos,
usuario, fecha, estado, error, reintentos).

## Decisión

- **Plantillas DOCX → DOCX/PDF**: `docxtemplater` para inyectar variables
  en plantillas `.docx` reales (contratos, adendas), seguido de
  conversión a PDF mediante un servicio LibreOffice headless
  (`libreoffice --headless --convert-to pdf`) ejecutado en el worker, para
  preservar el formato exacto del documento legal.
- **Plantillas HTML → PDF**: para recibos, liquidaciones y reportes
  (documentos generados por el propio sistema, no plantillas legales
  externas), usar HTML/CSS renderizado a PDF con Chromium headless
  (Playwright), que es más simple de mantener y versionar en el repo.
- **Correo**: Microsoft Graph API (`/sendMail` y `/me/sendMail` según la
  cuenta autorizada del operador), con cada envío registrado en
  `email_deliveries` (destinatarios, asunto, plantilla usada, adjuntos,
  usuario, fecha, estado, error, reintentos), cumpliendo EMAIL-005.
- Toda generación y todo envío corren en `apps/worker` como jobs de
  pg-boss (ADR 0004), nunca de forma síncrona en la request HTTP, para
  cumplir el requisito de rendimiento de la sección 18.3.

## Alternativas consideradas

- Generar PDF directamente desde DOCX con una librería pura JS sin
  LibreOffice: descartado, la fidelidad de formato para contratos legales
  (tablas, estilos, numeración) es insuficiente.
- SendGrid/SES para correo: descartado, el spec pide explícitamente
  cuentas corporativas Microsoft 365 vía Graph, con historial de entrega
  atado a la cuenta real del operador (EMAIL-001).

## Consecuencias

- El worker necesita LibreOffice instalado en su imagen de contenedor;
  documentar esto en el Dockerfile de `apps/worker` cuando se haga el
  bootstrap (Hito 1).
- `packages/documents` expone una interfaz única
  (`renderTemplate`, `convertToPdf`) para que el dominio no dependa de la
  librería concreta.
