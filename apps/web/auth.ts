import NextAuth from "next-auth";
import { buildAuthConfig } from "@farfalla/auth";

export const { handlers, auth, signIn, signOut } = NextAuth(
  buildAuthConfig({
    AUTH_SECRET: process.env.AUTH_SECRET ?? "",
    AUTH_MICROSOFT_ENTRA_ID_ID: process.env.AUTH_MICROSOFT_ENTRA_ID_ID ?? "",
    AUTH_MICROSOFT_ENTRA_ID_SECRET: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET ?? "",
    AUTH_MICROSOFT_ENTRA_ID_TENANT_ID: process.env.AUTH_MICROSOFT_ENTRA_ID_TENANT_ID ?? "",
  }),
);
