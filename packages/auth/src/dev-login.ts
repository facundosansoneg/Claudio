import {
  organizations,
  users,
  userScopes,
  userIdentities,
  roles,
  withOrganizationContext,
  type Database,
} from "@farfalla/database";
import { and, eq } from "drizzle-orm";
import { ROLE_DEFINITIONS, seedRoles } from "./seed-roles";
import { grantAllPermissionsToRole, seedPermissions } from "./seed-permissions";

/** Debe coincidir con el "id" devuelto por el proveedor Credentials en config.ts. */
export const DEV_LOGIN_SUBJECT = "dev-login-demo-user";

const DEV_ORGANIZATION_ID = "00000000-0000-0000-0000-000000000001";

export interface SeedDevUserResult {
  organizationId: string;
  userId: string;
}

/**
 * Crea (de forma idempotente) una organización, un usuario y un rol de
 * administrador de sistema para poder probar el login y el dashboard sin
 * un App Registration real de Microsoft Entra ID. Pensado para
 * `pnpm run db:seed:dev` en un entorno de desarrollo local — nunca
 * correr contra una base de producción.
 */
export async function seedDevUser(db: Database): Promise<SeedDevUserResult> {
  return withOrganizationContext(db, DEV_ORGANIZATION_ID, async (tx) => {
    await tx
      .insert(organizations)
      .values({ id: DEV_ORGANIZATION_ID, name: "Farfalla Props Demo" })
      .onConflictDoNothing();

    await seedRoles(tx, DEV_ORGANIZATION_ID);
    await seedPermissions(tx);

    const adminRoleDefinition = ROLE_DEFINITIONS.find((role) => role.code === "system_admin");
    if (!adminRoleDefinition) throw new Error("no se encontró el rol system_admin en ROLE_DEFINITIONS");

    const [adminRole] = await tx
      .select({ id: roles.id })
      .from(roles)
      .where(
        and(eq(roles.organizationId, DEV_ORGANIZATION_ID), eq(roles.code, adminRoleDefinition.code)),
      );
    if (!adminRole) throw new Error("seedRoles no creó el rol system_admin");

    // Administrador del sistema = "configuración completa" (spec, sección
    // 5.2): tiene todos los permisos del catálogo actual.
    await grantAllPermissionsToRole(tx, adminRole.id);

    const [user] = await tx
      .insert(users)
      .values({
        organizationId: DEV_ORGANIZATION_ID,
        email: "demo@farfalla.uy",
        displayName: "Usuario de prueba",
      })
      .onConflictDoUpdate({
        target: [users.organizationId, users.email],
        set: { displayName: "Usuario de prueba" },
      })
      .returning({ id: users.id });
    if (!user) throw new Error("no se pudo crear/actualizar el usuario de prueba");

    // user_scopes no tiene un índice único (distintas vigencias pueden
    // coexistir a propósito, ver CLAUDE.md #4), así que onConflictDoNothing
    // no alcanza para que el seed sea idempotente: se verifica a mano.
    const [existingScope] = await tx
      .select({ id: userScopes.id })
      .from(userScopes)
      .where(and(eq(userScopes.userId, user.id), eq(userScopes.roleId, adminRole.id)));
    if (!existingScope) {
      await tx.insert(userScopes).values({
        organizationId: DEV_ORGANIZATION_ID,
        userId: user.id,
        roleId: adminRole.id,
        scopeType: "organization",
      });
    }

    await tx
      .insert(userIdentities)
      .values({
        organizationId: DEV_ORGANIZATION_ID,
        userId: user.id,
        externalAuthSubject: DEV_LOGIN_SUBJECT,
      })
      .onConflictDoUpdate({
        target: [userIdentities.externalAuthSubject],
        set: { userId: user.id, organizationId: DEV_ORGANIZATION_ID },
      });

    return { organizationId: DEV_ORGANIZATION_ID, userId: user.id };
  });
}
