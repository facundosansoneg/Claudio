import type { NextAuthConfig } from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import Credentials from "next-auth/providers/credentials";
import { DEV_LOGIN_SUBJECT } from "./dev-login";

export interface AuthEnv {
  AUTH_SECRET: string;
  AUTH_MICROSOFT_ENTRA_ID_ID: string;
  AUTH_MICROSOFT_ENTRA_ID_SECRET: string;
  AUTH_MICROSOFT_ENTRA_ID_TENANT_ID: string;
  /**
   * Habilita un proveedor de login de prueba que no depende de Entra ID
   * (ver dev-login.ts). SOLO para desarrollo local: nunca debe estar en
   * "true" en un entorno accesible públicamente, porque deja entrar sin
   * verificar contraseña ni identidad real.
   */
  AUTH_ENABLE_DEV_LOGIN?: string;
}

/**
 * Config de Auth.js. Microsoft Entra ID (OIDC) es el proveedor real
 * (ADR 0002) y requiere un App Registration en Azure — hasta tenerlo,
 * `AUTH_MICROSOFT_ENTRA_ID_*` quedan vacías y ese botón no funciona.
 * Para poder probar el resto del sistema (RBAC, RLS, auditoría) sin
 * Azure, `AUTH_ENABLE_DEV_LOGIN=true` agrega un segundo proveedor de
 * solo-desarrollo que inicia sesión como el usuario sembrado por
 * `pnpm run db:seed:dev` (ver dev-login.ts) sin pedir contraseña.
 */
export function buildAuthConfig(env: AuthEnv): NextAuthConfig {
  const devLoginEnabled = env.AUTH_ENABLE_DEV_LOGIN === "true";

  return {
    secret: env.AUTH_SECRET,
    session: { strategy: "jwt" },
    providers: [
      MicrosoftEntraID({
        clientId: env.AUTH_MICROSOFT_ENTRA_ID_ID,
        clientSecret: env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
        issuer: `https://login.microsoftonline.com/${env.AUTH_MICROSOFT_ENTRA_ID_TENANT_ID}/v2.0`,
      }),
      ...(devLoginEnabled
        ? [
            Credentials({
              id: "dev-login",
              name: "Login de prueba (sin Azure)",
              credentials: {},
              async authorize() {
                // No valida contraseña a propósito: existe solo para
                // probar el sistema localmente sin un App Registration
                // real. buildAuthConfig() ya impide habilitarlo salvo
                // que AUTH_ENABLE_DEV_LOGIN="true" esté seteado a mano.
                return {
                  id: DEV_LOGIN_SUBJECT,
                  name: "Usuario de prueba",
                  email: "demo@farfalla.uy",
                };
              },
            }),
          ]
        : []),
    ],
    callbacks: {
      // El "oid" (object id) de Entra ID, o el id fijo del login de
      // prueba, es el identificador estable que usamos para resolver
      // `user_identities.external_auth_subject` (ver
      // packages/database/src/schema/user-identities.ts).
      async jwt({ token, profile, user }) {
        if (profile && typeof profile === "object" && "oid" in profile) {
          token.externalAuthSubject = (profile as { oid?: string }).oid;
        } else if (user?.id) {
          token.externalAuthSubject = user.id;
        }
        return token;
      },
      async session({ session, token }) {
        if (token.externalAuthSubject) {
          session.externalAuthSubject = token.externalAuthSubject as string;
        }
        return session;
      },
    },
  };
}
