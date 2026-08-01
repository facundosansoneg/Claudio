import type { NextAuthConfig } from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";

export interface AuthEnv {
  AUTH_SECRET: string;
  AUTH_MICROSOFT_ENTRA_ID_ID: string;
  AUTH_MICROSOFT_ENTRA_ID_SECRET: string;
  AUTH_MICROSOFT_ENTRA_ID_TENANT_ID: string;
}

/**
 * Config de Auth.js con Microsoft Entra ID (OIDC) como único proveedor
 * (ADR 0002). Requiere un App Registration real en Entra ID — hasta
 * tenerlo, `AUTH_MICROSOFT_ENTRA_ID_*` quedan vacías y el login no
 * funciona, pero el resto de la app (RBAC, RLS, dominio) es testeable
 * igual sin depender de credenciales de Azure reales.
 */
export function buildAuthConfig(env: AuthEnv): NextAuthConfig {
  return {
    secret: env.AUTH_SECRET,
    session: { strategy: "jwt" },
    providers: [
      MicrosoftEntraID({
        clientId: env.AUTH_MICROSOFT_ENTRA_ID_ID,
        clientSecret: env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
        issuer: `https://login.microsoftonline.com/${env.AUTH_MICROSOFT_ENTRA_ID_TENANT_ID}/v2.0`,
      }),
    ],
    callbacks: {
      // El "oid" (object id) de Entra ID es el identificador estable que
      // usamos para resolver `users.external_auth_subject` (ver
      // packages/database/src/schema/users.ts).
      async jwt({ token, profile }) {
        if (profile && typeof profile === "object" && "oid" in profile) {
          token.externalAuthSubject = (profile as { oid?: string }).oid;
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
