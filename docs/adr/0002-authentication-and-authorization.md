# ADR 0002 — Autenticación y autorización

## Estado

Aceptado — 2026-08-01.

## Contexto

El spec exige SSO/MFA corporativo vía Microsoft Entra ID con OpenID
Connect (secciones 4.2 y 18.1), un modelo RBAC granular con al menos 9
roles (sección 5.2), permisos por acción y por alcance —familia, entidad,
portafolio o propiedad específica— (sección 5.3), y un portal separado y
limitado para el rol "Propietario externo".

## Decisión

- **Auth.js (NextAuth)** con el proveedor Microsoft Entra ID (OIDC) para
  autenticación de usuarios internos (staff de la organización
  administradora).
- **RBAC + ABAC por alcance**, implementado como autorización del lado
  servidor (nunca solo en la UI, regla no negociable de sección 18.1):
  - Tabla `roles` con los 9 roles mínimos de la sección 5.2 como seed, y
    tabla `permissions` (recurso × acción: ver, crear, modificar borrador,
    confirmar, aprobar, revertir/anular, reabrir período, exportar,
    enviar comunicación).
  - Tabla `role_permissions` y tabla `user_scopes` para restringir un
    usuario a familias/entidades/propiedades específicas, con vigencia
    (`valid_from`/`valid_to`) igual que el resto de asignaciones
    sensibles del spec (sección 3.1).
  - El rol **Propietario externo** no usa RBAC interno: es una identidad
    separada (magic link o cuenta federada limitada) atada 1:1 a un
    `party_id` propietario, con acceso de solo lectura a sus propios
    inmuebles/documentos/liquidaciones vía un portal aislado de rutas.
- **Auditoría de sesión**: cada autorización denegada y cada acción
  sensible queda en `audit_log` con IP, sesión y `correlation_id`
  (sección 17).

## Alternativas consideradas

- Un único rol "admin todo-o-nada" con checks ad-hoc: descartado, no
  cumple sección 5.3 (permisos por acción y por alcance) ni la
  separación de roles exigida para contabilidad/fiscal vs. operación.
- Auth0/Okta: descartado porque el spec pide explícitamente Microsoft
  Entra ID como proveedor corporativo (ya usado para correo vía Microsoft
  Graph).

## Consecuencias

- `packages/auth` concentra proveedor OIDC, resolución de rol/alcance y
  helpers de autorización (`can(user, action, resource, scope)`)
  reutilizados por API y jobs en segundo plano.
- El portal de propietario externo se sirve desde rutas y layout propios,
  nunca reutilizando componentes que asuman permisos internos.
