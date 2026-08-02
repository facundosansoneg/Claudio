import { and, eq, gte, isNull, lte, or } from "drizzle-orm";
import {
  roles,
  userIdentities,
  userScopes,
  users,
  withOrganizationContext,
  type Database,
} from "@farfalla/database";

export interface UserRoleAssignment {
  roleCode: string;
  roleName: string;
  scopeType: string;
  scopeId: string | null;
}

export interface UserContext {
  userId: string;
  organizationId: string;
  email: string;
  displayName: string;
  roles: UserRoleAssignment[];
}

/**
 * Resuelve el contexto completo de un usuario a partir del "oid" de
 * Entra ID. Primer paso (fuera de RLS): encontrar su organización en
 * `user_identities`, la única tabla sin RLS de todo el esquema de
 * usuarios (ver packages/database/src/schema/user-identities.ts).
 * Segundo paso: recién con esa organización abrir
 * withOrganizationContext() y leer todo lo demás bajo RLS normal.
 */
export async function resolveUserContext(
  db: Database,
  externalAuthSubject: string,
  asOf: Date = new Date(),
): Promise<UserContext | null> {
  const [identity] = await db
    .select({ organizationId: userIdentities.organizationId, userId: userIdentities.userId })
    .from(userIdentities)
    .where(eq(userIdentities.externalAuthSubject, externalAuthSubject));

  if (!identity) return null;

  const asOfDate = asOf.toISOString().slice(0, 10);

  return withOrganizationContext(db, identity.organizationId, async (tx) => {
    const [user] = await tx.select().from(users).where(eq(users.id, identity.userId));
    if (!user) return null;

    const assignments = await tx
      .select({
        roleCode: roles.code,
        roleName: roles.name,
        scopeType: userScopes.scopeType,
        scopeId: userScopes.scopeId,
      })
      .from(userScopes)
      .innerJoin(roles, eq(roles.id, userScopes.roleId))
      .where(
        and(
          eq(userScopes.userId, user.id),
          lte(userScopes.validFrom, asOfDate),
          or(isNull(userScopes.validTo), gte(userScopes.validTo, asOfDate)),
        ),
      );

    return {
      userId: user.id,
      organizationId: identity.organizationId,
      email: user.email,
      displayName: user.displayName,
      roles: assignments,
    };
  });
}
