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
  { resource: "property", action: "view", description: "Ver propiedades" },
  { resource: "property", action: "create", description: "Alta de propiedad" },
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
