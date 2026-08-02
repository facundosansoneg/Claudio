import { roles, type Database } from "@farfalla/database";

/**
 * Los 9 roles mínimos del spec (sección 5.2). El detalle fino de qué
 * permiso tiene cada rol (role_permissions) no está especificado en el
 * spec como una matriz cerrada — se completa hito a hito, a medida que
 * cada dominio define sus recursos y acciones concretas, en vez de
 * inventar ahora una matriz completa sin base funcional.
 */
export const ROLE_DEFINITIONS = [
  { code: "system_admin", name: "Administrador del sistema" },
  { code: "portfolio_director", name: "Director patrimonial" },
  { code: "property_manager", name: "Gestor de propiedades" },
  { code: "treasury", name: "Tesorería/cobranzas" },
  { code: "accounting_tax", name: "Contabilidad/fiscal" },
  { code: "operator", name: "Operador" },
  { code: "viewer", name: "Consulta" },
  { code: "external_owner", name: "Propietario externo" },
  { code: "auditor", name: "Auditor" },
] as const;

export async function seedRoles(db: Database, organizationId: string) {
  await db
    .insert(roles)
    .values(
      ROLE_DEFINITIONS.map((role) => ({
        organizationId,
        code: role.code,
        name: role.name,
      })),
    )
    .onConflictDoNothing();
}
