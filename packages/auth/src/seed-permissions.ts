import { and, eq } from "drizzle-orm";
import { permissions, rolePermissions, type Database } from "@farfalla/database";

/**
 * Catálogo de permisos (spec, sección 5.3: recurso × acción). Se
 * completa hito a hito junto con cada dominio nuevo — no existe una
 * matriz cerrada de antemano en el spec (ver packages/auth/src/seed-roles.ts).
 */
export const PERMISSION_DEFINITIONS = [
  { resource: "owner", action: "view", description: "Ver propietarios" },
  { resource: "owner", action: "create", description: "Alta de propietario" },
  { resource: "owner", action: "edit", description: "Editar propietario" },
  { resource: "property", action: "view", description: "Ver propiedades" },
  { resource: "property", action: "create", description: "Alta de propiedad" },
  { resource: "property", action: "edit", description: "Editar propiedad" },
  { resource: "tenant", action: "view", description: "Ver inquilinos" },
  { resource: "tenant", action: "create", description: "Alta de inquilino" },
  { resource: "tenant", action: "edit", description: "Editar inquilino" },
  { resource: "lease", action: "view", description: "Ver contratos" },
  { resource: "lease", action: "create", description: "Alta de contrato" },
  { resource: "lease", action: "edit", description: "Editar contrato" },
  { resource: "charge", action: "view", description: "Ver cargos" },
  { resource: "charge", action: "create", description: "Generar cargos" },
  { resource: "payment", action: "create", description: "Registrar cobros" },
  { resource: "receipt", action: "reprint", description: "Reimprimir recibo" },
  { resource: "receipt", action: "reverse", description: "Anular recibo" },
  { resource: "ownership_interest", action: "view", description: "Ver participaciones" },
  { resource: "ownership_interest", action: "create", description: "Asignar participación" },
  { resource: "charge", action: "distribute", description: "Liquidar cargo a propietarios" },
  { resource: "tax_profile", action: "view", description: "Ver perfiles fiscales" },
  { resource: "tax_profile", action: "create", description: "Asignar perfil fiscal" },
  { resource: "owner_statement", action: "view", description: "Ver estado de cuenta de propietario" },
] as const;

export async function seedPermissions(db: Database) {
  await db.insert(permissions).values([...PERMISSION_DEFINITIONS]).onConflictDoNothing();
}

/**
 * Otorga (de forma idempotente) todos los permisos del catálogo actual a
 * un rol. Usado para el rol system_admin, que por definición tiene
 * "configuración completa" (spec, sección 5.2).
 */
export async function grantAllPermissionsToRole(db: Database, roleId: string) {
  const allPermissions = await db.select({ id: permissions.id }).from(permissions);

  for (const permission of allPermissions) {
    const [existing] = await db
      .select({ id: rolePermissions.id })
      .from(rolePermissions)
      .where(
        and(eq(rolePermissions.roleId, roleId), eq(rolePermissions.permissionId, permission.id)),
      );
    if (!existing) {
      await db.insert(rolePermissions).values({ roleId, permissionId: permission.id });
    }
  }
}
