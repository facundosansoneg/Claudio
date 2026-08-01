import { and, eq, gte, isNull, lte, or } from "drizzle-orm";
import {
  permissions,
  rolePermissions,
  roles,
  userScopes,
  withOrganizationContext,
  type Database,
} from "@farfalla/database";

export interface AuthorizationScope {
  type: "organization" | "family" | "party" | "property";
  id?: string;
}

export interface AuthorizeInput {
  userId: string;
  organizationId: string;
  resource: string;
  action: string;
  scope: AuthorizationScope;
  /** Fecha de evaluación (por defecto, hoy) — permite probar vigencias. */
  asOf?: Date;
}

/**
 * Autorización del lado servidor (spec, sección 18.1: "nunca solo en la
 * UI"). Devuelve true si el usuario tiene, a la fecha `asOf`, un
 * user_scope vigente cuyo rol tiene el permiso (resource, action)
 * vigente, y cuyo alcance cubre el alcance solicitado.
 *
 * Cobertura de alcance V1 (sin jerarquía implícita todavía, ver ADR
 * 0002): un scope de tipo "organization" autoriza cualquier alcance
 * dentro de la organización; cualquier otro tipo debe coincidir
 * exactamente en tipo e id.
 */
export async function can(db: Database, input: AuthorizeInput): Promise<boolean> {
  const asOf = (input.asOf ?? new Date()).toISOString().slice(0, 10);

  // Las tablas involucradas tienen RLS forzada por organización (ADR
  // 0006): sin este contexto, la policy no ve ninguna fila y can()
  // devolvería siempre false sin importar los permisos reales.
  const rows = await withOrganizationContext(db, input.organizationId, (tx) =>
    tx
      .select({ scopeType: userScopes.scopeType, scopeId: userScopes.scopeId })
      .from(userScopes)
      .innerJoin(roles, eq(roles.id, userScopes.roleId))
      .innerJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
      .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
      .where(
        and(
          eq(userScopes.userId, input.userId),
          eq(userScopes.organizationId, input.organizationId),
          eq(permissions.resource, input.resource),
          eq(permissions.action, input.action),
          lte(userScopes.validFrom, asOf),
          or(isNull(userScopes.validTo), gte(userScopes.validTo, asOf)),
          lte(rolePermissions.validFrom, asOf),
          or(isNull(rolePermissions.validTo), gte(rolePermissions.validTo, asOf)),
        ),
      ),
  );

  return rows.some(
    (row) =>
      row.scopeType === "organization" ||
      (row.scopeType === input.scope.type && row.scopeId === (input.scope.id ?? null)),
  );
}
